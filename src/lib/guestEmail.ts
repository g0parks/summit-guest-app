import "server-only";
import type { Guest, Partner, Property, Stay } from "@prisma/client";
import { resolveBrand } from "./branding";
import { getConciergeContact } from "./concierge";
import { formatDateRange } from "./dates";

/**
 * Guest-facing email — deliberately separate from the operator seam
 * (notify.ts): different audience, different register, different gate.
 *
 * Gate: GUEST_EMAIL_FROM unset → disabled entirely (callers hide their
 * toggles; nothing may look broken). Set without RESEND_API_KEY → console
 * fallback prints the full email (zero-config dev mode, the notify.ts
 * precedent). Both set → real Resend send.
 *
 * Hard rule (shared with notify.ts): a send failure must NEVER fail or slow
 * the action that triggered it — callers report status honestly instead.
 *
 * Register: luxury, calm, no prices, never "exclusive"/"FREE".
 */

// SEAM: pre-arrival cadence (next phase) sends through this module.

export type GuestEmailConfig =
  | { enabled: true; from: string; mode: "resend" | "console" }
  | { enabled: false };

export function getGuestEmailConfig(): GuestEmailConfig {
  const from = process.env.GUEST_EMAIL_FROM?.trim();
  if (!from) return { enabled: false };
  return {
    enabled: true,
    from,
    mode: process.env.RESEND_API_KEY ? "resend" : "console",
  };
}

/** Honest send outcome — the ops panel renders this verbatim. */
export type GuestEmailResult =
  | { sent: true; to: string; mode: "resend" | "console" }
  | { sent: false; reason: "not-configured" | "no-email" | "send-failed" };

export async function sendWelcomeEmail(input: {
  guest: Guest;
  stay: Stay;
  property: Property & { partner: Partner | null };
  link: string;
}): Promise<GuestEmailResult> {
  const config = getGuestEmailConfig();
  if (!config.enabled) return { sent: false, reason: "not-configured" };

  const to = input.guest.email?.trim();
  if (!to) return { sent: false, reason: "no-email" };

  const { guest, stay, property, link } = input;
  const brand = resolveBrand(property);
  const concierge = getConciergeContact();
  const dates = formatDateRange(stay.arrivalDate, stay.departureDate, property.timezone);

  const subject = `Your stay at ${property.name} — everything in one place`;

  const conciergeLine = concierge.phone
    ? `Anything at all, anytime — text your concierge at ${concierge.phone}.`
    : concierge.email
      ? `Anything at all, anytime — email your concierge at ${concierge.email}.`
      : null;

  const text = [
    `${guest.firstName} —`,
    ``,
    `Your trip is set. ${property.name}, ${dates} — your itinerary, your`,
    `concierge, and everything arranged for your stay live in one place:`,
    ``,
    link,
    ``,
    `A little planning now means a seamless arrival — open your trip and`,
    `tell us what should be waiting.`,
    ...(conciergeLine ? [``, conciergeLine] : []),
    ``,
    `${brand.label}`,
    ...(brand.poweredBy ? [`powered by Summit`] : []),
  ].join("\n");

  const accent = brand.accentColor ?? "#2f4b3c"; // Summit Alpine Pine
  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f7f3ec;font-family:Georgia,'Times New Roman',serif;color:#26241f;">
    <div style="max-width:520px;margin:0 auto;padding:48px 28px;">
      <p style="font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#8b857a;margin:0 0 36px;">
        ${escapeHtml(brand.label)}${brand.poweredBy ? `<br /><span style="font-size:10px;letter-spacing:0.1em;">powered by Summit</span>` : ""}
      </p>
      <h1 style="font-size:26px;font-weight:400;line-height:1.25;margin:0 0 18px;">
        ${escapeHtml(guest.firstName)} — your trip is set.
      </h1>
      <p style="font-size:16px;line-height:1.6;margin:0 0 8px;">
        ${escapeHtml(property.name)}
      </p>
      <p style="font-size:15px;line-height:1.6;color:#6f6a60;margin:0 0 30px;">
        ${escapeHtml(dates)}
      </p>
      <p style="font-size:15px;line-height:1.65;margin:0 0 30px;">
        Your itinerary, your concierge, and everything arranged for your stay
        live in one place — ready when you are.
      </p>
      <p style="margin:0 0 30px;">
        <a href="${escapeAttr(link)}"
           style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-family:-apple-system,'Segoe UI',sans-serif;font-size:15px;font-weight:600;padding:14px 30px;border-radius:999px;">
          Open your trip
        </a>
      </p>
      <p style="font-size:14px;line-height:1.65;color:#6f6a60;margin:0 0 30px;">
        A little planning now means a seamless arrival — tap through and tell
        us what should be waiting.
      </p>
      ${conciergeLine ? `<p style="font-size:14px;line-height:1.65;color:#6f6a60;margin:0;">${escapeHtml(conciergeLine)}</p>` : ""}
    </div>
  </body>
</html>`;

  if (config.mode === "console") {
    // Zero-config dev mode: the full email, legible in the server log.
    console.info(
      [
        `[guest-email] console fallback (RESEND_API_KEY unset)`,
        `From:    ${config.from}`,
        `To:      ${to}`,
        `Subject: ${subject}`,
        ``,
        text,
      ].join("\n"),
    );
    return { sent: true, to, mode: "console" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: config.from, to, subject, text, html }),
    });
    if (!res.ok) {
      console.error(
        `[guest-email] send failed: ${res.status} ${await res.text().catch(() => "")}`,
      );
      return { sent: false, reason: "send-failed" };
    }
    return { sent: true, to, mode: "resend" };
  } catch (err) {
    console.error("[guest-email] send failed:", err);
    return { sent: false, reason: "send-failed" };
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replaceAll("'", "&#39;");
}
