/**
 * Client-safe `sms:` deep-link helpers — the platform rules ConciergeLinks
 * established, extracted so every operator-taps-from-their-own-phone surface
 * (GuestLinkPanel, the ops Nudge button) shares one implementation.
 *
 * The body syntax differs per platform:
 *   iOS / Mac → sms:<phone>&body=...
 *   Android   → sms:<phone>?body=...
 *   Desktop/unknown → NO sms link (callers fall back to copy).
 *
 * Hydration guard: UA is unknown at SSR, so callers keep platform `null`
 * until mounted — a bare `sms:` href renders first, the body resolves after.
 */

export type SmsPlatform = "ios" | "android" | "mac" | "other";

export function detectSmsPlatform(): SmsPlatform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Macintosh/.test(ua)) return "mac";
  return "other";
}

export function smsDeepLink(
  phone: string,
  message: string,
  platform: SmsPlatform | null,
): string | null {
  // Operator-typed phones may carry human formatting — make them dialable.
  const dialable = phone.replace(/[^+\d]/g, "");
  if (!dialable) return null;
  if (platform === "other") return null;
  if (platform === null) return `sms:${dialable}`;
  const body = encodeURIComponent(message);
  return platform === "android"
    ? `sms:${dialable}?body=${body}`
    : `sms:${dialable}&body=${body}`;
}
