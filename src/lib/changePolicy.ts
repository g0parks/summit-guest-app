// NOTE: pure date math, no `server-only` (the stayPhase.ts precedent) — the
// change page (server) and its action both gate on these windows; keep one
// source of truth either could share with a client surface later.

/**
 * The change/cancel windows for an itinerary item (Menu Doctrine 2026-06-12):
 * per-service cutoffs decide what the app offers in-app. A null cutoff means
 * NO in-app option — concierge-only, by doctrine, not as a fallback. Past the
 * cutoff the guest gets the quiet escape hatch; fee shapes (free until X ·
 * fee inside X · illness waived) stay human-handled and are never rendered.
 */

export type ChangeWindows = { canMove: boolean; canCancel: boolean };

const HOUR = 60 * 60 * 1000;

export function changeWindows(
  service:
    | { moveCutoffHours: number | null; cancelCutoffHours: number | null }
    | null
    | undefined,
  startsAt: Date,
  now = new Date(),
): ChangeWindows {
  if (!service) return { canMove: false, canCancel: false };
  const open = (cutoffHours: number | null) =>
    cutoffHours != null && now.getTime() < startsAt.getTime() - cutoffHours * HOUR;
  return {
    canMove: open(service.moveCutoffHours),
    canCancel: open(service.cancelCutoffHours),
  };
}
