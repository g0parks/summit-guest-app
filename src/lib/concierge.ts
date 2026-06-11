import "server-only";

/**
 * The Concierge Line — config + message composition (decided 2026-06-10).
 * The thread is the interface; the app is the receipt: support + change
 * requests are ONE feature. The guest texts a human; the operator applies
 * changes in /ops; the app shows canonical state. No in-app chat, no bot.
 *
 * The number is config, not code: CONCIERGE_PHONE (E.164) + CONCIERGE_EMAIL.
 * Phone unset → text/call CTAs quietly absent, email fallback only. Both
 * unset → surfaces absent entirely. Nothing may look broken without them.
 */

/**
 * Normalize CONCIERGE_PHONE to strict E.164 ("+14355550100"). Tolerates
 * human formatting — "+1 (435) 555-0100" works pasted as-is. Anything that
 * doesn't resolve to +<8–15 digits> (e.g. missing the +country prefix) is
 * rejected LOUDLY in the server log and treated as unset, because a malformed
 * value would otherwise ship dead sms:/tel: links on every surface with no
 * error anywhere.
 */
function normalizePhone(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const cleaned = (trimmed.startsWith("+") ? "+" : "") + trimmed.replace(/\D/g, "");
  if (/^\+\d{8,15}$/.test(cleaned)) return cleaned;
  console.error(
    `[concierge] CONCIERGE_PHONE ${JSON.stringify(trimmed)} is not E.164 ` +
      `(expected like "+14355550100", country code included) — ` +
      `text/call CTAs are disabled until it's fixed.`,
  );
  return null;
}

export function getConciergeContact(): { phone: string | null; email: string | null } {
  return {
    phone: normalizePhone(process.env.CONCIERGE_PHONE),
    email: process.env.CONCIERGE_EMAIL?.trim() || null,
  };
}

/*
 * Message builders — pure functions. The prefilled body is what gives the
 * operator stay context with ZERO inbound integration: the text arrives from
 * an unknown number, but it introduces itself. Trailing space intentional —
 * the guest types straight after the context.
 */

/** Itinerary-item change ask: who, where, which item, when. */
export function changeMessage(input: {
  guestFirstName: string;
  propertyName: string;
  itemTitle: string;
  whenLabel: string;
}): string {
  return `Hi — it's ${input.guestFirstName} at ${input.propertyName}. About "${input.itemTitle}" (${input.whenLabel}): `;
}

/** General ask from any stay surface: who + where. */
export function generalMessage(input: {
  guestFirstName: string;
  propertyName: string;
}): string {
  return `Hi — it's ${input.guestFirstName} at ${input.propertyName}. `;
}

/** /invalid has no stay context — generic Summit voice. */
export function invalidLinkMessage(): string {
  return "Hi — my trip link isn't working. ";
}

/** Close of the /plan intake — World-B lead, no stay context yet. */
export function intakeFollowupMessage(): string {
  return "Hi — I just finished planning my trip with you. ";
}
