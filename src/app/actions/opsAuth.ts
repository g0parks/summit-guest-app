"use server";

import { buildToken } from "@/lib/tokens";

/**
 * Magic-link sign-in for /ops — replaces sharing the raw OPS_KEY in a URL.
 * Emails a short-lived signed link to OPERATOR_EMAIL (the one ops inbox);
 * clicking it sets the ops cookie. Reuses the guest-token HMAC (tokens.ts),
 * Resend, and the existing OPS_KEY — the link's payload is just an expiry, and
 * the cookie value set on success is still OPS_KEY, so requireOperator is
 * unchanged. The /ops-key/<key> door stays as a fallback.
 */

export type OpsAuthResult = { ok: true } | { ok: false; error: string };

const FROM = "Summit Ops <ops@summitluxurylogistics.com>";
const TTL_MS = 15 * 60 * 1000; // link good for 15 minutes

export async function requestOpsMagicLink(): Promise<OpsAuthResult> {
  if (!process.env.OPS_KEY) {
    return { ok: false, error: "Ops access isn't configured." };
  }
  const to = process.env.OPERATOR_EMAIL;
  const apiKey = process.env.RESEND_API_KEY;
  if (!to || !apiKey) {
    return { ok: false, error: "Email isn't configured — can't send the link." };
  }

  const token = buildToken(`ops:${Date.now() + TTL_MS}`);
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const link = `${base}/ops-magic/${encodeURIComponent(token)}`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to,
        subject: "Your Summit ops sign-in link",
        text: `Sign in to the Summit ops console (expires in 15 minutes):\n\n${link}\n\nIf you didn't request this, ignore it.`,
      }),
    });
    if (!res.ok) {
      console.error(`[ops-auth] send failed: ${res.status} ${await res.text().catch(() => "")}`);
      return { ok: false, error: "Couldn't send the link — try again." };
    }
  } catch (err) {
    console.error("[ops-auth] send failed:", err);
    return { ok: false, error: "Couldn't send the link — try again." };
  }
  return { ok: true };
}
