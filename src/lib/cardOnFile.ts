import "server-only";
import type { PaymentMethod } from "@prisma/client";
import { prisma } from "./db";
import {
  resolvePayments,
  type ProviderType,
  type UnavailableReason,
} from "./payments";

/**
 * "Can we charge this stay, and with what?" — ONE answer, shared by the card
 * gates, the wallet, and both charge paths, so they can't drift.
 *
 * `mismatch` is the case worth naming: a card saved under the OTHER provider.
 * Every PaymentMethod row that predates Stripe is `provider: MOCK`, and handing
 * Stripe a `mock_pm_…` reference is a guaranteed failure at the worst moment.
 * A mismatched card is treated as no usable card everywhere — the guest re-adds,
 * and the operator gets told exactly that instead of a raw Stripe error.
 */
export type CardOnFile =
  | { state: "usable"; card: PaymentMethod; type: ProviderType }
  | { state: "none"; type: ProviderType }
  | { state: "mismatch"; card: PaymentMethod; type: ProviderType }
  | { state: "unavailable"; reason: UnavailableReason };

export type StayForCard = { id: string; isDemo: boolean };

export async function resolveCardOnFile(stay: StayForCard): Promise<CardOnFile> {
  const payments = resolvePayments(stay);
  if (!payments.available) return { state: "unavailable", reason: payments.reason };
  const type = payments.type;

  const cards = await prisma.paymentMethod.findMany({
    where: { stayId: stay.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  if (cards.length === 0) return { state: "none", type };

  const usable = cards.find((c) => c.provider === type);
  if (usable) return { state: "usable", card: usable, type };
  return { state: "mismatch", card: cards[0]!, type };
}

/** Is there a chargeable card? The gates' one-liner. */
export function hasUsableCard(card: CardOnFile): boolean {
  return card.state === "usable";
}

/** Operator-facing reason a charge can't be attempted (null when it can). */
export function chargeBlockedReason(card: CardOnFile): string | null {
  switch (card.state) {
    case "usable":
      return null;
    case "none":
      return "No card on file for this stay.";
    case "mismatch":
      return (
        "This card was saved before Stripe and can't be charged — " +
        "text the guest to re-add it (the card-update draft is on the charge row)."
      );
    case "unavailable":
      return card.reason === "misconfigured"
        ? "Payments are misconfigured — no charge attempted. Check the Stripe keys."
        : "Payments are switched off (PAYMENTS_PROVIDER) — no charge attempted.";
  }
}
