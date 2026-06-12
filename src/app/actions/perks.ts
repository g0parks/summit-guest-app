"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getActiveStay } from "@/lib/session";
import { notifyOperator } from "@/lib/notify";
import { getStayPhase } from "@/lib/stayPhase";

export type ClaimResult = { ok: true } | { ok: false; error: string };

/**
 * Guest claims a complimentary perk. The gift moment doubles as first-party
 * capture: contact lands on the claim, and fills empty Guest fields — but
 * NEVER overwrites contact details we already hold. Perks never touch the
 * tab; a claim is not a charge.
 */
export async function claimPerk(
  _prev: ClaimResult | null,
  formData: FormData,
): Promise<ClaimResult> {
  const active = await getActiveStay();
  if (!active) {
    return { ok: false, error: "Your session has expired — please reopen your link." };
  }
  const { stay } = active;

  // Warm close-down: no new claims on a departed stay (server is the source
  // of truth; the UI mirrors).
  if (getStayPhase(stay, stay.property.timezone) === "POST_STAY") {
    return {
      ok: false,
      error:
        "Your stay has wrapped — text your concierge and we'll take care of next time.",
    };
  }

  const perkId = String(formData.get("perkId") ?? "");
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const optIn = formData.get("optIn") === "on";

  if (!email && !phone) {
    return { ok: false, error: "Leave an email or phone number so we can arrange it." };
  }
  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    return { ok: false, error: "That email doesn’t look quite right." };
  }

  const perk = perkId
    ? await prisma.perk.findUnique({ where: { id: perkId } })
    : null;
  const visible =
    perk &&
    perk.isActive &&
    (perk.partnerId === null || perk.partnerId === stay.property.partnerId);
  if (!perk || !visible) {
    return { ok: false, error: "That perk isn’t available right now." };
  }

  try {
    await prisma.perkClaim.create({
      data: {
        perkId: perk.id,
        stayId: stay.id,
        email,
        phone,
        marketingOptIn: optIn,
      },
    });
  } catch (err) {
    // one claim per perk per stay — surface gently, not as a 500
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "This one’s already arranged for your stay." };
    }
    throw err;
  }

  // First-party capture: fill blanks only, never overwrite.
  const guestUpdate: { email?: string; phone?: string } = {};
  if (!stay.guest.email && email) guestUpdate.email = email;
  if (!stay.guest.phone && phone) guestUpdate.phone = phone;
  if (Object.keys(guestUpdate).length > 0) {
    await prisma.guest.update({ where: { id: stay.guestId }, data: guestUpdate });
  }

  await notifyOperator({
    type: "perk_claimed",
    stayId: stay.id,
    guestName: `${stay.guest.firstName} ${stay.guest.lastName ?? ""}`.trim(),
    property: stay.property.name,
    perkName: perk.name,
    email,
    phone,
    optIn,
    isDemo: stay.isDemo,
    partnerName: stay.property.partner?.name ?? null,
  });

  revalidatePath("/perks");
  revalidatePath("/");

  return { ok: true };
}
