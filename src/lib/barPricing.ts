/**
 * The bar-stocking pricing path (Alcohol Discovery, 2026-06-15) — Summit's
 * THIRD pricing mode, distinct from the two in catalog.ts:
 *
 *   fixed-price  → known amount, auto-confirms + tab line on completion
 *   QUOTE        → operator types a total, guest re-approves (the quote-wait)
 *   fee-structure → the bar: NEITHER. The guest approves the disclosed fee
 *                   SHAPE on the confirm surface (not a fixed total, no
 *                   quote-wait); a human curates the bottles, and ops prices
 *                   the order against this config. The bottles (pass-through
 *                   cost) + fees land on the running tab like any other line.
 *
 * Storage trick (no schema migration on the shared dev/prod DB): the service
 * row carries priceUnit QUOTE + null amount (so it completes to READY, never
 * auto-bills), and THIS module's `isFeeStructureService` is the discriminator
 * everywhere the operator action diverges (BarPriceForm, not QuoteForm; bar
 * never enters QUOTED). The "config in code" doctrine (serviceForm / intake).
 *
 * Client-safe (no `server-only`): the wizard imports the disclosure + cadence
 * helpers directly. Plain data + pure functions only.
 */

import { formatMoney } from "./money";
import type { StayPhase } from "./stayPhase";

export const BAR_STOCKING_SLUG = "bar-stocking";

/** Is this the fee-structure path? (Currently the bar; generalize to a set
 *  if a second fee-structure service ever lands.) */
export function isFeeStructureService(slug: string | null | undefined): boolean {
  return slug === BAR_STOCKING_SLUG;
}

/**
 * The tunable knobs — CONFIG, not hardcoded (Parker tunes later). Markup and
 * rush are basis points (2000 = 20%); the floor is the same-day pre-fee
 * minimum; the cutoff is the property-local hour after which "tonight" becomes
 * "first thing tomorrow". Conservative defaults from the spec.
 */
export const BAR_PRICING = {
  markupBps: 2000, // 20% base service fee on every order
  rushBps: 5000, // +50% same-day rush — a real drop-everything service (milk)
  floorCents: 25000, // $250 same-day MINIMUM CHARGE (post-fee) — what we disclose
  sameDayCutoffHour: 14, // 2pm property-local — past it, no same-day promise
  // DABS gate: Utah state liquor stores are closed Sundays, so no same-day run
  // then (it degrades to the first open day). Operational + config-tunable; a
  // future on-hand stock would bypass this. Weekday via Intl en-US "short".
  closedDays: ["Sun"] as readonly string[],
} as const;

/** Axis B (the spec): planned rides the put-away; same-day carries rush + floor. */
export type BarCadence = "PLANNED" | "SAME_DAY";

/** The property-local hour (0–23) at an instant — tz-correct, server clock. */
function localHour(now: Date, tz: string): number {
  return Number.parseInt(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      hour12: false,
    }).format(now),
    10,
  );
}

/** Past the same-day cutoff in property-local time? (Then "tonight" degrades.) */
export function pastSameDayCutoff(now: Date, tz: string): boolean {
  return localHour(now, tz) >= BAR_PRICING.sameDayCutoffHour;
}

/** Property-local weekday short name ("Sun", "Mon", …). */
function localWeekday(now: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now);
}

/** A day the supplier (DABS) is closed — no same-day run is possible. */
export function isClosedDay(now: Date, tz: string): boolean {
  return BAR_PRICING.closedDays.includes(localWeekday(now, tz));
}

/** Same-day is on the table only when the shops are open AND it's before cutoff. */
export function sameDayAvailable(now: Date, tz: string): boolean {
  return !isClosedDay(now, tz) && !pastSameDayCutoff(now, tz);
}

/**
 * Cadence is DERIVED, never asked (the spec): pre-arrival always rides the
 * grocery put-away (planned — premium in feel for a standalone order, but no
 * rush, there was lead time). In-stay is same-day only while the shops are open
 * and it's before the cutoff; otherwise it degrades gracefully to a planned
 * next-open-day run. Rush + floor fire only on the scarce thing — "it's 5pm, we
 * want margaritas by the hot tub tonight".
 */
export function barCadence(input: { phase: StayPhase; now: Date; tz: string }): BarCadence {
  if (input.phase !== "IN_STAY") return "PLANNED";
  return sameDayAvailable(input.now, input.tz) ? "SAME_DAY" : "PLANNED";
}

/**
 * The charge: pass-through bottle cost + the disclosed fees. Planned = cost ×
 * markup. Same-day = max(cost, floor) × markup × rush — the floor is pre-fee,
 * so a tiny same-day order still clears the minimum that makes the special run
 * worth it. Integer cents in, integer cents out.
 */
export function computeBarChargeCents(bottleCostCents: number, cadence: BarCadence): number {
  const { markupBps, rushBps, floorCents } = BAR_PRICING;
  const marked = bottleCostCents * (1 + markupBps / 10000);
  if (cadence !== "SAME_DAY") return Math.round(marked);
  // Same-day adds the rush; the floor is the real MINIMUM CHARGE (post-fee), so
  // "starts at $250" is literally what a guest pays — never an understated
  // pre-fee number. The rush dominates above ~$140 of bottles.
  const withRush = marked * (1 + rushBps / 10000);
  return Math.max(Math.round(withRush), floorCents);
}

/**
 * The disclosure shown on the bar's confirm surface — the fee SHAPE, not exact
 * percentages or a total (CLAUDE.md: amounts stay human-handled/unrendered,
 * the policy shape IS disclosed). Honest because discovery delivers exactly
 * what they wanted — that's what keeps the premium milk, not meat.
 */
export function describeBarFees(
  cadence: BarCadence,
  opts: { sameDayBlocked?: boolean } = {},
): string[] {
  if (cadence === "SAME_DAY") {
    return [
      "Your bottles, at our cost",
      "Plus our service, and a same-day rush — we drop everything to get it to you tonight",
      `Same-day starts at ${formatMoney(BAR_PRICING.floorCents)}`,
      "It all rides your tab — nothing to pay now",
    ];
  }
  const lines = [
    "Your bottles, at our cost",
    "Plus our service fee",
    "It all rides your tab — nothing to pay now",
  ];
  // In-stay, but the same-day run isn't on (after cutoff, or the shops are
  // closed today) — say so warmly instead of silently dropping it.
  if (opts.sameDayBlocked) {
    lines.unshift("Same-day's wrapped for today — we'll have it to you first thing");
  }
  return lines;
}

/** The value stored on the request so ops prices against the order-time
 *  cadence (not whenever they happen to open it). */
export function cadenceLabel(cadence: BarCadence): string {
  return cadence === "SAME_DAY" ? "Same-day" : "Planned";
}

/** Read the stored cadence label back (priceBarOrder). Defaults to planned. */
export function cadenceFromLabel(label: string | undefined): BarCadence {
  return label === "Same-day" ? "SAME_DAY" : "PLANNED";
}
