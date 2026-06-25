/**
 * The PROVISIONING fee-structure pricing path (grocery + bar) — Summit's THIRD
 * pricing mode, distinct from the two in catalog.ts:
 *
 *   fixed-price   → known amount, auto-confirms + tab line on completion
 *   QUOTE         → operator types a total, guest re-approves (the quote-wait)
 *   FEE_STRUCTURE → grocery & bar: NEITHER. The cost isn't knowable until a
 *                   human shops the order, so there's nothing to quote. The
 *                   guest consents to a DISCLOSED cost-plus SCHEDULE on the
 *                   confirm screen (pass-through cost + a flat delivery fee + a
 *                   service fee % + a flat same-day rush). No quote-wait, no
 *                   second approval tap. The operator prices the curated order
 *                   against this config; cost (pass-through) + the fees land on
 *                   the running tab like any other line.
 *
 * `priceUnit === "FEE_STRUCTURE"` is the discriminator everywhere the operator
 * action diverges (ProvisioningPriceForm, not QuoteForm; it never enters
 * QUOTED). The fee amounts are tunable per-service columns (deliveryFeeCents /
 * serviceFeeBps / rushFeeCents on Service); cadence/cutoff/closed-day logic
 * stays here in code config. (Replaces the old QUOTE + null + slug-check hack
 * and the $250 same-day floor — both retired.)
 *
 * Client-safe (no `server-only`): the wizard imports the disclosure + cadence
 * helpers directly. Plain data + pure functions only.
 */

import type { PriceUnit } from "@prisma/client";
import { formatMoney } from "./money";
import type { StayPhase } from "./stayPhase";

export const BAR_STOCKING_SLUG = "bar-stocking";
export const GROCERY_SLUG = "grocery-pre-stock";

/** Is this the fee-structure pricing path? (grocery + bar today). */
export function isFeeStructureService(priceUnit: PriceUnit | null | undefined): boolean {
  return priceUnit === "FEE_STRUCTURE";
}

/** Tunable fee config — the three knobs read off the Service row. */
export type FeeConfig = {
  deliveryFeeCents: number;
  serviceFeeBps: number;
  rushFeeCents: number;
};

/**
 * Conservative cost-plus defaults (Comestibles-style), used when a Service
 * row leaves a fee column null. Parker tunes per-service in the DB; the seed
 * sets grocery + bar to $50 / 25% / $100.
 */
export const PROVISIONING_FEE_DEFAULTS: FeeConfig = {
  deliveryFeeCents: 5000, // $50 flat delivery / shopping fee
  serviceFeeBps: 2500, // 25% service fee on the pass-through cost
  rushFeeCents: 10000, // $100 flat same-day / late-order rush
};

/** Resolve a service's fee config — columns win, code defaults fill the gaps. */
export function resolveFeeConfig(service: {
  deliveryFeeCents: number | null;
  serviceFeeBps: number | null;
  rushFeeCents: number | null;
}): FeeConfig {
  return {
    deliveryFeeCents: service.deliveryFeeCents ?? PROVISIONING_FEE_DEFAULTS.deliveryFeeCents,
    serviceFeeBps: service.serviceFeeBps ?? PROVISIONING_FEE_DEFAULTS.serviceFeeBps,
    rushFeeCents: service.rushFeeCents ?? PROVISIONING_FEE_DEFAULTS.rushFeeCents,
  };
}

/** 2pm property-local — past it (in-stay), no same-day promise. */
export const SAME_DAY_CUTOFF_HOUR = 14;

/**
 * Days a supplier is closed for a same-day run, per service. DABS (Utah state
 * liquor stores) are shut Sundays, so alcohol has no same-day run then — it
 * degrades to the next open day. GROCERY stores are open Sundays (no gate).
 * Operational + tunable; a future on-hand stock would bypass this.
 */
export function closedDaysForService(slug: string | null | undefined): readonly string[] {
  return slug === BAR_STOCKING_SLUG ? ["Sun"] : [];
}

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
  return localHour(now, tz) >= SAME_DAY_CUTOFF_HOUR;
}

/** Property-local weekday short name ("Sun", "Mon", …). */
function localWeekday(now: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now);
}

/** A day the supplier is closed — no same-day run is possible. */
export function isClosedDay(now: Date, tz: string, closedDays: readonly string[]): boolean {
  return closedDays.includes(localWeekday(now, tz));
}

/** Same-day is on the table only when the supplier's open AND it's before cutoff. */
export function sameDayAvailable(now: Date, tz: string, closedDays: readonly string[]): boolean {
  return !isClosedDay(now, tz, closedDays) && !pastSameDayCutoff(now, tz);
}

