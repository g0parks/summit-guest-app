/**
 * Payment seam. Two providers behind one interface: MOCK (demo sandboxes, and
 * the rollback switch) and STRIPE (real stays).
 *
 * Card capture is a TWO-STEP round trip because a real card number must never
 * touch our server (PCI SAQ-A): begin → the browser talks to Stripe directly →
 * finalize with the reference Stripe hands back. The mock has no such
 * constraint, so `mode` discriminates the two capture styles:
 *   "element" → Stripe Payment Element (clientSecret → SetupIntent id)
 *   "form"    → the demo's hand-typed card (never real money)
 * Each provider rejects the mode it doesn't own, so a mock can't finalize a
 * SetupIntent and Stripe can never be handed a raw PAN.
 *
 * Charging is ALWAYS operator-triggered (money doctrine, 2026-07-27) — nothing
 * in here is called on a timer.
 */

export type ProviderType = "MOCK" | "STRIPE";

/** What the client needs to collect a card. MOCK needs nothing. */
export type CardSetupIntent =
  | { mode: "element"; clientSecret: string; customerRef: string }
  | { mode: "form" };

/** What the client sends back once the guest has entered a card. */
export type CardSetupCompletion =
  | { mode: "element"; setupIntentId: string }
  | { mode: "form"; number: string; expMonth: number; expYear: number; name: string | null };

export interface SavedCard {
  provider: ProviderType;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  /** Stripe PaymentMethod id ("pm_…") once real. */
  externalRef: string | null;
}

export interface ChargeInput {
  stayId: string;
  amountCents: number;
  currency: string;
  description: string;
  paymentMethodExternalRef: string | null;
  /** Stripe Customer the card is attached to; null on MOCK. */
  customerRef: string | null;
  /** `${tabLineItemId}:${chargeAttempts}` — a retry after a decline is a fresh key. */
  idempotencyKey: string;
  /** Stripe emails the receipt itself; null when the guest is phone-only. */
  receiptEmail?: string | null;
  /** Rides along as Stripe metadata so a dashboard refund can find the line. */
  tabLineItemId?: string | null;
}

export interface ChargeResult {
  externalRef: string;
  status: "CHARGED";
}

export interface PaymentProvider {
  readonly type: ProviderType;
  createCardSetup(input: {
    stayId: string;
    customerRef: string | null;
    email?: string | null;
  }): Promise<CardSetupIntent>;
  finalizeCardSetup(input: {
    stayId: string;
    customerRef: string | null;
    completion: CardSetupCompletion;
  }): Promise<SavedCard>;
  chargeService(input: ChargeInput): Promise<ChargeResult>;
}

/**
 * A charge the card refused (declined, expired, insufficient funds). Separate
 * from a plumbing failure on purpose: the ops charge surface shows this message
 * to the operator and offers Retry, where a thrown Error means "something is
 * broken, look at the logs". The message is safe to show a guest.
 */
export class PaymentDeclinedError extends Error {
  readonly code: string | null;
  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "PaymentDeclinedError";
    this.code = code;
  }
}

/** visa / mastercard / amex / discover from the leading digits (MOCK only). */
export function detectBrand(rawNumber: string): string {
  const n = rawNumber.replace(/\D/g, "");
  if (/^4/.test(n)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(n)) return "mastercard";
  if (/^3[47]/.test(n)) return "amex";
  if (/^6/.test(n)) return "discover";
  return "card";
}
