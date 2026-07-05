/**
 * Consent disclosure copy — client-safe (no server imports) so the checkbox
 * surfaces (perk claim, /plan contact, app-home prompt) and the server gate
 * share ONE source and the shown-vs-recorded disclosure can never drift.
 *
 * Version the disclosure: Guest.smsConsentVersion records which copy the
 * guest saw at the moment they opted in. Bump the version whenever the
 * wording changes materially.
 */

export const SMS_CONSENT_VERSION = "2026-07-04";

/** The reassurance line — friendly, not defensive (mvp-launch-line.md). */
export const SMS_REASSURANCE =
  "Only about your stay. Your driver, your delivery, a question from your concierge. Never spam, and you can stop any time.";

export const SMS_OPT_IN_LABEL = "Text me updates about my stay";
