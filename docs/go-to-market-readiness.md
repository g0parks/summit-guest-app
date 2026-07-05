# Aerie — go-to-market readiness (2026-07-04)

**What this is:** the answer to "what needs to happen before I have a fully fledged
product I can sell as such to PMs." Drafted by Claude from the 2026-07-04 audit;
items marked **OPEN** are Parker's decisions or off-keyboard work. This doc extends
`docs/mvp-launch-line.md` — it does not replace it, and the anti-diverter rule
still applies: everything below is a *finite list*, not a license to keep building.

## The bar — what "fully fledged" means

Sellable as such = two tests, both concrete:

1. **The pitch test:** a PM can ask any question in the meeting — "what do I have
   to do?", "what do my guests see?", "who's liable?", "what does it cost?",
   "how do I know it worked?" — and there's a crisp, true answer with an artifact
   behind it.
2. **The guest #1 test:** a real guest's stay runs end-to-end — intro email →
   link → requests → fulfillment → payment → folio — legally clean and without
   improvisation.

Anything that doesn't serve one of those two tests is the diverter.

## Facet by facet

### 1. Guest app — READY (stays frozen)
The three must-haves + /plan + request box + welcome threshold + ops console all
live. Before the first pitch, two cheap checks, no builds:
- Re-run `docs/summit-eval.md` — the baseline scorecard is 2026-06-19, ~25 PRs old
  (welcome threshold, fee structure, copy laundering, and the alcohol pull all
  landed after it).
- One end-to-end dry-run stay (ops "New stay" → welcome email → guest flow →
  request → quote → confirm → folio) as rehearsal.

### 2. The comms + consent spine — THE build gap (MVP-close per Parker, 2026-07-04)

The decided shape (2026-06-23, `docs/mvp-launch-line.md`) already answers the
open questions and matches Parker's instinct:

- **Does a guest get an email before any text? Yes — always.** Email needs no
  opt-in (CAN-SPAM is opt-out, and a message about the guest's own stay is
  relational). Email is the first touch, carries the app link, and carries the
  SMS opt-in CTA.
- **Auto-text at X months out? No.** Never a text without the guest's opt-in
  (TCPA — $500–1,500 per text of exposure), and even with opt-in the cadence is
  operator-triggered in v1 (the system surfaces "due," a human sends). SMS is
  the backup channel for guests the email didn't move, not the opener.
- **"Consent spot + email + text"** is exactly the decided architecture.

**To build (one sprint, plan-mode first):**
1. **Consent spine** — consent fields on `Guest` (`emailOptOutAt`, `smsConsentAt`
   + source + disclosure version, `smsOptOutAt`), a `canEmail()`/`canSms()`
   send-gate every sender consults, opt-in capture at phone collection
   (welcome / `/plan` contact / perk claim), tokened email unsubscribe + mailing
   address in the footer. This is the gate that can't be backfilled.
2. **Track A cadence** — signal-aware due/suppress + `NotificationProvider` seam
   + RESUME nudge. Plan locked: `docs/plans/2026-06-22-nudge-cadence.md` (kickoff
   prompt at the bottom). The send-gate plugs into this seam — build consent
   first or together to avoid rework.
3. **Email copy pass** — the emails already exist with real copy
   (`src/lib/guestEmail.ts`: welcome, plan-ahead, pre-arrival). What's missing:
   cold-guest framing in the welcome (a guest who's never heard of the PM's
   "concierge" needs one sentence of who/why), the opt-in CTA, the unsubscribe
   footer, and Parker's voice pass — same copy-deck workflow as the flyer.

**Config, not build:** add a DMARC record to summitluxurylogistics.com — checked
2026-07-04: SPF exists, **DMARC is missing** (`_dmarc` TXT empty). Start with
`v=DMARC1; p=none; rua=mailto:info@summitluxurylogistics.com` and verify DKIM
green in Resend. Five minutes in DNS, matters for Gmail/Yahoo placement.

