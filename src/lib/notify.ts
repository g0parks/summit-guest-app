import "server-only";
import { prisma } from "./db";
import { isFixedPrice } from "./catalog";
import { formatDayLabel, formatTime } from "./dates";
import { formatMoney } from "./money";

/**
 * Operator notification seam. Fulfillment is manual: when a guest acts, the
 * operator needs to know. With RESEND_API_KEY + OPERATOR_EMAIL set this sends
 * a real email (plain fetch to Resend — no SDK dep); without them it falls
 * back to the structured console line, so dev/local works with zero config.
 *
 * Hard rule: a guest action must NEVER fail or slow down because email failed.
 * Everything past the console line is wrapped — this function never throws.
 */

export type OperatorEvent =
  | {
      type: "service_requested";
      stayId: string;
      guestName: string;
      property: string;
      serviceName: string;
      requestId: string;
      requestedFor?: string | null;
      notes?: string | null;
    }
  | {
      type: "card_added";
      stayId: string;
      guestName: string;
      brand: string;
      last4: string;
    }
  | {
      type: "perk_claimed";
      stayId: string;
      guestName: string;
      property: string;
      perkName: string;
      email?: string | null;
      phone?: string | null;
      optIn: boolean;
    };

// onboarding@resend.dev works out of the box but only delivers to the Resend
// account owner — fine for single-operator MVP. Verified domain = upgrade path.
const FROM = "Summit Ops <onboarding@resend.dev>";

export async function notifyOperator(event: OperatorEvent): Promise<void> {
  console.info(`[operator] ${event.type}`, JSON.stringify(event));

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.OPERATOR_EMAIL;
  if (!apiKey || !to) return; // no email config → console-only (dev/local)

  try {
    const { subject, text } = await buildEmail(event);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to, subject, text }),
    });
    if (!res.ok) {
      console.error(
        `[operator] email send failed: ${res.status} ${await res.text().catch(() => "")}`,
      );
    }
  } catch (err) {
    console.error("[operator] email send failed:", err);
  }
}

/**
 * Subject + plain-text body. For service requests, party size / quote-needed /
 * timezone are pulled from the DB here (the event payload and its call sites
 * stay unchanged); if the lookup fails we still send the basics from the event.
 */
async function buildEmail(
  event: OperatorEvent,
): Promise<{ subject: string; text: string }> {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";

  if (event.type === "card_added") {
    return {
      subject: `[Summit] Card added — ${event.guestName}`,
      text: [
        `${event.guestName} added a card on file (${event.brand} •••• ${event.last4}).`,
        `An engaged guest — tab is live.`,
        ``,
        `Stay: ${base}/ops/stays/${event.stayId}`,
      ].join("\n"),
    };
  }

  if (event.type === "perk_claimed") {
    return {
      subject: `[Summit] Perk claimed — ${event.perkName} — ${event.guestName}`,
      text: [
        `Guest:    ${event.guestName}`,
        `Property: ${event.property}`,
        `Perk:     ${event.perkName}`,
        `Email:    ${event.email ?? "—"}`,
        `Phone:    ${event.phone ?? "—"}`,
        `Opt-in:   ${event.optIn ? "YES — future-stays contact" : "no"}`,
        ``,
        `ACTION: arrange the perk, then mark it fulfilled in ops.`,
        ``,
        `Stay: ${base}/ops/stays/${event.stayId}`,
      ].join("\n"),
    };
  }

  const request = await prisma.serviceRequest
    .findUnique({
      where: { id: event.requestId },
      include: { service: true, stay: { include: { property: true } } },
    })
    .catch(() => null);

  const tz = request?.stay.property.timezone;
  const needsQuote = request
    ? !request.service ||
      !isFixedPrice(request.service.priceUnit, request.service.priceAmount)
    : false;

  const when = event.requestedFor ? new Date(event.requestedFor) : null;
  const lines = [
    `Guest:    ${event.guestName}`,
    `Property: ${event.property}`,
    `Service:  ${event.serviceName}`,
    when ? `When:     ${formatDayLabel(when, tz)} · ${formatTime(when, tz)}` : null,
    request?.partySize != null ? `Party:    ${request.partySize}` : null,
    request?.service && isFixedPrice(request.service.priceUnit, request.service.priceAmount)
      ? `Price:    ${formatMoney(request.service.priceAmount, request.stay.currency)} (${request.service.priceUnit.toLowerCase()})`
      : null,
    event.notes ? `Notes:    ${event.notes}` : null,
    ``,
    needsQuote
      ? `ACTION: needs quote — price it in the ops console.`
      : `Auto-confirmed and on the guest's tab.`,
    ``,
    `Stay: ${base}/ops/stays/${event.stayId}`,
  ].filter((l): l is string => l !== null);

  return {
    subject: `[Summit] ${event.serviceName} — ${event.guestName} @ ${event.property}`,
    text: lines.join("\n"),
  };
}
