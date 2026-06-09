/**
 * Payment seam. Stubbed today, real Stripe later — the interface is shaped so
 * the swap is mechanical:
 *   saveCard(...)      → Stripe SetupIntent (save a card off-session)
 *   chargeService(...) → Stripe off-session PaymentIntent (charge the saved card)
 * `externalRef` carries the Stripe id (PaymentMethod / PaymentIntent) once real.
 */

export type ProviderType = "MOCK" | "STRIPE";

export interface SaveCardInput {
  stayId: string;
  number: string;
  expMonth: number;
  expYear: number;
  name?: string | null;
}

export interface SavedCard {
  provider: ProviderType;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  externalRef: string | null;
}

export interface ChargeInput {
  stayId: string;
  amountCents: number;
  currency: string;
  description: string;
  paymentMethodExternalRef: string | null;
}

export interface ChargeResult {
  externalRef: string;
  status: "CHARGED";
}

export interface PaymentProvider {
  readonly type: ProviderType;
  saveCard(input: SaveCardInput): Promise<SavedCard>;
  chargeService(input: ChargeInput): Promise<ChargeResult>;
}

/** visa / mastercard / amex / discover from the leading digits. */
export function detectBrand(rawNumber: string): string {
  const n = rawNumber.replace(/\D/g, "");
  if (/^4/.test(n)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(n)) return "mastercard";
  if (/^3[47]/.test(n)) return "amex";
  if (/^6/.test(n)) return "discover";
  return "card";
}
