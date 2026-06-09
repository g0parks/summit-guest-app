import { mockPaymentProvider } from "./mock";
import type { PaymentProvider } from "./types";

export * from "./types";

/**
 * Provider selection. `mock` today; when PAYMENTS_PROVIDER=stripe, this is where
 * a StripePaymentProvider (same interface) drops in — no call sites change.
 */
export function getPaymentProvider(): PaymentProvider {
  const which = (process.env.PAYMENTS_PROVIDER ?? "mock").toLowerCase();
  switch (which) {
    case "stripe":
      // return stripePaymentProvider; (implement when real keys exist)
      throw new Error("Stripe provider not implemented yet — set PAYMENTS_PROVIDER=mock");
    case "mock":
    default:
      return mockPaymentProvider;
  }
}
