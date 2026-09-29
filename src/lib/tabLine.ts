import { chargeDueAtFor } from "./changePolicy";

/**
 * Every field a NEW tab line needs beyond description/amount/currency, in one
 * place — there are five creation sites (guest wizard completion, quote
 * approval, ops provisioning pricing, the manual ops line, and the demo seed)
 * and they must agree.
 *
 * The PM share: ZERO as of 2026-09-03 (Parker) - supersedes the 2026-07-07
 * "disclosed 10% curation fee split 50/50" ruling. The PM is compensated by
 * Summit PRESERVING their existing Ski Butlers affiliate link rather than
 * replacing it, which is worth materially more to them than 5% of non-ski
 * gross (a PM's 20% ski commission and Summit's 20% net-rate spread are the
 * SAME twenty points off rack - the discount only exists once). Rev share is
 * not offered in any category.
 *
 * The mechanism stays wired (column, ops override, netCents) so a Phase-2
 * partner-specific share drops in without redesign - set PM_SHARE_BPS, or
 * make it per-Partner. Demo stays always get 0 - sandbox money isn't
 * anyone's revenue.
 */
export type StayForLine = {
  isDemo: boolean;
  property: { partnerId: string | null };
};

export const PM_SHARE_BPS = 0; // no PM rev share (2026-09-03); see header

export function pmShareFor(amountCents: number, stay: StayForLine): number {
  if (stay.isDemo || !stay.property.partnerId) return 0;
  return Math.round((amountCents * PM_SHARE_BPS) / 10_000);
}

export function newTabLineFields(input: {
  amountCents: number;
  /** What the vendor charges us; null when it isn't known yet (net stays null). */
  vendorCostCents?: number | null;
  stay: StayForLine;
  requestedFor?: Date | null;
  cancelCutoffHours?: number | null;
  now?: Date;
}): {
  chargeDueAt: Date;
  pmShareCents: number;
  vendorCostCents: number | null;
  netCents: number | null;
} {
  const vendorCostCents = input.vendorCostCents ?? null;
  const pmShareCents = pmShareFor(input.amountCents, input.stay);
  return {
    chargeDueAt: chargeDueAtFor({
      requestedFor: input.requestedFor ?? null,
      cancelCutoffHours: input.cancelCutoffHours ?? null,
      now: input.now,
    }),
    pmShareCents,
    vendorCostCents,
    // Net needs a vendor cost to mean anything; without one it stays null
    // rather than reading as "we keep the whole amount".
    netCents:
      vendorCostCents != null ? input.amountCents - vendorCostCents - pmShareCents : null,
  };
}
