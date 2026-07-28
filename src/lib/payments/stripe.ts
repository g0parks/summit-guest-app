import "server-only";
import Stripe from "stripe";
import {
  PaymentConflictError,
  PaymentDeclinedError,
  type CardSetupIntent,
  type ChargeInput,
  type ChargeResult,
  type PaymentProvider,
  type SavedCard,
} from "./types";

/**
 * Real money. Three calls, nothing else:
 *   Customer          — one per stay, created lazily at the first card setup
 *   SetupIntent       — the browser confirms it against Stripe directly, so no
 *                       card number ever reaches this server (PCI SAQ-A)
 *   PaymentIntent     — off-session, confirmed immediately, ONE per operator tap
 *
 * Nothing here runs on a timer or a webhook (money doctrine, 2026-07-27): every
 * charge is a human tap in /ops, and the result comes back synchronously in the
 * room. Refunds are done in the Stripe dashboard — the metadata below is what
 * makes a line findable there.
 */

// Pinned to the version this SDK (v22) was built against — an account-level API
// upgrade in the Stripe dashboard can't silently change response shapes.
const API_VERSION = "2026-06-24.dahlia" satisfies Stripe.LatestApiVersion;

let client: Stripe | null = null;

function stripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    // Unreachable via getPaymentProvider (it falls back to MOCK when keys are
    // missing) — this is the direct-import backstop.
    throw new Error("[payments] STRIPE_SECRET_KEY is not set");
  }
  client = new Stripe(key, { apiVersion: API_VERSION });
  return client;
}

/** Stripe's own decline messages are guest-safe; fall back to a calm generic. */
function asDecline(err: unknown): PaymentDeclinedError | null {
  if (!(err instanceof Stripe.errors.StripeError)) return null;
  if (err.type !== "StripeCardError") return null;
  const code = err.decline_code ?? err.code ?? null;
  return new PaymentDeclinedError(
    err.message || "The card was declined.",
    code,
  );
}

export const stripePaymentProvider: PaymentProvider = {
  type: "STRIPE",

  async createCardSetup(input: {
    stayId: string;
    customerRef: string | null;
    email?: string | null;
  }): Promise<CardSetupIntent> {
    const s = stripe();

    // Reuse the stay's Customer so a replaced card lands on the same one.
    let customerRef = input.customerRef;
    if (!customerRef) {
      const customer = await s.customers.create({
        email: input.email ?? undefined,
        metadata: { stayId: input.stayId },
      });
      customerRef = customer.id;
    }

    // usage: off_session IS the durable permission to charge later — it's what
    // makes the saved card chargeable without the guest present. It reserves
    // no money and places no hold (deliberately: holds expire in 7 days).
    //
    // payment_method_types: ["card"] is deliberate and load-bearing. Left to
    // Stripe's automatic payment methods, the Element also offers Klarna /
    // Cash App / Pix / Link — redirect-based methods that would bounce the
    // guest off-site mid-flow and, worse, are NOT chargeable off-session the
    // way this whole money path assumes. A card on file is the promise.
    const setupIntent = await s.setupIntents.create({
      customer: customerRef,
      usage: "off_session",
      payment_method_types: ["card"],
      metadata: { stayId: input.stayId },
    });
    if (!setupIntent.client_secret) {
      throw new Error("[payments] SetupIntent came back without a client secret");
    }
    return { mode: "element", clientSecret: setupIntent.client_secret, customerRef };
  },

  async finalizeCardSetup(input): Promise<SavedCard> {
    if (input.completion.mode !== "element") {
      // A raw card number reaching the Stripe provider would put a PAN on our
      // server — refuse rather than "handle" it.
      throw new Error("[payments] the Stripe provider never accepts a typed card number");
    }
    const s = stripe();
    const si = await s.setupIntents.retrieve(input.completion.setupIntentId, {
      expand: ["payment_method"],
    });

    // The client supplies this id, so verify it before trusting it: it must
    // have actually succeeded AND belong to this stay's Customer. Without the
    // ownership check, a guest could attach another stay's card to their tab.
    if (si.status !== "succeeded") {
      throw new PaymentDeclinedError("That card wasn't saved — please try again.");
    }
    const customerId = typeof si.customer === "string" ? si.customer : si.customer?.id ?? null;
    if (!customerId || !input.customerRef || customerId !== input.customerRef) {
      throw new Error("[payments] SetupIntent customer does not match the stay's customer");
    }

    const pm = si.payment_method;
    if (!pm || typeof pm === "string" || !pm.card) {
      throw new Error("[payments] SetupIntent has no expanded card payment method");
    }

    return {
      provider: "STRIPE",
      brand: pm.card.brand,
      last4: pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear: pm.card.exp_year,
      externalRef: pm.id,
    };
  },

  async chargeService(input: ChargeInput): Promise<ChargeResult> {
    if (!input.customerRef || !input.paymentMethodExternalRef) {
      throw new Error("[payments] charge attempted without a Stripe customer + payment method");
    }
    const s = stripe();
    try {
      const intent = await s.paymentIntents.create(
        {
          amount: input.amountCents, // already integer cents everywhere
          currency: input.currency,
          customer: input.customerRef,
          payment_method: input.paymentMethodExternalRef,
          off_session: true,
          confirm: true,
          description: input.description,
          // Stripe sends the receipt — the guest's written record until the
          // bundled folio email exists.
          receipt_email: input.receiptEmail ?? undefined,
          metadata: {
            stayId: input.stayId,
            ...(input.tabLineItemId ? { tabLineItemId: input.tabLineItemId } : {}),
          },
        },
        // Same key replays Stripe's stored result, so a double-tapped Charge
        // can't bill twice; the attempt counter in the key is what makes a
        // deliberate retry a genuinely new attempt.
        { idempotencyKey: input.idempotencyKey },
      );

      if (intent.status !== "succeeded") {
        // No webhook to wait on by design — anything not settled synchronously
        // (e.g. requires_action on an off-session card) is a decline to us.
        throw new PaymentDeclinedError(
          "The card needs the cardholder present to approve this charge.",
          intent.status,
        );
      }
      return { externalRef: intent.id, status: "CHARGED" };
    } catch (err) {
      const declined = asDecline(err);
      if (declined) throw declined;
      // Same key, different details: an earlier attempt on this line reached
      // Stripe and the card has changed since. Refusing is correct — a fresh key
      // could bill twice if that attempt succeeded — but say so plainly, or the
      // line looks permanently stuck for no visible reason.
      if (err instanceof Stripe.errors.StripeError && err.type === "StripeIdempotencyError") {
        throw new PaymentConflictError(
          "An earlier attempt on this line reached Stripe with a different card — " +
            "check the Stripe dashboard for an existing payment before retrying.",
        );
      }
      throw err;
    }
  },
};
