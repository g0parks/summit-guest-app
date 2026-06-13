import "server-only";
import { prisma } from "./db";
import { isFixedPrice } from "./catalog";
import { formatDayLabel, formatTime } from "./dates";
import { formatMoney } from "./money";
import { parseRequestDetails } from "./serviceForm";

/**
 * Operator notification seam. Fulfillment is manual: when a guest acts, the
 * operator needs to know. With RESEND_API_KEY + OPERATOR_EMAIL set this sends
 * a real email (plain fetch to Resend — no SDK dep); without them it falls
 * back to the structured console line, so dev/local works with zero config.
 *
 * Hard rule: a guest action must NEVER fail or slow down because email failed.
 * Everything past the console line is wrapped — this function never throws.
 */

/** Demo-sandbox marker: tags subjects and doubles as the PM-engagement signal. */
type DemoContext = {
  isDemo?: boolean;
  partnerName?: string | null;
};

export type OperatorEvent =
  | (DemoContext & {
      type: "service_requested";
      stayId: string;
      guestName: string;
      property: string;
      serviceName: string;
      requestId: string;
      requestedFor?: string | null;
      notes?: string | null;
    })
  | (DemoContext & {
      type: "change_requested";
      stayId: string;
      guestName: string;
      property: string;
      itemTitle: string;
      kind: string; // MOVE | CANCEL | MODIFY
      currentWhen: string;
      requestedWhen?: string | null;
      note?: string | null;
    })
  | (DemoContext & {
      type: "quote_approved";
      stayId: string;
      guestName: string;
      property: string;
      serviceName: string;
      requestId: string;
      amountCents: number;
    })
  | (DemoContext & {
      type: "card_added";
      stayId: string;
      guestName: string;
      brand: string;
      last4: string;
    })
  | (DemoContext & {
      type: "perk_claimed";
      stayId: string;
      guestName: string;
      property: string;
      perkName: string;
      email?: string | null;
      phone?: string | null;
      optIn: boolean;
    })
  | (DemoContext & {
      type: "trip_intake";
      intakeId: string;
      name: string | null;
      email: string | null;
      phone: string | null;
      tripTiming: string | null;
      interests: string[]; // resolved short labels
      declined: string[];
      note: string | null;
      source: string | null;
      stayId: string | null; // known-guest session, when present
    });

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
/**
 * Subject prefix. Demo sandboxes are tagged loudly — and carry the partner
 * name, so post-pitch leave-behind activity says WHICH PM is engaging.
 */
function subjectTag(event: OperatorEvent): string {
  if (!event.isDemo) return "[Summit]";
  return event.partnerName ? `[Summit DEMO · ${event.partnerName}]` : "[Summit DEMO]";
}

async function buildEmail(
  event: OperatorEvent,
): Promise<{ subject: string; text: string }> {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const tag = subjectTag(event);

  if (event.type === "change_requested") {
    const ask =
      event.kind === "CANCEL"
        ? "cancel it"
        : event.kind === "MOVE"
          ? `move it${event.requestedWhen ? ` to ${event.requestedWhen}` : ""}`
          : "change it";
    return {
      subject: `${tag} Change asked — ${event.itemTitle} — ${event.guestName}`,
      text: [
        `Guest:     ${event.guestName}`,
        `Property:  ${event.property}`,
        `Item:      ${event.itemTitle}`,
        `Currently: ${event.currentWhen}`,
        `Asking to: ${ask}`,
        event.note ? `Note: ${event.note}` : null,
        ``,
        `ACTION: apply or decline in the ops Changes queue — the guest sees`,
        `"Being rearranged" until you do.`,
        ``,
        `Stay: ${base}/ops/stays/${event.stayId}`,
      ].filter((l): l is string => l !== null).join("\n"),
    };
  }

  if (event.type === "quote_approved") {
    return {
      subject: `${tag} Approved — ${event.serviceName} at ${formatMoney(event.amountCents)} — ${event.guestName}`,
      text: [
        `Guest:    ${event.guestName}`,
        `Property: ${event.property}`,
        `Service:  ${event.serviceName}`,
        `Approved: ${formatMoney(event.amountCents)} — pending on the guest's tab`,
        ``,
        `ACTION: book the vendor — the guest has said yes.`,
        ``,
        `Stay: ${base}/ops/stays/${event.stayId}`,
      ].join("\n"),
    };
  }

  if (event.type === "card_added") {
    return {
      subject: `${tag} Card added — ${event.guestName}`,
      text: [
        `${event.guestName} added a card on file (${event.brand} •••• ${event.last4}).`,
        `An engaged guest — tab is live.`,
        ``,
        `Stay: ${base}/ops/stays/${event.stayId}`,
      ].join("\n"),
    };
  }

  if (event.type === "trip_intake") {
    // First-party behavioral signal only: multiple interests or an open note
    // = a lead worth jumping on. Make that legible in the subject.
    const priority = event.interests.length >= 2 || Boolean(event.note);
    const who = event.name || "Someone";
    const hasContact = Boolean(event.email || event.phone);
    const bits = [
      `${event.interests.length} interest${event.interests.length === 1 ? "" : "s"}`,
      event.note ? "note" : null,
      hasContact ? null : "no contact left",
    ].filter(Boolean);

    return {
      subject: `${tag} ${priority ? "★ PRIORITY trip intake" : "Trip intake"} — ${who} (${bits.join(" · ")})`,
      text: [
        `Name:      ${event.name ?? "—"}`,
        `Email:     ${event.email ?? "—"}`,
        `Phone:     ${event.phone ?? "—"}`,
        `Timing:    ${event.tripTiming ?? "—"}`,
        `Interested: ${event.interests.length ? event.interests.join(", ") : "—"}`,
        `Passed on: ${event.declined.length ? event.declined.join(", ") : "—"}`,
        event.note ? `` : null,
        event.note ? `Note: ${event.note}` : null,
        event.source ? `Source: ${event.source}` : null,
        ``,
        hasContact
          ? `ACTION: send their trip plan — they're expecting to hear from you.`
          : `No contact left — logged for the record; nothing to send.`,
        ``,
        event.stayId ? `Stay: ${base}/ops/stays/${event.stayId}` : `Ops: ${base}/ops`,
      ].filter((l): l is string => l !== null).join("\n"),
    };
  }

  if (event.type === "perk_claimed") {
    return {
      subject: `${tag} Perk claimed — ${event.perkName} — ${event.guestName}`,
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
  const details = parseRequestDetails(request?.detailsJson);
  const lines = [
    `Guest:    ${event.guestName}`,
    `Property: ${event.property}`,
    `Service:  ${event.serviceName}`,
    when ? `When:     ${formatDayLabel(when, tz)} · ${formatTime(when, tz)}` : null,
    request?.partySize != null ? `Party:    ${request.partySize}` : null,
    ...details.map((d) => `${d.label}: ${d.value}`),
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
    subject: `${tag} ${event.serviceName} — ${event.guestName} @ ${event.property}`,
    text: lines.join("\n"),
  };
}
