import { chargeDueAtFor } from "./changePolicy";

/**
 * Every field a NEW tab line needs beyond description/amount/currency, in one
 * place — there are five creation sites (guest wizard completion, quote
 * approval, ops provisioning pricing, the manual ops line, and the demo seed)
 * and they must agree.
 *
 * The PM share: a disclosed 10% curation fee split 50/50 means 5% of the line
 * accrues to the property manager (Ops Decisions 2026-07-07). It is written at
 * creation, INTERNAL-ONLY (ops console; never guest- or PM-facing copy), and
 * zero unless the stay's property actually resolves to a Partner. Demo stays
 * always get 0 — sandbox money isn't anyone's revenue. The payout mechanism
 * deliberately does not exist yet.
 */
export type StayForLine = {
  isDemo: boolean;
  property: { partnerId: string | null };
};

export const PM_SHARE_BPS = 500; // 5% of the line — half of the 10% curation fee

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
