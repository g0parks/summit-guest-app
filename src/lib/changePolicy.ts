// NOTE: pure date math + a status check, no `server-only` (the stayPhase.ts
// precedent) — the change page (server) and its action both gate on these
// windows; keep one source of truth either could share with a client surface
// later. The RequestStatus import is type-only (erased at runtime).
import type { RequestStatus } from "@prisma/client";

/**
 * The change/cancel windows for an itinerary item (Menu Doctrine 2026-06-12):
 * per-service cutoffs decide what the app offers in-app. A null cutoff means
 * NO in-app option — concierge-only, by doctrine, not as a fallback. Past the
 * cutoff the guest gets the quiet escape hatch; fee shapes (free until X ·
 * fee inside X · illness waived) stay human-handled and are never rendered.
 *
 * A change also requires the linked request to be PRE-DELIVERY: a delivered
 * (COMPLETED) or otherwise terminal booking offers no in-app change even if
 * the clock window is still open (Product Doctrine 2026-06-13). Past current
 * time is already closed by the cutoff math below.
 */

export type ChangeWindows = { canMove: boolean; canCancel: boolean };

const HOUR = 60 * 60 * 1000;

/**
 * The lock window for a service with no cancel cutoff of its own: how long
 * before the service we consider the booking committed. ONE constant for two
 * jobs, so they can never disagree — it sets when a tab line becomes due to
 * charge (chargeDueAtFor below) and, in the booking floor, how close to the
 * service the app will still take a booking at all.
 */
export const DEFAULT_LOCK_HOURS = 24;

/**
 * When does this line become chargeable? DISPLAY/SORT ONLY — it orders the ops
 * charge queue and never triggers anything (money doctrine 2026-07-27: a human
 * taps every charge).
 *
 * Total by design — always returns a date, so no line can silently rot with no
 * due date. Dated work is due when it locks (its cancel cutoff, or the 24h
 * default); everything undated — an ops-priced grocery order, a custom-request
 * approval, a manual line — is due now, because the work is already happening.
 * Never earlier than `now`: a booking made inside its own lock window is due
 * immediately, not backdated.
 *
 * `requestedFor` is an absolute instant, so this is plain instant math — no
 * timezone conversion belongs here.
 */
export function chargeDueAtFor(input: {
  requestedFor: Date | null | undefined;
  cancelCutoffHours: number | null | undefined;
  now?: Date;
}): Date {
  const now = input.now ?? new Date();
  if (!input.requestedFor) return now;
  const lockHours = input.cancelCutoffHours ?? DEFAULT_LOCK_HOURS;
  const locksAt = input.requestedFor.getTime() - lockHours * HOUR;
  return locksAt > now.getTime() ? new Date(locksAt) : now;
}

/**
 * The booking floor: the service page promises "N days notice" off
 * `leadTimeHours`; this is the server-side gate that keeps that promise (the
 * vendor portals behind us enforce their own lead times — a booking inside
 * them is one we can't fulfil). Fee-structure services (grocery, bar) are
 * exempt: their timing is the rush/same-day logic in provisioningPricing.ts,
 * so they only refuse days already gone.
 */
export function meetsNotice(
  requestedFor: Date,
  leadTimeHours: number,
  now: Date = new Date(),
): boolean {
  return requestedFor.getTime() >= now.getTime() + leadTimeHours * HOUR;
}

/** "2 days notice" / "12h notice" — one label for the page and the error. */
export function noticeLabel(leadTimeHours: number): string {
  if (leadTimeHours >= 24) {
    const days = Math.round(leadTimeHours / 24);
    return `${days} day${days === 1 ? "" : "s"} notice`;
  }
  return `${leadTimeHours}h notice`;
}

/** The request states a guest can still change in-app: booked, not delivered. */
const CHANGEABLE_STATUSES: RequestStatus[] = ["CONFIRMED", "SCHEDULED"];

/** Is this request still pre-delivery (changeable in-app)? Null = no request. */
export function isChangeableStatus(status: RequestStatus | null | undefined): boolean {
  return status != null && CHANGEABLE_STATUSES.includes(status);
}

export function changeWindows(
  service:
    | { moveCutoffHours: number | null; cancelCutoffHours: number | null }
    | null
    | undefined,
  startsAt: Date,
  opts: { requestStatus?: RequestStatus | null; now?: Date } = {},
): ChangeWindows {
  const now = opts.now ?? new Date();
  // A linked request must be pre-delivery; an unlinked item has no service and
  // gets no window from the `!service` guard below regardless.
  if (opts.requestStatus != null && !isChangeableStatus(opts.requestStatus)) {
    return { canMove: false, canCancel: false };
  }
  if (!service) return { canMove: false, canCancel: false };
  const open = (cutoffHours: number | null) =>
    cutoffHours != null && now.getTime() < startsAt.getTime() - cutoffHours * HOUR;
  return {
    canMove: open(service.moveCutoffHours),
    canCancel: open(service.cancelCutoffHours),
  };
}
