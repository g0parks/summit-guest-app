"use server";

import { prisma } from "@/lib/db";
import { getActiveStay } from "@/lib/session";
import {
  parseUnsubscribeToken,
  recordEmailOptOut,
  recordSmsConsent,
} from "@/lib/consent";
import { normalizePhone } from "@/lib/phone";

export type ConsentResult = { ok: true } | { ok: false; error: string };

/**
 * The app-home text opt-in — the guest's explicit "yes, text me" moment
 * (TCPA express consent; source + disclosure version recorded). The typed
 * number OVERWRITES the guest's phone: this is the guest correcting their
 * own reachable number, the one surface where overwrite is right.
 */
export async function optInTexts(
  _prev: ConsentResult | null,
  formData: FormData,
): Promise<ConsentResult> {
  const active = await getActiveStay();
  if (!active) {
    return { ok: false, error: "Your session has expired — please reopen your link." };
  }

  // Normalized to E.164 at the consent moment — the consent record binds to
  // one stable value, and the future programmatic sender never guesses.
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  if (!phone) {
    return { ok: false, error: "That number doesn't look quite right." };
  }

  await prisma.guest.update({
    where: { id: active.stay.guestId },
    data: { phone },
  });
  await recordSmsConsent(prisma, active.stay.guestId, "app-home");

  return { ok: true };
}

/**
 * Email unsubscribe — the confirm tap on /unsubscribe/[token]. Tokened, no
 * session needed (the email IS the auth); idempotent; honored forever.
 * A human-confirmed POST, so link-prefetching scanners can't opt guests out.
 */
export async function confirmUnsubscribe(
  _prev: ConsentResult | null,
  formData: FormData,
): Promise<ConsentResult> {
  const guestId = parseUnsubscribeToken(String(formData.get("token") ?? ""));
  if (!guestId) {
    return { ok: false, error: "This link isn't valid. It may have been copied incompletely." };
  }
  await recordEmailOptOut(guestId);
  return { ok: true };
}
