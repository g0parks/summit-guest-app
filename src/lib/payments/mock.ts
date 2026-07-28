import { randomBytes } from "node:crypto";
import {
  detectBrand,
  type CardSetupCompletion,
  type CardSetupIntent,
  type ChargeInput,
  type ChargeResult,
  type PaymentProvider,
  type SavedCard,
} from "./types";

const ref = (prefix: string) => `${prefix}_${randomBytes(8).toString("hex")}`;

/**
 * Mock provider — no real money, ever. Demo sandboxes always resolve to it
 * (per-stay selection in ./index.ts), and PAYMENTS_PROVIDER=mock falls the
 * whole app back to it. Card capture stays the hand-typed demo form: there's
 * no SetupIntent to confirm, so "element" completions are refused.
 */
export const mockPaymentProvider: PaymentProvider = {
  type: "MOCK",

  async createCardSetup(): Promise<CardSetupIntent> {
    return { mode: "form" };
  },

  async finalizeCardSetup(input: {
    completion: CardSetupCompletion;
  }): Promise<SavedCard> {
    if (input.completion.mode !== "form") {
      // Shouldn't be reachable — the client renders the form because
      // createCardSetup said "form". Loud rather than silently mis-saving.
      throw new Error("[payments] mock provider cannot finalize a Stripe SetupIntent");
    }
    const digits = input.completion.number.replace(/\D/g, "");
    return {
      provider: "MOCK",
      brand: detectBrand(digits),
      last4: digits.slice(-4) || "0000",
      expMonth: input.completion.expMonth,
      expYear: input.completion.expYear,
      externalRef: ref("mock_pm"),
    };
  },

  async chargeService(input: ChargeInput): Promise<ChargeResult> {
    // Always succeeds — the demo's running tab is theater, deliberately.
    void input;
    return {
      externalRef: ref("mock_pi"),
      status: "CHARGED",
    };
  },
};
