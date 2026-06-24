# Summit MVP — the launch line

**Decided 2026-06-19 (Parker).** The point of this doc: stop "working on the
app" from being the thing you do *instead of* launching.

## The line

**MVP = the first PM signed and live** — a boutique Deer Valley STR PM has said
yes, and their guests are getting the link. Not "more app." Not a finished
transaction. **A PM, live.**

## The rule (the anti-diverter)

**The guest app is feature-frozen for MVP.** It already nails the three things
the experience must do — itinerary · catalog + low-friction request flow ·
running tab — plus `/plan`, the request box, the broker's book, and the ops
console. **No new workstreams until a PM is live.**

The only sanctioned app work before launch:
1. **Doctrine-eval polish** — run `docs/summit-eval.md`, fix the FAILs.
2. **The joint copy pass** — density + voice (fee structure, bar tab, etc.).
3. **Bugs real usage surfaces.**

If a piece of work isn't one of those three, it's the diversion — **say no.**

## The first transaction to make real: the two heroes

**Transport + grocery.** Fulfillment only needs to cover *those two* for the
pilot — not the whole catalog. Everything else on the menu can ride "your
concierge will arrange it" until there's real demand.

## The launch checklist — the four real blockers

All four are **non-app**, and they ARE the work (Parker flagged all four):

1. **A committed PM partner** — the gating act, and the finish line itself. One
   boutique Deer Valley STR PM who'll put the link in front of guests.
2. **Fulfillment ops, scoped to the two heroes** — grocery (Grocery Girls) + a
   transport driver, plus the in-home-entry process. Ready enough that a guest's
   first request actually gets fulfilled.
3. **How money moves** — pick the lightest *real* path for the pilot (manual
   invoice / offline card now; real Stripe later). Don't let payments gate the PM.
4. **Legal / insurance** — in-home-entry coverage is the real one. DABS/alcohol
   is **not** needed for MVP (the heroes are transport + grocery; alcohol
   fulfillment stays deferred).

## Consent capture — the pre-launch gate that can't be backfilled

**The asymmetry (why this is a gate, not a roadmap-someday):** consent you didn't
capture from a guest is consent you can never get back. Every guest onboarded
before the opt-in exists is a guest you can never legally text — and SMS is the
load-bearing re-engagement channel (the app has no native push). So the
*capture* must be live before guest #1, even though the *cadence* (the sending)
stays deferred (Track A/B, `docs/plans/2026-06-22-nudge-cadence.md`).

**The decided shape (Parker, 2026-06-23) — email-first, SMS-as-backup:**
1. **Email is the first touch, and needs no opt-in.** US email is opt-out
   (CAN-SPAM); a message about the guest's own stay is relationship/transactional.
   A **Summit-controlled email** (separate from the PM's booking email, ~1 month
   pre-arrival) invites the guest into their stay with good copy + an opt-in CTA.
   This channel does the work first; let it sit before any text.
2. **SMS is opt-in only, gated behind that email.** TCPA requires prior express
   consent ($500–$1,500/text exposure). The guest opts in → enters or confirms a
   phone. SMS fires only as a **backup** for guests who didn't engage the email —
   never as the first touch, never without the checkbox.
3. **At phone capture, a friendly reassurance line (not defensive):** e.g.
   "We'll only text you about your stay — your driver, your delivery, a question —
   never spam." Honest consent, trivial opt-out (milk-not-meat).

**The thin layer to build before launch (this is NOT the cadence):**
- **Consent fields on `Guest`** — `emailOptOutAt`, `smsConsentAt` (+ source +
  disclosure version), `smsOptOutAt`. *(Schema gap confirmed 2026-06-23: `Guest`
  carries `email`/`phone` but no consent state — nothing separates "we have a
  phone" from "they let us text.")*
- **One send-gate** — `canEmail()` / `canSms()` that every sender consults; wire
  `src/lib/guestEmail.ts` to it now so future cadence is compliant by default.
- **A consent-capture point** at phone collection (welcome / `/plan` contact /
  perk claim) writing `smsConsentAt` + the reassurance copy.
- **Email unsubscribe** (tokened, reuse token infra) → sets `emailOptOutAt`;
  link in the footer + a physical mailing address (CAN-SPAM requirement).

**Deliverability (config, not build):** the lever is domain auth, not warming —
confirm SPF + DKIM + **DMARC** are green in Resend (the lead email proves
SPF/DKIM; verify DMARC for the Google/Yahoo sender rules). No IP warming at this
volume; stay on Resend's shared pool. A sending subdomain
(`mail.summitluxurylogistics.com`) is a later optimization, not a blocker.

Deeper SMS architecture (the `NotificationProvider` seam, 10DLC/toll-free, STOP
webhook, channel resolution) lives in the nudge-cadence plan. This section is
just the **consent spine** that must exist before the first real guest. Not legal
advice — worth a counsel pass on Utah + TCPA before the first send.

## Definition of done → the trigger

**PM signed + first guest link sent → stop building, start operating.** After
that, the only app changes are what real guests actually trip on.

## What this means today

The app is **past MVP for this line.** The bottleneck is sales (the PM) +
operational readiness (#2–4), not code. That's where the energy goes.

## Explicitly OUT of MVP (the divert list — post-first-PM)

WS2 fee-structure · WS3 bar menu redesign · WS4 ski school · WS5 roster intake ·
alcohol fulfillment · real Stripe/Connect · outbound SMS cadence · deposit/refund
build · PMS integration · vendor automation. All good ideas. None of them sign a PM.