/**
 * Is this a rush order? DERIVED, never asked. Pre-arrival always rides the
 * put-away (planned — there was lead time, so no rush). In-stay is a same-day
 * run only while the supplier's open and it's before the cutoff; otherwise it
 * degrades gracefully to a planned next-open-day run. The flat rush fee fires
 * only on the scarce thing — "it's 5pm, we want it tonight". Disclosed to the
 * guest as "same-day, or ordered after 8pm the night before" (the copy is the
 * honest superset; the derivation is conservative, in the guest's favor, and
 * the exact amount stays human-handled).
 */
export function isRushOrder(input: {
  phase: StayPhase;
  now: Date;
  tz: string;
  closedDays: readonly string[];
}): boolean {
  if (input.phase !== "IN_STAY") return false;
  return sameDayAvailable(input.now, input.tz, input.closedDays);
}

/**
 * The charge: pass-through cost + the disclosed fees. Planned = cost + flat
 * delivery + service% of cost. Rush adds the flat rush fee on top. No floor —
 * a small order pays its real cost + fees, nothing invented. Integer cents in,
 * integer cents out.
 */
export function computeFeeStructureChargeCents(
  costCents: number,
  fees: FeeConfig & { rush: boolean },
): number {
  const service = Math.round((costCents * fees.serviceFeeBps) / 10000);
  const rush = fees.rush ? fees.rushFeeCents : 0;
  return costCents + fees.deliveryFeeCents + service + rush;
}

/** Storable timing label so ops prices against the ORDER-time rush state. */
export function rushLabel(rush: boolean): string {
  return rush ? "Same-day rush" : "Planned";
}

/** Read the stored timing label back (priceProvisioningOrder). Defaults to planned. */
export function rushFromLabel(label: string | undefined): boolean {
  return label === "Same-day rush";
}

/**
 * Per-service guest copy for the fee-structure confirm + close screens. The
 * value leads (it's there, put away, before you arrive); cost is never the
 * headline (Parker, 2026-06-19). Bar and grocery only today.
 */
export function feeStructureCopy(slug: string | null | undefined): {
  noun: string;
  lead: string;
  closeDetail: string;
} {
  if (slug === BAR_STOCKING_SLUG) {
    return {
      noun: "bottles",
      lead: "A bar curated to your taste, put away before you pour",
      closeDetail:
        "Your concierge is curating the bottles. They'll be ready for you, on your tab just as we showed you. Nothing to approve, nothing to pay now.",
    };
  }
  // Grocery (and any future provisioning default).
  return {
    noun: "groceries",
    lead: "Stocked and put away before you walk in",
    closeDetail:
      "Your concierge is putting it together, on your tab just as we showed you. Nothing to approve, nothing to pay now.",
  };
}

export type FeeDisclosure = {
  /** The value, prominent — it's stocked/curated and put away before you arrive. */
  lead: string;
  /** ONE calm line: the cost SHAPE, no numbers, value-first. The headline cost line. */
  summary: string;
  /** The concrete schedule (real numbers) — tucked behind a "see how it's priced"
   *  expand on the confirm screen. Disclosed, one tap away, never a wall. */
  schedule: string[];
  /** Warm timing note when a same-day run isn't available today (shown, not hidden). */
  degraded: string | null;
};

/**
 * The disclosure for the confirm surface. The value leads; the cost is ONE calm
 * line (`summary`), and the concrete fee SCHEDULE (real numbers — delivery $,
 * service %, rush $) sits behind an expand (`schedule`) — disclosed, one tap
 * away, never a bullet-wall above the button. We never show a total (the cost
 * isn't known until a human shops it). Honest because discovery delivers exactly
 * what was wanted — that's what keeps the premium milk, not meat (CLAUDE.md).
 * `noun` is "groceries" | "bottles"; `sameDayBlocked` warmly surfaces a degraded
 * same-day run instead of silently dropping it.
 */
export function describeFeeStructure(input: {
  noun: string;
  fees: FeeConfig;
  lead: string;
  sameDayBlocked?: boolean;
}): FeeDisclosure {
  const { noun, fees, lead, sameDayBlocked } = input;
  // Exact (one-decimal) so the displayed % never disagrees with the charged
  // rate for a non-round bps (e.g. 1750 → 17.5%, not a rounded 18%).
  const pct = Number((fees.serviceFeeBps / 100).toFixed(1));
  return {
    lead,
    summary: `Your ${noun} at cost, plus delivery and a service fee. On your tab, nothing to pay now.`,
    schedule: [
      `${formatMoney(fees.deliveryFeeCents)} delivery fee · ${pct}% service fee for the shopping and the hands that do it`,
      `Same-day, or ordered after 8pm the night before, adds a ${formatMoney(fees.rushFeeCents)} rush`,
    ],
    degraded: sameDayBlocked
      ? "Same-day's wrapped for today. We'll have it to you first thing."
      : null,
  };
}
