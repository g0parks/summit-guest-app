# Nudge Cadence — scoped plan (2026-06-22)

Scoping for the re-engagement / nudge-cadence development session. Decisions
below are **locked** (Parker, 2026-06-22). The build session plan-modes off this.

## Why this matters
The guest app has **no native shell → no push notifications.** SMS is therefore
the *only* proactive channel that reliably lands; email is a weak fallback
(open rates). Pre-arrival is a multi-touch **window**, not a single session: the
welcome threshold just gets a guest in the door — the **cadence is what brings
them back**, and first-tap abandonment is expected and fine. Capturing a
reachable contact + nudging it well is the load-bearing re-engagement spine
(more important than welcome-copy polish). On-doctrine: this turns the
already-happening pre-arrival window into completed essentials.

## Current state — EXTEND, don't rebuild
- **`src/lib/touchpoints.ts`** — cadence engine: 3 touches (`WELCOME` /
  `PLAN_AHEAD` / `PRE_ARRIVAL`), status `due / upcoming / sent / lapsed`.
  ⚠ Explicitly stamped **"v1 placeholder, SIGNAL-BLIND"** — naive calendar math
  off booking + arrival dates; knows nothing about what the guest has done.
  Nothing auto-fires; it surfaces "due" for the operator's glance.
- **`src/app/actions/touchpoints.ts`** (`sendTouch`) — email is **already
  programmatic**: operator taps in the Touchpoints panel → Resend, idempotent
  `GuestTouch` record (claim-before-send on `@@unique([stayId, kind])`),
  `/t/<token>?next=` deep links, console fallback when unconfigured.
- **`src/lib/smsLink.ts` + `NudgeButton`** — SMS is **manual only**: `sms:`
  drafts the operator sends *from their own phone*. No provider, no programmatic
  send, doesn't scale past the dev phone. Used for per-request lifecycle nudges.
- **`GuestTouch`** model — per-stay-per-kind dedup; `TouchpointsPanel` renders it.

## The split (LOCKED) — intelligence decouples from the SMS pipe
**Track A — the intelligence:** signal-aware cadence logic. Pure backend/ops, no
new infra, no legal gate. **Build now.**
**Track B — the SMS pipe:** programmatic SMS + the legal/registration apparatus.
Lead-time + legal gated; needs a live PM and real recipients to test.
**Kick off (start the 10DLC clock, spec the seam), do not build.**

---

## Track A — signal-aware cadence (BUILD NOW)

Replace the signal-blind placeholder with the decided, signal-aware cadence,
behind a notification seam. **Stays operator-triggered** (doctrine: the system
surfaces what's due, a human decides + sends — no scheduler, no auto-send). The
win is *sharper* "due" items and *suppressed* pointless ones, not automation.

### Signals available (read-only, already in the DB)
- `TripIntake` — did `/plan` complete? `answersJson` interests.
- `ServiceRequest` statuses — what's signaled / open / confirmed; a `QUOTED`
  request awaiting the guest's approval tap.
- `Stay.welcomeSeenAt` — crossed the welcome threshold (opened the app)?
- `AccessToken.lastAccessedAt` — opened the link at all?
- Stay phase / dates, `hasRentalCar`, `partySize`.

### Decided rules
- **WELCOME** — unchanged (at booking: the link).
- **PLAN_AHEAD** — **suppress** if `/plan` already completed *or* several
  services already in motion. Its job is to *invite* planning; don't invite
  someone who's already planned.
- **PRE_ARRIVAL** — content is **signal-aware**, naming what's *still open*:
  "the car's set — want the kitchen stocked before you land?" If everything's
  handled, it degrades to a warm "you're all set, see you soon."
- **RESUME (new) — the abandonment nudge, highest-value re-engager.**
  Behavior-gated, not calendar: opened the link / crossed the threshold but
  didn't finish (`welcomeSeenAt`/`lastAccessedAt` set, no completed intake or
  booking), after a quiet-period threshold. One per stay.
- **Request-lifecycle nudges** (quote-waiting, confirmation) — keep as-is
  (per-request) for now, but route through the new seam so SMS drops in later.

