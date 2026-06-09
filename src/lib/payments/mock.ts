import { randomBytes } from "node:crypto";
import {
  detectBrand,
  type ChargeInput,
  type ChargeResult,
  type PaymentProvider,
  type SaveCardInput,
  type SavedCard,
} from "./types";

const ref = (prefix: string) => `${prefix}_${randomBytes(8).toString("hex")}`;

/**
 * Mock provider — no real money. "Saves" a card by recording brand/last4 and
 * always succeeds on charge. Mirrors the shape a Stripe-backed provider returns.
 */
export const mockPaymentProvider: PaymentProvider = {
  type: "MOCK",

  async saveCard(input: SaveCardInput): Promise<SavedCard> {
    const digits = input.number.replace(/\D/g, "");
    return {
      provider: "MOCK",
      brand: detectBrand(digits),
      last4: digits.slice(-4) || "0000",
      expMonth: input.expMonth,
      expYear: input.expYear,
      externalRef: ref("mock_pm"), // ← Stripe PaymentMethod id later
    };
  },

  async chargeService(input: ChargeInput): Promise<ChargeResult> {
    // A real provider builds a Stripe PaymentIntent from amount/currency/card.
    void input;
    return {
      externalRef: ref("mock_pi"), // ← Stripe PaymentIntent id later
      status: "CHARGED",
    };
  },
};
