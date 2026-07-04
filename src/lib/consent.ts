import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { buildToken, verifyToken } from "./tokens";
import { SMS_CONSENT_VERSION } from "./consentCopy";

/**
 * The consent spine — the ONE place consent state is written and interpreted.
 * Every guest-facing sender consults these gates before composing anything
 * (decided 2026-06-23, docs/mvp-launch-line.md; built 2026-07-04).
 *
 * The legal shape, plainly:
 * - EMAIL is opt-out (CAN-SPAM): a message about the guest's own stay is
 *   relational, so email may open the relationship — but every send carries a
 *   working unsubscribe + our postal address, and emailOptOutAt is honored
 *   forever once set.
 * - SMS is opt-in ONLY (TCPA): no consent record → no text, no exceptions.
 *   A STOP/withdrawal beats an older consent; a fresh explicit opt-in after a
 *   STOP is new express consent and re-opens the channel.
 *
 * Milk-not-meat: consent honest, opt-out trivial. The disclosure copy is
 * versioned (consentCopy.ts) so we can always prove what was shown.
 */

type EmailConsentShape = { email: string | null; emailOptOutAt: Date | null };
type SmsConsentShape = {
  phone: string | null;
  smsConsentAt: Date | null;
  smsOptOutAt: Date | null;
};

/** May we email this guest? Address on file + hasn't unsubscribed. */
export function canEmail(guest: EmailConsentShape): boolean {
  return Boolean(guest.email?.trim()) && guest.emailOptOutAt == null;
}

/** May we text this guest? Opt-in only; the newest of consent/STOP wins. */
export function canSms(guest: SmsConsentShape): boolean {
  if (!guest.phone?.trim()) return false;
  if (guest.smsConsentAt == null) return false;
  return guest.smsOptOutAt == null || guest.smsOptOutAt < guest.smsConsentAt;
}

export type SmsConsentSource =
  | "perk-claim"
  | "plan-intake"
  | "app-home"
  | "intake-convert";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Record a fresh explicit opt-in. Also clears a prior STOP — a new express
 * consent legally re-opens the channel. Callable inside a transaction (the
 * enrollIntakeSignals precedent).
 */
export async function recordSmsConsent(
  db: Db,
  guestId: string,
  source: SmsConsentSource,
): Promise<void> {
  await db.guest.update({
    where: { id: guestId },
    data: {
      smsConsentAt: new Date(),
      smsConsentSource: source,
      smsConsentVersion: SMS_CONSENT_VERSION,
      smsOptOutAt: null,
    },
  });
}

/** Idempotent: first opt-out wins, re-clicks never move the date. */
export async function recordEmailOptOut(guestId: string): Promise<void> {
  await prisma.guest.updateMany({
    where: { id: guestId, emailOptOutAt: null },
    data: { emailOptOutAt: new Date() },
  });
}

/* ── Unsubscribe tokens — HMAC-signed like guest links (tokens.ts), no DB
      row, no expiry: an unsubscribe link in an old email must keep working. ── */

const UNSUB_PREFIX = "unsub:";

export function buildUnsubscribeToken(guestId: string): string {
  return buildToken(`${UNSUB_PREFIX}${guestId}`);
}

/** Verified guestId from an unsubscribe token, else null. */
export function parseUnsubscribeToken(token: string | null | undefined): string | null {
  const payload = verifyToken(token);
  if (!payload || !payload.startsWith(UNSUB_PREFIX)) return null;
  return payload.slice(UNSUB_PREFIX.length) || null;
}
