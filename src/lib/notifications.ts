import "server-only";
import { canEmail, canSms } from "./consent";

/**
 * NotificationProvider — the guest-notification channel seam (nudge-cadence
 * plan Track A, 2026-06-22). Mirrors the PaymentProvider stub: the INTERFACE
 * is stable, the transport graduates behind it (POS principle).
 *
 * v1 transports:
 * - email → the programmatic Resend path (guestEmail.ts)
 * - sms   → a composed DRAFT the operator sends from their own phone
 *           (smsLink.ts / NudgeButton surfaces). No provider, no auto-send.
 *
 * Track B drops Twilio (or alt) in BEHIND this module, nothing outside it
 * changes: sendSms() replaces draft-hand-off; an inbound webhook records
 * STOP → Guest.smsOptOutAt and routes replies to the quiet concierge line
 * (channel doctrine: inbound is the unpromoted escape hatch); quiet hours
 * ~8am–9pm property time; transactional trip nudges stay separate from
 * explicit-opt-in marketing. A2P 10DLC registration is the long pole —
 * start it before Track B is built (LLC + EIN exist; see vault).
 *
 * The crook test (Ethical Charter) governs every message composed here:
 * correct toward the GUEST's own intent and safety — finish what they
 * started, surface what waits on them — never prod toward our gain against
 * their interest. Graceful exit always.
 */

export type GuestChannel = "sms" | "email" | "none";

type ChannelShape = {
  email: string | null;
  emailOptOutAt: Date | null;
  phone: string | null;
  smsConsentAt: Date | null;
  smsOptOutAt: Date | null;
};

/**
 * Which channel may proactively reach this guest? SMS when consented — it's
 * the load-bearing re-engagement channel (no native push). Email is the
 * document channel and the fallback. "none" = the app itself is the only
 * surface (nothing sendable; capture a contact first).
 */
export function resolveGuestChannel(guest: ChannelShape): GuestChannel {
  if (canSms(guest)) return "sms";
  if (canEmail(guest)) return "email";
  return "none";
}

/**
 * Concierge-register nudge draft for a stalled request — a stalled signal
 * asks for details; an outstanding quote asks for the yes. Composed here so
 * the seam owns message copy (moved from the ops overview page); the deep
 * link always lands back in the app (channel doctrine).
 */
export function composeRequestNudge(input: {
  firstName: string;
  status: string;
  what: string;
  link: string;
}): string {
  return input.status === "QUOTED"
    ? `Hi ${input.firstName}, your concierge here. ${input.what} is priced and ready. One tap to approve and it's done: ${input.link}`
    : `Hi ${input.firstName}, your concierge here. ${input.what} is nearly arranged. A few details and it's done: ${input.link}`;
}

/**
 * The card didn't go through. Crook test: this serves the guest's own booking —
 * their arrangement is at risk and only they can fix it — so it says what
 * happened plainly, once, with the fix one tap away. No urgency theater, no
 * amount (a number in an SMS reads like a demand), no mention of what breaks.
 */
export function composeCardUpdateNudge(input: {
  firstName: string;
  what: string;
  link: string;
}): string {
  return (
    `Hi ${input.firstName}, your concierge here. The card on file didn't go through ` +
    `for ${input.what} — update it here and we'll take care of the rest: ${input.link}`
  );
}