**Kick off, don't build:** A2P 10DLC registration (the SMS pipe's long pole,
1–3 weeks carrier approval). Needs a registered business entity + EIN.
**OPEN:** which entity, and is it registered?

### 3. The acquisition model — the answer to "Sam Rubin calls every guest"

Sam's model converts by interruption: a phone call to every guest, as the PM's
partner. It works, but it's invasive, it doesn't scale past Sam's hours, and it
leaves no data trail. Aerie's model converts by invitation, and every step is
already measured in Postgres:

> link sent → opened (`AccessToken.lastAccessedAt`) → threshold crossed
> (`Stay.welcomeSeenAt`) → planned (`TripIntake`) → booked (`ServiceRequest`)

Two consequences:

- **After the pilot we can state real funnel numbers** ("X% of guests open, Y%
  make a request") — a sales asset the call-everyone model can't produce.
- **The centaur version of Sam's call:** don't call everyone — let the Broker's
  Book flag the high-value stay with zero engagement, and the operator makes
  *that* call (or nudge). Selective human touch where the signals warrant beats
  blanket calls on both invasiveness and hours. This is the pitch line: the
  email works the whole book quietly; the human works the whales.

**OPEN (post-pilot, don't guess now):** the funnel number that constitutes
"converts better than calling."

### 4. PM-facing sales kit — mostly ready

| Asset | Status |
|---|---|
| Flyer at aeriepc.com + /aerie | **LIVE** (domain confirmed serving 2026-07-04) + inline contact form → ops |
| /demo walkthrough, co-brandable (`partner:add`) | **LIVE** |
| Onboarding one-pager — "what happens when you sign" | **MISSING** — the PM will ask "what do I actually have to do?"; the true answer (send us your bookings — CSV or a cc at pilot scale; we mint links; your guests get the intro email in your brand; you get a recap) needs to be one rehearsed page |
| Proof asset — the Abode 2022 numbers shaped for the pitch | **MISSING** (analysis exists in the vault) |
| Pilot terms on paper — free, N homes, M months, who carries what | **MISSING · OPEN:** terms are Parker's call; one page, not a contract |
| Post-stay recap (the owner-retention ammunition) | Manual compile at pilot scale — POS principle, no build |

### 5. Fulfillment — the two heroes (non-app, Parker)
Transport driver + Grocery Girls + the in-home-entry process. **OPEN** — unchanged
from the launch-line blockers. The product isn't sellable "as such" until the
first real grocery order and first pickup actually land without improvisation.

### 6. Money movement (non-app, decision)
**OPEN:** how a real guest actually pays in the pilot — Stripe invoice/payment
link off the bundled folio, offline card, or manual. The app stays stubbed; the
folio email is the written record. Needs a decided script before guest #1's
first charge, and it must not gate the PM signature.

### 7. Legal / insurance (non-app, Parker)
In-home-entry coverage (the real one) · counsel pass on TCPA + Utah before the
first SMS send · entity registration (feeds 10DLC) · the pilot-terms page.

## The sequence

1. **Now (app, 1–2 sessions):** consent spine + Track A + email copy pass.
   Plan-mode first, feature branches, per the working agreements.
2. **Now (config, minutes):** DMARC record; verify DKIM in Resend.
3. **Now (Parker, parallel):** fulfillment locks · money-path decision ·
   insurance quote · entity/EIN answer → start the 10DLC clock.
4. **Then (sales kit, written not built):** onboarding one-pager · proof
   one-pager · pilot terms.
5. **Pre-pitch:** re-run the eval · end-to-end dry-run · `partner:add` the
   prospect's co-brand the morning of.

## Not on this list (the diverter check)

PM dashboard · real Stripe build · auto-send scheduler · events feed / IG ·
roster intake · ski school · native app · vendor automation. "Fully fledged"
means the finite list above. When something new feels necessary before selling,
it goes through the launch-line test first: does it serve the pitch test or the
guest #1 test?
