import "server-only";
import type { Guest, Partner, Property, Stay } from "@prisma/client";
import { resolveBrand } from "./branding";
import { getConciergeContact } from "./concierge";
import { buildUnsubscribeToken, canEmail } from "./consent";
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

// The pre-arrival cadence (PLAN_AHEAD, PRE_ARRIVAL) sends through here —
// operator-triggered from the ops Touchpoints panel, recorded as GuestTouch.

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
  | { sent: false; reason: "not-configured" | "no-email" | "opted-out" | "send-failed" };

/* ── CAN-SPAM compliance — every guest email carries a working unsubscribe
      and our postal address, and the send-gate (consent.ts) is consulted
      before composing. List-Unsubscribe headers give inbox providers the
      one-click path (RFC 8058). ── */

const POSTAL_LINE =
  "Summit Luxury Logistics LLC · 7533 S Center View Ct, Ste N · West Jordan, UT 84084";

function compliance(guest: Guest): {
  footerText: string;
  footerHtml: string;
  headers: Record<string, string>;
} {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const token = buildUnsubscribeToken(guest.id);
  const pageUrl = `${base}/unsubscribe/${encodeURIComponent(token)}`;
  const privacyUrl = `${base}/privacy`;
  const oneClickUrl = `${base}/api/unsubscribe?token=${encodeURIComponent(token)}`;
  return {
    footerText: [``, `Unsubscribe: ${pageUrl}`, `Privacy: ${privacyUrl}`, POSTAL_LINE].join("\n"),
    footerHtml: `<p style="font-size:11px;line-height:1.6;color:#a8a294;margin:40px 0 0;">
        <a href="${escapeAttr(pageUrl)}" style="color:#a8a294;">Unsubscribe</a>
        &nbsp;·&nbsp;
        <a href="${escapeAttr(privacyUrl)}" style="color:#a8a294;">Privacy</a>
        &nbsp;·&nbsp; ${escapeHtml(POSTAL_LINE)}
      </p>`,
    headers: {
      "List-Unsubscribe": `<${oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

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
  if (!canEmail(input.guest)) return { sent: false, reason: "opted-out" };

  const { guest, stay, property, link } = input;
  const brand = resolveBrand(property);
  const concierge = getConciergeContact();
  const comply = compliance(guest);
  const dates = formatDateRange(stay.arrivalDate, stay.departureDate, property.timezone);

  const subject = `Your stay at ${property.name}`;

  const conciergeLine = concierge.phone
    ? `Your concierge is a text away at ${concierge.phone}.`
    : concierge.email
      ? `Your concierge is an email away at ${concierge.email}.`
      : null;

  const text = [
    `${guest.firstName},`,
    ``,
    `Your trip is set. ${property.name}, ${dates}. Your itinerary and`,
    `everything arranged for your stay are in one place:`,
    ``,
    link,
    ``,
    `Open it and tell us what should be waiting. A little now makes for an`,
    `easy arrival. Prefer text updates? Tap through and tell us your number.`,
    ...(conciergeLine ? [``, conciergeLine] : []),
    ``,
    `${brand.label}`,
    ...(brand.poweredBy ? [`powered by Summit`] : []),
    comply.footerText,
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
        ${escapeHtml(guest.firstName)}, your trip is set.
      </h1>
      <p style="font-size:16px;line-height:1.6;margin:0 0 8px;">
        ${escapeHtml(property.name)}
      </p>
      <p style="font-size:15px;line-height:1.6;color:#6f6a60;margin:0 0 30px;">
        ${escapeHtml(dates)}
      </p>
      <p style="font-size:15px;line-height:1.65;margin:0 0 30px;">
        Your itinerary and everything arranged for your stay are in one place,
        ready when you are.
      </p>
      <p style="margin:0 0 30px;">
        <a href="${escapeAttr(link)}"
           style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-family:-apple-system,'Segoe UI',sans-serif;font-size:15px;font-weight:600;padding:14px 30px;border-radius:999px;">
          Open your trip
        </a>
      </p>
      <p style="font-size:14px;line-height:1.65;color:#6f6a60;margin:0 0 30px;">
        Tap through and tell us what should be waiting. A little now makes for
        an easy arrival. Prefer text updates? Tell us your number inside.
      </p>
      ${conciergeLine ? `<p style="font-size:14px;line-height:1.65;color:#6f6a60;margin:0;">${escapeHtml(conciergeLine)}</p>` : ""}
      ${comply.footerHtml}
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
      body: JSON.stringify({ from: config.from, to, subject, text, html, headers: comply.headers }),
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

/* ── Cadence emails — same gate, same register, one shared renderer.
      CONTENT comes from the signal-aware engine (touchpoints.touchEmailContent);
      this layer owns delivery, branding, and compliance only. ── */

export type CadenceEmailInput = {
  guest: Guest;
  stay: Stay;
  property: Property & { partner: Partner | null };
  /** Tokened deep link (e.g. …/t/<token>?next=/plan). */
  link: string;
};

export type RenderedEmail = {
  subject: string;
  headline: string;
  paragraphs: string[];
  ctaLabel: string;
  closing: string | null;
};

export async function sendCadenceEmail(
  input: CadenceEmailInput,
  rendered: RenderedEmail,
): Promise<GuestEmailResult> {
  const config = getGuestEmailConfig();
  if (!config.enabled) return { sent: false, reason: "not-configured" };
  const to = input.guest.email?.trim();
  if (!to) return { sent: false, reason: "no-email" };
  if (!canEmail(input.guest)) return { sent: false, reason: "opted-out" };

  const comply = compliance(input.guest);
  const brand = resolveBrand(input.property);
  const concierge = getConciergeContact();
  const conciergeLine = concierge.phone
    ? `Your concierge is a text away at ${concierge.phone}.`
    : concierge.email
      ? `Your concierge is an email away at ${concierge.email}.`
      : null;

  const text = [
    `${input.guest.firstName},`,
    ``,
    ...rendered.paragraphs.flatMap((p) => [p, ``]),
    input.link,
    ...(rendered.closing ? [``, rendered.closing] : []),
    ...(conciergeLine ? [``, conciergeLine] : []),
    ``,
    `${brand.label}`,
    ...(brand.poweredBy ? [`powered by Summit`] : []),
    comply.footerText,
  ].join("\n");

  const accent = brand.accentColor ?? "#2f4b3c";
  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f7f3ec;font-family:Georgia,'Times New Roman',serif;color:#26241f;">
    <div style="max-width:520px;margin:0 auto;padding:48px 28px;">
      <p style="font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#8b857a;margin:0 0 36px;">
        ${escapeHtml(brand.label)}${brand.poweredBy ? `<br /><span style="font-size:10px;letter-spacing:0.1em;">powered by Summit</span>` : ""}
      </p>
      <h1 style="font-size:26px;font-weight:400;line-height:1.25;margin:0 0 24px;">
        ${escapeHtml(rendered.headline)}
      </h1>
      ${rendered.paragraphs
        .map(
          (p) =>
            `<p style="font-size:15px;line-height:1.65;margin:0 0 24px;">${escapeHtml(p)}</p>`,
        )
        .join("\n      ")}
      <p style="margin:0 0 30px;">
        <a href="${escapeAttr(input.link)}"
           style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-family:-apple-system,'Segoe UI',sans-serif;font-size:15px;font-weight:600;padding:14px 30px;border-radius:999px;">
          ${escapeHtml(rendered.ctaLabel)}
        </a>
      </p>
      ${rendered.closing ? `<p style="font-size:14px;line-height:1.65;color:#6f6a60;margin:0 0 30px;">${escapeHtml(rendered.closing)}</p>` : ""}
      ${conciergeLine ? `<p style="font-size:14px;line-height:1.65;color:#6f6a60;margin:0;">${escapeHtml(conciergeLine)}</p>` : ""}
      ${comply.footerHtml}
    </div>
  </body>
</html>`;

  if (config.mode === "console") {
    console.info(
      [
        `[guest-email] console fallback (RESEND_API_KEY unset)`,
        `From:    ${config.from}`,
        `To:      ${to}`,
        `Subject: ${rendered.subject}`,
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
      body: JSON.stringify({ from: config.from, to, subject: rendered.subject, text, html, headers: comply.headers }),
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

// The per-kind copy that used to live here (plan-ahead, pre-arrival) moved to
// the signal-aware engine: src/lib/touchpoints.ts touchEmailContent(). This
// file no longer decides WHAT a cadence email says — only how it's delivered.

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
