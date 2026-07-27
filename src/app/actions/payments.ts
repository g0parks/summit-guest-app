"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getActiveStay, type ActiveStay } from "@/lib/session";
import { notifyOperator } from "@/lib/notify";
import {
  getPaymentProvider,
  PaymentDeclinedError,
  type CardSetupIntent,
  type SavedCard,
} from "@/lib/payments";
import { getStayPhase } from "@/lib/stayPhase";

type Stay = ActiveStay["stay"];

/**
 * Warm close-down (same rule as requests/claims): no card changes on a departed
 * stay. settleTab deliberately stays open — paying down pending is the desired
 * post-stay action when a card is already on file.
 */
function postStayClosed(stay: Stay): boolean {
  return getStayPhase(stay, stay.property.timezone) === "POST_STAY";
}

const POST_STAY_ERROR =
  "Your stay has wrapped — text your concierge and we'll take care of next time.";

/**
 * One default card on file, plus the operator ping. Shared by both capture
 * paths (the Stripe Payment Element and the demo's typed form) so they can't
 * drift apart.
 */
async function persistSavedCard(stay: Stay, saved: SavedCard): Promise<void> {
  await prisma.paymentMethod.updateMany({
    where: { stayId: stay.id, isDefault: true },
    data: { isDefault: false },
  });
  await prisma.paymentMethod.create({
    data: {
      stayId: stay.id,
      provider: saved.provider,
      brand: saved.brand,
      last4: saved.last4,
      expMonth: saved.expMonth,
      expYear: saved.expYear,
      isDefault: true,
      externalRef: saved.externalRef,
    },
  });

  await notifyOperator({
    type: "card_added",
    stayId: stay.id,
    guestName: `${stay.guest.firstName} ${stay.guest.lastName ?? ""}`.trim(),
    brand: saved.brand,
    last4: saved.last4,
    isDemo: stay.isDemo,
    partnerName: stay.property.partner?.name ?? null,
  });

  revalidatePath("/tab");
}

export type AddCardResult =
  | { ok: true; brand: string; last4: string }
  | { ok: false; error: string };

export type BeginCardSetupResult =
  | { ok: true; setup: CardSetupIntent }
  | { ok: false; error: string };

/**
 * Step 1 of real card capture: mint a SetupIntent and hand the browser its
 * client secret. The card number then goes browser → Stripe directly; it never
 * reaches this server (PCI SAQ-A). On the mock provider this returns
 * { mode: "form" } and the demo's typed form takes over.
 *
 * The stay's Stripe Customer is created here, lazily, on the first setup.
 */
export async function beginCardSetup(): Promise<BeginCardSetupResult> {
  const active = await getActiveStay();
  if (!active) return { ok: false, error: "Your session has expired — please reopen your link." };
  const { stay } = active;
  if (postStayClosed(stay)) return { ok: false, error: POST_STAY_ERROR };

  try {
    const setup = await getPaymentProvider(stay).createCardSetup({
      stayId: stay.id,
      customerRef: stay.stripeCustomerId,
      email: stay.guest.email,
    });

    // Remember the Customer so a replaced card lands on the same one, and so
    // every later off-session charge has something to quote.
    if (setup.mode === "element" && setup.customerRef !== stay.stripeCustomerId) {
      await prisma.stay.update({
        where: { id: stay.id },
        data: { stripeCustomerId: setup.customerRef },
      });
    }
    return { ok: true, setup };
  } catch (err) {
    console.error("[payments] card setup could not be started:", err);
    return { ok: false, error: "We couldn't open the card form — please try again." };
  }
}

/**
 * Step 2 of real card capture: the browser confirmed the SetupIntent, so read
 * the card's reference back from Stripe and save it. The provider verifies the
 * SetupIntent succeeded AND belongs to this stay's Customer before trusting the
 * id the client sent.
 */
export async function completeCardSetup(setupIntentId: string): Promise<AddCardResult> {
  const active = await getActiveStay();
  if (!active) return { ok: false, error: "Your session has expired — please reopen your link." };
  const { stay } = active;
  if (postStayClosed(stay)) return { ok: false, error: POST_STAY_ERROR };

  // Defensive coercion, not decoration: a server action is a public endpoint —
  // a malformed call must return the error shape, never a 500.
  const id = typeof setupIntentId === "string" ? setupIntentId.trim() : "";
  if (!id) return { ok: false, error: "That card didn't save — please try again." };

  let saved: SavedCard;
  try {
    saved = await getPaymentProvider(stay).finalizeCardSetup({
      stayId: stay.id,
      customerRef: stay.stripeCustomerId,
      completion: { mode: "element", setupIntentId: id },
    });
  } catch (err) {
    console.error("[payments] card setup could not be finalized:", err);
    return {
      ok: false,
      error:
        err instanceof PaymentDeclinedError
          ? err.message
          : "That card didn't save — please try again.",
    };
  }

  await persistSavedCard(stay, saved);
  return { ok: true, brand: saved.brand, last4: saved.last4 };
}

