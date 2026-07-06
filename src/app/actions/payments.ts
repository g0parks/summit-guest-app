"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getActiveStay } from "@/lib/session";
import { notifyOperator } from "@/lib/notify";
import { getPaymentProvider } from "@/lib/payments";
import { getStayPhase } from "@/lib/stayPhase";

export type AddCardResult =
  | { ok: true; brand: string; last4: string }
  | { ok: false; error: string };

/** Save a (mock) card on file via the PaymentProvider seam → SetupIntent later. */
export async function addPaymentMethod(
  _prev: AddCardResult | null,
  formData: FormData,
): Promise<AddCardResult> {
  const active = await getActiveStay();
  if (!active) return { ok: false, error: "Your session has expired — please reopen your link." };
  const { stay } = active;

  // Warm close-down (same rule as requests/claims): no card changes on a
  // departed stay. settleTab deliberately stays open — paying down pending
  // is the desired post-stay action when a card is already on file.
  if (getStayPhase(stay, stay.property.timezone) === "POST_STAY") {
    return {
      ok: false,
      error:
        "Your stay has wrapped — text your concierge and we'll take care of next time.",
    };
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

  const saved = await getPaymentProvider().saveCard({
    stayId: stay.id,
    number,
    expMonth,
    expYear,
    name,
  });

  // one default card on file
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
  return { ok: true, brand: saved.brand, last4: saved.last4 };
}

export type SettleResult =
  | { ok: true; count: number; chargedCents: number }
  | { ok: false; error: string };

/** Charge all pending tab items to the card on file via chargeService → PaymentIntent later. */
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

  const provider = getPaymentProvider();
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
      });
      await prisma.tabLineItem.update({
        where: { id: item.id },
        data: { externalRef: res.externalRef },
      });
    } catch (err) {
      console.error("[tab] settle charge failed — releasing the claim:", err);
      await prisma.tabLineItem
        .updateMany({
          where: { id: item.id, status: "CHARGED" },
          data: { status: "PENDING", paymentMethodId: null, externalRef: null },
        })
        .catch(() => {});
      revalidatePath("/tab");
      revalidatePath("/");
      return {
        ok: false,
        error:
          count > 0
            ? "A charge didn't go through — part of your tab is settled, the rest is still pending. Try again."
            : "The charge didn't go through — your tab is untouched. Try again.",
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