### Architecture direction
- **`NotificationProvider` clean-seam** (mirror the `PaymentProvider` stub
  pattern): one `notify(channel, payload)` with channel resolution — SMS when
  consent + phone are present, else email. **v1: SMS resolves to the manual
  `sms:` draft surface;** Track B swaps Twilio in behind the *same* interface.
  Email keeps the existing Resend path.
- **Cadence-engine refactor:** model each touch as
  `{ isDue(stay, signals, now), isSuppressed(stay, signals), content(stay, signals) }`.
  Keep the surfacing (Touchpoints panel) + `GuestTouch` dedup.
- `RESUME` likely a new `TouchKind` → small enum migration (migrate-on-deploy
  handles prod). Dev session confirms enum-vs-separate-row in plan-mode.

### Out of scope for Track A
Programmatic SMS, any auto-send/scheduler, post-stay touches.

---

## Track B — the SMS pipe (KICK OFF, DON'T BUILD)

Gated on a live PM + legal. But **start the A2P 10DLC registration clock now** —
it's the long pole.

- **Provider** (Twilio or alt) behind the `NotificationProvider` seam.
- **A2P 10DLC** brand + campaign registration — 1–3 wk carrier approval, needs a
  registered business; begin early. (Toll-free verification is the alternative.)
- **TCPA** — explicit consent for marketing; trip nudges are **transactional**
  (established booking relationship, lower bar) but still require mandatory
  STOP/HELP handling + quiet hours (≈8am–9pm local).
- **Inbound webhook** — STOP → suppress + record; replies → route to the quiet
  escape-hatch concierge line (channel doctrine: inbound texting is the
  unpromoted escape hatch, not the interface).
- **Consent capture points (LOCKED):** fold SMS opt-in into surfaces we already
  have / just shipped — the Perk claim (already opt-in), the `/plan` contact
  step, and the welcome (bind phone). Transactional trip nudges vs.
  explicit-opt-in re-stay marketing.

### Legal gates (FLAG — needs a real check; architect for it, don't pretend)
TCPA consent + opt-out + quiet hours; A2P 10DLC / toll-free verification. These
intersect the existing **legal/insurance** pre-launch blocker.

---

## Out of scope (do NOT build — flag if tempted)
- **Post-stay sentiment / re-stay marketing cadence** — doctrine: nothing pushed
  until the guest is home; the post-stay capture stays passive/guest-initiated.
- **Auto-send / scheduler** — stays operator-triggered; the seam allows a later
  flip, but v1 keeps the human in the loop.
- **Inbound chat / guest-facing bot.**

## Open questions for the build session (resolve in plan-mode)
- `RESUME`: new `TouchKind` vs. a separate nudge row? Quiet-period threshold value?
- Channel-resolution policy in the seam when both email + SMS are available.
- Which `ServiceRequest` statuses count as "still open" for PRE_ARRIVAL content.

---

## Kickoff prompt (fire this at the build session)

> Build **Track A of the nudge cadence** per `docs/plans/2026-06-22-nudge-cadence.md`
> (read it + CLAUDE.md first). Scope: replace the signal-blind cadence placeholder
> in `src/lib/touchpoints.ts` with the decided **signal-aware** cadence, behind a
> new `NotificationProvider` clean-seam (mirror the `PaymentProvider` stub). Add
> the **RESUME** abandonment nudge. Sharpen PRE_ARRIVAL content to name what's
> still open; suppress PLAN_AHEAD when `/plan` is already done. Route the existing
> per-request lifecycle nudges through the seam. Also write the **Track B spec**
> (the SMS-pipe section: provider-behind-seam, TCPA/10DLC, consent capture points,
> inbound webhook) as design notes — **do NOT build the provider, no Twilio, no
> auto-send.**
>
> Guardrails: **operator-triggered only** (system surfaces "due," a human sends —
> no scheduler). Channel doctrine (SMS Summit-initiated + purposeful; email =
> documents; inbound = quiet escape hatch). The register (calm, presupposing;
> essentials-with-taste, NOT a concierge-genie). Milk-not-meat (consent honest,
> opt-out trivial). Co-brand quiet; never surface rev-share. This is the
> re-engagement spine, not guest-app features — don't gold-plate the app.
>
> Process: **plan mode first** — propose approach + schema + file structure and
> WAIT for approval. Strict TS, no `any`. Run lint + typecheck before commit.
> Feature branch, conventional commits, per-file summary. **Stop and check in
> before merging.**
