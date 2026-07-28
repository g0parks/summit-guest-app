import { mockPaymentProvider } from "./mock";
import { stripePaymentProvider } from "./stripe";
import type { PaymentProvider, ProviderType } from "./types";

export * from "./types";

/** The stay fields provider selection needs — anything with these satisfies it. */
export type StayForPayments = { isDemo: boolean };

/** Why a real stay can't take a card right now. */
export type UnavailableReason = "misconfigured" | "switched_off";

export type PaymentsResolution =
  | { available: true; type: ProviderType; provider: PaymentProvider }
  | { available: false; reason: UnavailableReason };

/**
 * Payments resolution is PER STAY, and it has THREE answers, not two:
 *
 *   demo sandbox → MOCK, always. A pitch never touches real money, and /demo
 *                  stays are GC'd, so Stripe objects for them would be litter.
 *   real stay    → STRIPE when PAYMENTS_PROVIDER=stripe and both keys are set.
 *   real stay    → UNAVAILABLE otherwise.
 *
 * That third state is the point. Falling back to MOCK on a real stay would show
 * a real guest the demo's typed card form and store a fake card — collecting a
 * card we can never charge is worse than visibly not collecting one. So
 * PAYMENTS_PROVIDER=mock is a KILL SWITCH, not a graceful degrade: real stays
 * can't save cards and their charges refuse loudly instead of fake-succeeding.
 * Guests hit the quiet concierge escape hatch, and the demand is still captured.
 */
export function resolvePayments(stay: StayForPayments): PaymentsResolution {
  if (stay.isDemo) return { available: true, type: "MOCK", provider: mockPaymentProvider };
  const health = paymentsHealth();
  if (!health.ok) return { available: false, reason: health.reason };
  return { available: true, type: "STRIPE", provider: stripePaymentProvider };
}

/**
 * The env-only half of the same question — what the /ops banner reads. Real
 * stays can only take cards when this is ok; misconfigured is logged loudly
 * because it means someone asked for Stripe and the keys aren't there.
 */
export function paymentsHealth(): { ok: true } | { ok: false; reason: UnavailableReason } {
  const which = (process.env.PAYMENTS_PROVIDER ?? "mock").toLowerCase();
  if (which !== "stripe") return { ok: false, reason: "switched_off" };
  if (
    !process.env.STRIPE_SECRET_KEY?.trim() ||
    !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim()
  ) {
    console.error(
      "[payments] PAYMENTS_PROVIDER=stripe but STRIPE_SECRET_KEY / " +
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing — real stays cannot save or " +
        "charge cards. Guests are being sent to the concierge line; /ops shows the banner.",
    );
    return { ok: false, reason: "misconfigured" };
  }
  return { ok: true };
}
