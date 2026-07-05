# Consent spine + Track A cadence — as built (2026-07-04)

Built in one sprint per Parker's 2026-07-04 authorization ("plan the consent
spine and track A build… really build this out"), off the locked plan
(`2026-06-22-nudge-cadence.md`) and the consent gate in `mvp-launch-line.md`.
Governing rules: the crook test (Ethical Charter — correct toward the guest's
own intent, never prod toward our gain; graceful exit always), channel doctrine
(app = interface, SMS Summit-initiated, email = documents), operator-triggered
only (no scheduler), milk-not-meat (consent honest, opt-out trivial).

## The consent spine

**Schema (`Guest`):** `emailOptOutAt` · `smsConsentAt` · `smsConsentSource` ·
`smsConsentVersion` · `smsOptOutAt`. Plus `TripIntake.smsConsent` (a World-B
lead's opt-in, applied to the Guest at conversion) and `TouchKind.RESUME`.
Migration `20260704095708_consent_spine_resume_touch` (hand-authored — the dev
Supabase project was paused; applies on wake / on prod deploy).

**The send-gate (`src/lib/consent.ts`):** `canEmail()` / `canSms()` — every
sender consults it; `recordSmsConsent()` (source + versioned disclosure,
clears a prior STOP: fresh express consent re-opens the channel) and
`recordEmailOptOut()` (idempotent, honored forever). Disclosure copy lives
client-safe in `consentCopy.ts` so what's SHOWN and what's RECORDED can't
drift. Email is opt-out (CAN-SPAM; relational stay email). SMS is opt-in only
(TCPA); no consent row → no text, no exceptions.

**Capture points (all explicit, all show the reassurance line):**
0. **The engagement gate (added same day, Parker: "text updates are
   necessary if someone wants to engage — more like a gate").** Completing a
   request in the wizard requires a textable number when the guest can't be
   texted yet: a "Where should updates go?" screen before the finish, framed
   as service coordination (which it genuinely is — driver, delivery,
   timing). Typing the number under the shown disclosure is the express-
   consent act; enforced client- and server-side on `mode=complete` only.
   "Finish later" stays ungated (graceful exit always), signals themselves
   stay one-tap, and /plan (World B lead capture) keeps its optional
   checkbox — the gate binds *order completion*, not curiosity. Fence, not
   pen: the guest can always exit; but an order Summit must coordinate needs
   a channel to coordinate on.
1. **App home card** (`TextUpdatesPrompt`, pre-arrival, retires on opt-in,
   never re-begs after a withdrawal) — the RentalCarPrompt register. The
   welcome email's "prefer texts?" line lands here. NOTE: the locked plan
   said "welcome (bind phone)"; the welcome interstitial stays bare by its
   own design doctrine — the home card, one tap past the threshold, is that
   capture point.
2. **Perk claim** (`ClaimForm`) — a second checkbox beside the existing
   marketing opt-in; recorded only when a phone exists to consent to.
3. **`/plan` contact step** (World B) — checkbox on the lead
   (`TripIntake.smsConsent`), applied to the Guest at ops conversion.

**Unsubscribe:** every guest email now carries a tokened unsubscribe link +
postal address (CAN-SPAM), and RFC 8058 one-click headers. `/unsubscribe/
[token]` = human confirm page (GET never mutates — scanners can't opt guests
out); `POST /api/unsubscribe` = the inbox-provider one-click. Tokens are
HMAC-signed (tokens.ts), no DB row, no expiry.

## Track A — the signal-aware cadence

**Engine (`src/lib/touchpoints.ts`):** `loadTouchSignals()` reads what the
guest has done (link opened · welcome crossed · /plan completed · requests
open/priced/confirmed); `buildTouchPlan()` computes due/suppressed/upcoming;
`touchEmailContent()` writes the words from the signals. guestEmail.ts now
owns delivery + compliance only, never content.

- **WELCOME** — unchanged (at booking; bespoke template).
- **PLAN_AHEAD** — suppressed when /plan is done or ≥2 services are in motion
  ("its job is already done" shows in ops instead of a send button).
- **PRE_ARRIVAL** — names what's set, what waits on their yes (quotes), what's
  still open; degrades to "you're all set" when everything's handled. Never
  suppressed.
- **RESUME (new)** — behavior-clocked, not calendar: opened the link, then
  quiet ≥4 days with nothing planned; stands down inside 3 days to arrival
  (PRE_ARRIVAL's job) and the moment they act on their own. One per stay.
- `sendTouch` re-checks suppression server-side and refuses ("never prod
  someone already served"); the operator's escape hatch stays GuestLinkPanel.

**Channel seam (`src/lib/notifications.ts`):** `resolveGuestChannel()` — SMS
when consented (the load-bearing channel), email fallback, none = capture a
contact first. Request-nudge drafts compose here now (moved from the ops
page). v1 SMS = the manual `sms:` draft, unchanged in behavior.

**Ops visibility:** the Touchpoints panel shows a consent line ("Email: ok.
Texts: no opt-in yet."), suppressed rows with reasons, and the RESUME row.

## Track B — the SMS pipe (SPEC ONLY — do not build until a PM is live)

Everything drops in BEHIND `notifications.ts`; nothing outside it changes:
- **Provider:** Twilio (or alt) replaces draft-composition with `sendSms()`.
- **A2P 10DLC:** the long pole (1–3 wk carrier approval). Entity exists —
  Summit Luxury Logistics LLC + EIN (vault, Summit — Master). Register the
  brand + one "customer care / account notifications" campaign; toll-free
  verification is the fallback path.
- **Inbound webhook:** STOP → `Guest.smsOptOutAt` + confirmation (carrier
  requirement); HELP → the concierge line; anything else → forwarded to the
  quiet escape hatch (channel doctrine: never promoted).
- **Quiet hours:** ~8am–9pm property time, enforced in the seam.
- **Consent classes:** trip nudges = transactional (established booking
  relationship); re-stay marketing = separate explicit opt-in, never mixed.
- **Counsel pass** on TCPA + Utah before the first programmatic send (flagged
  in mvp-launch-line.md; not legal advice).

## Copy

The three cadence emails + RESUME + all consent microcopy are in
`docs/email-copy-deck.md` for Parker's voice pass (the flyer-deck workflow:
rewrite lines, say "apply the copy doc").

## Deliberately NOT built (flag if tempted)

Auto-send/scheduler · post-stay touches · programmatic SMS · Twilio config ·
consent for marketing beyond the stay · any PM-facing surface.
