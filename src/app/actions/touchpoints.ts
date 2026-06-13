"use server";

import type { TouchKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOperator } from "@/lib/opsSession";
import { buildToken } from "@/lib/tokens";
import { liveTokenId, recordTouch } from "@/lib/touchpoints";
import {
  sendPlanAheadEmail,
  sendPreArrivalEmail,
  sendWelcomeEmail,
} from "@/lib/guestEmail";

/**
 * The Touchpoints panel's one action: send a cadence email NOW, because the
 * operator decided to — the system only ever surfaces what's due (human
 * oversight by doctrine; no scheduler, no automation). Sends are recorded
 * as GuestTouch so the panel stays honest and double-sends die at the
 * unique constraint.
 *
 * Deliberately NO revalidatePath: the panel renders the send outcome from
 * its own action state (the GuestLinkPanel precedent) — navigation renders
 * the persisted state fresh.
 */

const KINDS: TouchKind[] = ["WELCOME", "PLAN_AHEAD", "PRE_ARRIVAL"];

export type TouchResult = { ok: true; line: string } | { ok: false; error: string };

export async function sendTouch(
  _prev: TouchResult | null,
  formData: FormData,
): Promise<TouchResult> {
  await requireOperator();

  const stayId = String(formData.get("stayId") ?? "");
  const kind = String(formData.get("kind") ?? "") as TouchKind;
  if (!KINDS.includes(kind)) return { ok: false, error: "Unknown touchpoint." };

  const stay = await prisma.stay.findUnique({
    where: { id: stayId },
    include: {
      guest: true,
      property: { include: { partner: true } },
      accessTokens: true,
      guestTouches: { where: { kind } },
    },
  });
  if (!stay) return { ok: false, error: "Stay not found." };
  if (stay.guestTouches.length > 0) {
    return { ok: false, error: "Already sent — the record below has the date." };
  }

  const tokenId = liveTokenId(stay.accessTokens);
  if (!tokenId) {
    return { ok: false, error: "No live guest link to send — mint one first." };
  }

  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  // PLAN_AHEAD lands on /plan (the intake IS the invitation); the others
  // land on the trip home. ?next= is validated relative-only server-side.
  const link =
    kind === "PLAN_AHEAD"
      ? `${base}/t/${buildToken(tokenId)}?next=${encodeURIComponent("/plan")}`
      : `${base}/t/${buildToken(tokenId)}`;

  const input = { guest: stay.guest, stay, property: stay.property, link };
  const result =
    kind === "WELCOME"
      ? await sendWelcomeEmail(input)
      : kind === "PLAN_AHEAD"
        ? await sendPlanAheadEmail(input)
        : await sendPreArrivalEmail(input);

  if (!result.sent) {
    return {
      ok: false,
      error:
        result.reason === "no-email"
          ? "No email address on file for this guest."
          : result.reason === "not-configured"
            ? "Guest email is off (GUEST_EMAIL_FROM unset)."
            : "Send failed — try again or share the link another way.",
    };
  }

  await recordTouch({ stayId, kind, channel: result.mode, sentTo: result.to });

  return {
    ok: true,
    line:
      result.mode === "resend"
        ? `Sent to ${result.to}.`
        : `Printed to the server console (RESEND_API_KEY unset).`,
  };
}
