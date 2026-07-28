import { mockPaymentProvider } from "./mock";
import { stripePaymentProvider } from "./stripe";
import type { PaymentProvider, ProviderType } from "./types";

export * from "./types";

/** The stay fields provider selection needs — anything with these satisfies it. */
export type StayForPayments = { isDemo: boolean };

/**
 * Provider selection is PER STAY, not global:
 *   demo sandbox      → MOCK, always. A pitch never touches real money, and
 *                       /demo stays are GC'd, so Stripe objects for them would
 *                       be litter.
 *   real stay         → STRIPE when PAYMENTS_PROVIDER=stripe and both keys are
 *                       present; MOCK otherwise (the instant rollback switch).
 *
 * Keys missing while asking for stripe is a misconfiguration, not a reason for
 * the app to break: log it loudly and serve MOCK (the getConciergeContact()
 * idiom — nothing looks broken to the guest, the operator sees it in the log).
 */
export function getPaymentProviderType(stay: StayForPayments): ProviderType {
  if (stay.isDemo) return "MOCK";
  const which = (process.env.PAYMENTS_PROVIDER ?? "mock").toLowerCase();
  if (which !== "stripe") return "MOCK";
  if (!process.env.STRIPE_SECRET_KEY?.trim() || !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim()) {
    console.error(
      "[payments] PAYMENTS_PROVIDER=stripe but STRIPE_SECRET_KEY / " +
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing — falling back to the mock " +
        "provider. Real cards cannot be saved or charged until both are set.",
    );
    return "MOCK";
  }
  return "STRIPE";
}

export function getPaymentProvider(stay: StayForPayments): PaymentProvider {
  return getPaymentProviderType(stay) === "STRIPE" ? stripePaymentProvider : mockPaymentProvider;
}
