"use server";

import { Prisma, type TouchKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOperator } from "@/lib/opsSession";
import { buildToken } from "@/lib/tokens";
import { formatDateRange } from "@/lib/dates";
import {
  buildTouchPlan,
  liveTokenId,
  loadTouchSignals,
  touchEmailContent,
} from "@/lib/touchpoints";
import { sendCadenceEmail, sendWelcomeEmail } from "@/lib/guestEmail";

/**
 * The Touchpoints panel's one action: send a cadence email NOW, because the
 * operator decided to — the system only ever surfaces what's due (human
 * oversight by doctrine; no scheduler, no automation). Sends are recorded
 * as GuestTouch so the panel stays honest and double-sends die at the
 * unique constraint.
 *
 * Signal-aware since 2026-07-04: content comes from the engine
 * (touchEmailContent), and a SUPPRESSED touch refuses to send — its job is
 * already done, and the crook test says never prod someone already served.
 * The operator's escape hatch for edge cases stays the GuestLinkPanel
 * (share the link any way they like).
 *
 * Deliberately NO revalidatePath: the panel renders the send outcome from
 * its own action state (the GuestLinkPanel precedent) — navigation renders
 * the persisted state fresh.
 */

const KINDS: TouchKind[] = ["WELCOME", "PLAN_AHEAD", "PRE_ARRIVAL", "RESUME"];

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

  // Recompute the plan server-side: a suppressed touch's job is already done,
  // so the send refuses even if a stale panel still shows a button.
  const signals = await loadTouchSignals(stay);
  const row = buildTouchPlan(stay, stay.property.timezone, [], signals).find(
    (r) => r.kind === kind,
  );
  if (row?.status === "suppressed") {
    return {
      ok: false,
      error: `Not sent — ${row.suppressReason ?? "its job is already done."}`,
    };
  }

  const tokenId = liveTokenId(stay.accessTokens);
  if (!tokenId) {
    return { ok: false, error: "No live guest link to send — mint one first." };
  }

  // Claim the touch BEFORE sending. The guestTouches check above is the fast,
  // friendly path; THIS create is the lock — @@unique([stayId, kind]) makes it
  // atomic, so two concurrent submits (two tabs / two operators) can't both
  // get past it and send the guest the same email twice. We finalize the
  // channel + recipient after the send, and release the claim if it fails.
  try {
    await prisma.guestTouch.create({
      data: { stayId, kind, channel: "pending", sentTo: null },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "Already sent — the record below has the date." };
    }
    console.error("[ops] touch claim failed:", err);
    return { ok: false, error: "Couldn't start the send — try again." };
  }

  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";

  let result;
  if (kind === "WELCOME") {
    result = await sendWelcomeEmail({
      guest: stay.guest,
      stay,
      property: stay.property,
      link: `${base}/t/${buildToken(tokenId)}`,
    });
  } else {
    const content = touchEmailContent(kind, {
      guestFirstName: stay.guest.firstName,
      propertyName: stay.property.name,
      dateRange: formatDateRange(
        stay.arrivalDate,
        stay.departureDate,
        stay.property.timezone,
      ),
      signals,
    });
    // ?next= is validated relative-only server-side by the token route.
    const link = content.nextPath
      ? `${base}/t/${buildToken(tokenId)}?next=${encodeURIComponent(content.nextPath)}`
      : `${base}/t/${buildToken(tokenId)}`;
    result = await sendCadenceEmail(
      { guest: stay.guest, stay, property: stay.property, link },
      content,
    );
  }

  if (!result.sent) {
    // Send failed — release the claim so the operator can retry.
    await prisma.guestTouch
      .delete({ where: { stayId_kind: { stayId, kind } } })
      .catch(() => {});
    return {
      ok: false,
      error:
        result.reason === "no-email"
          ? "No email address on file for this guest."
          : result.reason === "opted-out"
            ? "This guest unsubscribed from email — honored, nothing sent."
            : result.reason === "not-configured"
              ? "Guest email is off (GUEST_EMAIL_FROM unset)."
              : "Send failed — try again or share the link another way.",
    };
  }

  // Finalize the claim with the real channel + recipient. Best-effort: the
  // email already went, so a write hiccup here must not throw — worst case the
  // panel shows the touch as "pending" until the next render.
  try {
    await prisma.guestTouch.update({
      where: { stayId_kind: { stayId, kind } },
      data: {
        channel: result.mode === "resend" ? "email" : result.mode,
        sentTo: result.to,
      },
    });
  } catch (err) {
    console.error("[ops] touch finalize failed (email already sent):", err);
  }

  return {
    ok: true,
    line:
      result.mode === "resend"
        ? `Sent to ${result.to}.`
        : `Printed to the server console (RESEND_API_KEY unset).`,
  };
}
