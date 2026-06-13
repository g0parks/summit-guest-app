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