/**
 * The demo's card form (MOCK provider only): a typed card number, no real
 * money. Kept as a FormData action so it still works with JS off — the Payment
 * Element path can't, by nature. A real stay never renders this form; if one
 * somehow posts here, refuse rather than store a card number.
 */
export async function addPaymentMethod(
  _prev: AddCardResult | null,
  formData: FormData,
): Promise<AddCardResult> {
  const active = await getActiveStay();
  if (!active) return { ok: false, error: "Your session has expired — please reopen your link." };
  const { stay } = active;
  if (postStayClosed(stay)) return { ok: false, error: POST_STAY_ERROR };

  const provider = getPaymentProvider(stay);
  if (provider.type !== "MOCK") {
    return { ok: false, error: "Please use the secure card form above." };
  }

  const number = String(formData.get("number") ?? "").replace(/\D/g, "");
  const exp = String(formData.get("exp") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim() || null;

  if (number.length < 12) return { ok: false, error: "Enter a valid card number." };
  const m = exp.match(/^(\d{1,2})\s*\/\s*(\d{2,4})$/);
  if (!m) return { ok: false, error: "Enter the expiry as MM/YY." };
  const expMonth = Number.parseInt(m[1] ?? "", 10);
  let expYear = Number.parseInt(m[2] ?? "", 10);
  if (Number.isNaN(expMonth) || Number.isNaN(expYear)) {
    return { ok: false, error: "Enter the expiry as MM/YY." };
  }
  if (expYear < 100) expYear += 2000;
  if (expMonth < 1 || expMonth > 12) return { ok: false, error: "Check the expiry month." };

  const saved = await provider.finalizeCardSetup({
    stayId: stay.id,
    customerRef: stay.stripeCustomerId,
    completion: { mode: "form", number, expMonth, expYear, name },
  });

  await persistSavedCard(stay, saved);
  return { ok: true, brand: saved.brand, last4: saved.last4 };
}

export type SettleResult =
  | { ok: true; count: number; chargedCents: number }
  | { ok: false; error: string };

/** Charge all pending tab items to the card on file — the guest's own pay-down tap. */
export async function settleTab(): Promise<SettleResult> {
  const active = await getActiveStay();
  if (!active) return { ok: false, error: "Your session has expired — please reopen your link." };
  const { stay } = active;

  const card =
    (await prisma.paymentMethod.findFirst({ where: { stayId: stay.id, isDefault: true } })) ??
    (await prisma.paymentMethod.findFirst({ where: { stayId: stay.id } }));
  if (!card) return { ok: false, error: "Add a card before settling." };

  const pending = await prisma.tabLineItem.findMany({
    where: { stayId: stay.id, status: "PENDING" },
  });
  if (pending.length === 0) return { ok: false, error: "Nothing pending to settle." };

  const provider = getPaymentProvider(stay);
  let total = 0;
  let count = 0;
  for (const item of pending) {
    // Claim each line BEFORE calling the provider (the guarded-updateMany
    // money idiom, shared with ops chargeTabLine): a double-tapped Settle or
    // a concurrent ops charge can't bill the same line twice. A line another
    // charge already claimed is skipped, not an error.
    const claimed = await prisma.tabLineItem.updateMany({
      where: { id: item.id, status: "PENDING" },
      data: { status: "CHARGED", paymentMethodId: card.id },
    });
    if (claimed.count === 0) continue;

    try {
      const res = await provider.chargeService({
        stayId: stay.id,
        amountCents: item.amount,
        currency: item.currency,
        description: item.description,
        paymentMethodExternalRef: card.externalRef,
        customerRef: stay.stripeCustomerId,
        // The attempt counter in the key is what makes a retry after a decline
        // a genuinely new attempt (Stripe replays a key's stored result — the
        // decline included — for 24h).
        idempotencyKey: `${item.id}:${item.chargeAttempts}`,
        receiptEmail: stay.guest.email,
        tabLineItemId: item.id,
      });
      await prisma.tabLineItem.update({
        where: { id: item.id },
        data: { externalRef: res.externalRef, chargeFailedAt: null },
      });
    } catch (err) {
      console.error("[tab] settle charge failed — releasing the claim:", err);
      await prisma.tabLineItem
        .updateMany({
          where: { id: item.id, status: "CHARGED" },
          data: {
            status: "PENDING",
            paymentMethodId: null,
            externalRef: null,
            chargeFailedAt: new Date(),
            chargeAttempts: { increment: 1 },
          },
        })
        .catch(() => {});
      revalidatePath("/tab");
      revalidatePath("/");
      // A decline message from the provider is guest-safe and more useful than
      // a generic failure ("your card was declined" vs "try again").
      const why = err instanceof PaymentDeclinedError ? ` ${err.message}` : " Try again.";
      return {
        ok: false,
        error:
          count > 0
            ? `A charge didn't go through — part of your tab is settled, the rest is still pending.${why}`
            : `The charge didn't go through — your tab is untouched.${why}`,
      };
    }
    total += item.amount;
    count += 1;
  }
  if (count === 0) return { ok: false, error: "Nothing pending to settle." };

  revalidatePath("/tab");
  revalidatePath("/");
  return { ok: true, count, chargedCents: total };
}
