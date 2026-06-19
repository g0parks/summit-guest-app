# Plan: Flow audit → remediation (post-PR #26)

**Date:** 2026-06-17
**Source:** Frontend flow/feel audit of the guest journey after PR #26 (alcohol bar-stocking),
plus a 10-guest persona pressure test. Findings doc lives in the conversation that produced
this plan; the load-bearing conclusions are restated in §1.
**Status:** Decisions locked by Parker (§2). Not started. Plan-before-build — dev waits on §6
open questions where noted.

---

## 0. How to use this doc

This is written for two agent roles. Tasks are tagged:

- **[ADVISOR]** — research / offering design / fee modeling / copy / a decision that
  shapes the build. No code. Produces a short spec the dev agent consumes.
- **[DEV]** — concrete build: schema, files, acceptance criteria. Follows
  `docs/adding-a-service.md` for any new service. Never commits to `main`; feature branch + PR;
  lint + typecheck before commit.

Workstreams (§4) are mostly independent; §5 gives the sequence and the one hard dependency
(dev/prod DB fork before schema migrations).

---

## 1. Context (what the audit found)

The core thesis held — discovery register, dual-mode lanes, fixed-price auto-confirm, and
cross-attach-at-peak-intent all validated with the personas. The gaps are **coverage**, the
**provisioning pricing/consent model**, and **friction** — not the foundation.

Three things drove this plan:

1. **The "I thought you had it covered" hole is the long tail of demand the 14-service catalog
   can't hold** — and there is no in-app way to ask for anything off-catalog. The only escape is
   the concierge text line, which is config-gated and may be absent in prod. The fix is a
   first-class **request box** that captures (and prices, at a concierge premium) anything not on
   the menu.
2. **The bar's "approve a fee *shape*, no number, no second tap" was the meatiest moment** and
   was inconsistent with grocery's QUOTE-and-approve. Parker's resolution (§2) unifies both onto a
   **disclosed cost-plus fee structure** (Comestibles-style), drops the minimum-order floor, and
   holds the line that the exact total stays dynamic/human-handled.
3. **The per-person ski/bike repeater is the worst single friction moment** (it asks for full
   fittings for the *entire* stay party, including non-skiers) — redesign around the Ski Butlers
   roster model.

---

## 2. Decisions LOCKED by Parker (do not relitigate)

- **In-town / ground transport beyond the airport: DEFERRED.** Keep airport transfer as the only
  transport line for now. (Optional refinement: make the airport flow graceful for the long-lead
  pre-arrival case where the guest doesn't have a flight number yet — see WS6.)
- **Ski school: BUILD.** Massive miss; net-new service this batch.
- **Restaurant reservations: DEFERRED (needs vendor relationships).** Establishing "first-round"
  Park City restaurant network relationships is a biz-dev prerequisite. Interim posture: defer to
  Resy/OpenTable (the historical default) and/or let it ride the request box. Not a near-term build.
- **Hair / occasion (flowers, cake, décor): NOT a catalog service.** Special-request only, through
  the **request box**. Do not build dedicated catalog lines.
- **Request box ("Something else? We'll arrange it"): BUILD.** Obviously needed. Premium concierge
  framing — the fee compensates for the scarce human attention.
- **Grocery AND bar: drop the QUOTE path.** Neither can be quoted before the cost is known. Both
  move to a **cost-plus-percent fee structure**, disclosed up front, total dynamic and lands on the
  tab. No guest "approve $X" step.
- **Bar fee structure: re-lay-out as cost-plus-percent, modeled on Comestibles.** Remove the
  $250 minimum-order floor (it's wrong). Disclose the concrete schedule, not a vague "shape."
- **Exact fee amounts stay human-handled.** The total is dynamic and can't be quoted on the spot.
  Price-conscious guests who balk at the dynamic total are explicitly **not the target customer** —
  this is an accepted trade, not a bug. (Disclosing the *structure* clearly is the mitigation; an
  exact pre-total is not required.)
- **Bar discovery: too zealous — replace with a discrete menu + fill-in.** Offer popular basics +
  local taste as a small, scannable menu with a freeform box (the Prept/Comestibles shape), not the
  5-screen evocative "moments" flow.
- **Alcohol in /plan: conditional.** If the guest accepts the kitchen/grocery question, the grocery
  flow's bar cross-attach captures the demand — fine. If they **decline** grocery, surface a bar
  question in /plan so alcohol demand isn't lost.
- **Per-person ski/bike intake: redesign.** Build a smart flow off the Ski Butlers model.
- **"Quietly close it out at departure": drop "quietly."** (Trust copy.)
- **/plan funnel unreachable from inside the app: fix it.** Misstep.
- **Grocery chef cross-sell gated behind optional "cooking in?": fix the gate.**
- **Dev/prod DB fork: Parker will set up shortly.** No sense paying the complexity tax (e.g. the
  "QUOTE + null + discriminator" hack) while pre-production. This is the enabler for clean schema
  migrations below.

---

## 3. Explicitly OUT OF SCOPE / deferred (so no one builds these)

- Ground/in-town transport service (airport only stays).
- Restaurant-reservation build (vendor relationships first; Resy/OpenTable interim).
- Hair / occasion / flowers / cake as catalog services (request box only).
- Stripe-gated pieces of the fee structure: the **refundable authorization deposit** ($20-style
  hold) and the **CC processing fee** (8%-style) and any card-on-file *consent* moment. Disclose the
  fee structure now; the deposit/auth/CC-fee ride the deferred real-payments build. (See
  `docs/adding-a-service.md` "Coming — refund model".)
- Lift tickets — **see §6 open question** (flagged in the audit as your stated CAC line; not
  resolved in this batch; ski school may depend on the answer).

---

## 4. Workstreams

### WS1 — Request box: "Something else? We'll arrange it" (HIGH leverage)

**Problem.** Everything off the 14-service catalog dies. No in-app freeform demand capture; the
Broker's Book is blind to unknown demand; the long-tail coverage gaps (hair, occasion,
restaurant overflow, anything) have no home. The only escape is the config-gated concierge text line.

**Decision.** Build a first-class in-app capture. Premium concierge framing (the fee pays for the
human attention). This is the single primitive that fills the long tail without violating the menu
doctrine (it's the waiter saying "we can do that," not a configurator).

- **[ADVISOR]** Define the surface and register: where it lives (catalog footer "Don't see it? Ask us"
  + a home-screen entry), the copy (presupposing, premium, "our concierge handles it"), and how/whether
  to signal that a concierge fee applies (disclose a fee posture without quoting). Decide the boundary
  vs the concierge text line (this is the *structured* capture; text stays the escape hatch).
- **[DEV]** Model: reuse `ServiceRequest.customTitle` (already exists) + `notes` + `detailsJson`;
  `serviceId = null`, `source = "request-box"`. Lifecycle: completes to READY (operator triages →
  quote or fulfill). Surfaces on the home "Before you arrive" / open-requests checklist like any
  request (the checklist already renders `customTitle`). Add a guest entry point + a minimal
  one-screen wizard (free text + optional date). Ops queue already shows non-service requests —
  verify it renders `request-box` source cleanly.
- **Acceptance:** a guest can describe an arbitrary need in-app; it appears in ops with the typed
  text and on the guest's checklist; no catalog service required.

### WS2 — Provisioning pricing → disclosed fee structure (grocery + bar)

**Problem.** Grocery is QUOTE (guest approves a total); bar is a "fee shape" with no number, no
second tap, and a $250 same-day floor — same Provisioning category, opposite consent models, and the
bar reads as extractive. Neither grocery nor bar can actually be quoted before the cost is known.

**Decision.** Both become one **FEE_STRUCTURE** path: disclosed cost-plus schedule, dynamic total,
lands on the tab, no guest "approve $X" step, no minimum-order floor. Model the schedule on
Comestibles:

> Your [groceries/bottles] at cost, plus a **delivery fee** (flat) and a **service fee** (% of cost).
> **Same-day or after 8pm the night before delivery** adds a **rush** (flat). [Deferred/Stripe: a
> refundable hold at checkout; a card processing fee.] It all rides your tab.

- **[ADVISOR]** Set the actual numbers (delivery fee, service-fee %, rush fee) and write the
  disclosure copy for both grocery and bar — concrete schedule, warm, premium. Confirm the rush
  trigger wording ("same-day, or after 8pm the night before delivery"). Confirm the DABS Sunday gate
  stays **alcohol-only** (grocery stores are open Sundays). Provide the "same-day's wrapped — first
  thing tomorrow" graceful line (now surfaced earlier — see WS3/WS6).
- **[DEV]** Schema (post dev/prod fork): add `PriceUnit.FEE_STRUCTURE` (retire the
  `QUOTE + null amount + isFeeStructureService` hack). Add tunable fee columns to `Service`:
  `deliveryFeeCents Int?`, `serviceFeeBps Int?`, `rushFeeCents Int?` (and keep cadence/cutoff/closed-day
  logic in code config). Generalize `src/lib/barPricing.ts` → `provisioningPricing.ts`:
  `computeFeeStructureChargeCents(costCents, { deliveryFeeCents, serviceFeeBps, rushFeeCents, rush })`;
  drop `floorCents`. Lifecycle: completing the wizard = consent to the disclosed structure → status
  CONFIRMED (close screen "You're all set", not "Consider it underway"); the operator writes the real
  tab line (cost + fees) on fulfillment via a fee-structure price form (generalize `BarPriceForm`).
  Move grocery (`grocery-pre-stock`) and bar (`bar-stocking`) to `FEE_STRUCTURE`; remove grocery's
  QUOTE/QUOTED/approve path. Update `docs/adding-a-service.md` (the "third pricing path" section).
- **Acceptance:** grocery and bar both disclose a concrete fee schedule on the confirm screen; neither
  forces a guest to wait for and approve a total; no $250 floor anywhere; ops sets the dynamic cost and
  the tab line reflects cost + disclosed fees.

### WS3 — Bar discovery: discrete menu + fill-in (de-zealot)

**Problem.** The 5-screen evocative "moments" flow is over-engineered, mismatched for the
"just grab tequila and beer" guest, and (with WS2) the only thing the bar wizard still needs is to
capture *what they want*.

**Decision.** Replace the moments with a **small, scannable menu of popular basics + local Utah taste
+ a freeform box** (Prept shape). Keep the dual-mode "just tell us" lane. Keep at most one optional
"arrival bottle" prompt (phase-seeded). Surface the timing reality (same-day vs first-thing-tomorrow)
*before* the confirm screen, not as a last-screen surprise.

- **[ADVISOR]** Design the menu: the category checklist (e.g. wine red/white/bubbles, tequila,
  whiskey, vodka, beer, mixers, N/A, a featured "local Utah" pick like High West) + freeform. Write
  copy. Keep the genuinely-loved touches: the **N/A "ones not drinking" option** (personas singled it
  out) and the arrival-bottle line. Decide how/where timing is shown earlier.
- **[DEV]** Rework the `bar-stocking` `FLOWS` entry in `src/lib/serviceForm.ts`: 1–2 screens
  (menu checklist + freeform; optional arrival item), drop the per-moment showIf scaffolding.
  Surface the cadence line (same-day / first-thing) on a screen before confirm.
- **Acceptance:** a guest can stock the bar in ≤2 screens; "just tell us" still works; N/A + arrival
  retained; the Sunday/after-cutoff reality is visible before the final tap.

### WS4 — Ski school (net-new service)

**Problem.** No kids' ski school / lessons. Core for the Deer Valley family beachhead; the seeded
World-B lead literally asks for it.

**Decision.** Build it. **Offering shape is an open question (§6)** — depends on whether Summit books
the resort ski school (which needs lift access) or supplies private instructors.

- **[ADVISOR]** Define exactly what Summit fulfills: resort ski-school booking vs private instructor;
  age bands; group vs private; half/full day; how it relates to lift tickets (see §6). Set pricing
  unit (likely QUOTE or PER_DAY) and the /plan question copy.
- **[DEV]** Add the catalog row (`prisma/seed.ts`), an execution flow in `serviceForm.ts`
  (per-child: age, ability, half/full day — reuse the WS5 smart-roster pattern, do **not** ship the
  old heavy repeater), a winter `/plan` question (`intakeFlow.ts`), and itinerary category mapping.
  Follow `docs/adding-a-service.md`.
- **Acceptance:** ski school appears in the winter catalog and /plan; a parent can enroll kids without
  the full-fitting friction.

### WS5 — Smart ski/bike intake (Ski Butlers-informed)

**Problem.** The per-person repeater uses the whole stay party size, asking full fittings
(height/weight/shoe/ability/setup) for non-skiers, toddlers, grandparents. 30–50 required fields on a
phone → abandonment. Four personas called it the worst moment in the app.

**Decision.** Redesign off the Ski Butlers model (ref: skibutlers.com/faqs): a **roster you build
once** (decoupled from party size), **minimal high-signal fields**, and explicit reassurance that
Summit fine-tunes at delivery (they bring two boot sizes; DIN set from height/weight/ability) — the
guest never has to be perfect. Human fulfillment confirms the rest, which fits Summit's model.

- **[ADVISOR]** Design the flow: (1) "Who's skiing/riding?" roster builder (add only the people who
  ski, not the whole party); (2) minimal fields per person + reassurance copy ("we bring two boot
  sizes and fine-tune at delivery"); (3) optional "send each skier their own quick form" (the
  party-member self-fill link — roadmap item; scope as phase 2 if it balloons). Write copy.
- **[DEV]** Decouple the perPerson repeater count from `stay.partySize` (introduce a roster /
  rider-count the guest sets). Trim required fields. Add reassurance UI. Phase 2: a per-rider
  self-fill token link (new lightweight signed link → a single-rider form writing into the same
  `detailsJson`). Touches `serviceForm.ts` (perPerson), `RequestWizard.tsx`, and the request schema
  for roster size. Applies to `ski-rental`, `bike-rental`, and WS4 ski school.
- **Acceptance:** a 9-person party with 4 skiers fills 4 rosters, not 9; required-field count is
  visibly lower; copy reassures exactness isn't required.

### WS6 — /plan funnel fixes

**Problem (bundle).** Several pre-arrival flow defects.

- **Reachability.** The guided `/plan` funnel is only reachable from the email link or an operator
  nudge deep-link (`?next=/plan`); no in-app surface links to it. **[DEV]** Point the pre-arrival home
  "Plan ahead" CTA at `/plan` (keep a secondary "Browse services" → `/services`). **[ADVISOR]** confirm
  the entry copy. (See §6 if you'd rather a distinct entry than repurposing the CTA.)
- **Conditional bar question.** **[DEV]** Add conditional-question support to `intakeFlow.ts` /
  `IntakeFlow.tsx` (it has none today) so a bar/alcohol question shows only when the kitchen/grocery
  question was **declined**. **[ADVISOR]** copy.
- **Chef cross-sell gate.** The grocery "cooking in?" step is optional with no default, so the chef
  attach (gated on `cookIn = "Cooking in"`) is suppressed for guests who skip it. **[DEV]** give
  `cookIn` a default or make it required (or broaden the chef-attach gate). Verify the bar attach
  still always shows.
- **Itinerary over-promise.** /plan close says "on your itinerary by end of day," but the itinerary
  shows CONFIRMED items only and has no empty state; SIGNALED intents live on the home checklist, not
  the itinerary. **[ADVISOR/DEV]** decide: either (a) reflect SIGNALED intentions on the itinerary as
  a quiet "planned/pending" section + add empty-state copy, or (b) soften the close copy to match
  reality and add itinerary empty-state copy. (See §6.)
- **Quiet cross-attach acknowledgment.** Opting into bar/chef spawns a new visible "homework"
  checklist item that surprised personas. **[ADVISOR/DEV]** make the acknowledgment quiet, or label
  spawned siblings clearly as "we've started this for you."
- **Summer /plan copy pass.** Still placeholder. **[ADVISOR/Parker]** finalize.

### WS7 — Trust & copy polish

- **[DEV]** Drop "quietly" from the tab reassurance copy (`src/app/(trip)/tab/page.tsx`).
- **[ADVISOR/DEV]** Add a one-line "how the tab works / who Summit is" at first landing (the
  skeptical-first-timer's cheapest trust win): plain "your PM partnered with Summit; you request, we
  arrange, one bill — no card needed until you confirm." Keep it co-brand-quiet.
- **[Parker/ops]** Confirm `CONCIERGE_PHONE` / `CONCIERGE_EMAIL` are set in Vercel — if unset, the
  concierge card *and* the only human escape hatch vanish on several screens (live risk per the
  `concierge-line` memory). The request box (WS1) reduces but doesn't remove this dependency.

### WS8 — Cleanup & enablers

- **[Parker]** Fork dev/prod DB (point local `.env` at a dev DB; prod connection string only in
  Vercel; prod gets `migrate deploy`, never `seed`). **Enabler for WS2/WS4/WS5 migrations** — do this
  first. (See the `shared-db-risk` memory + CLAUDE.md pre-launch gate.)
- **[DEV]** Delete the vestigial `getStayIntakeSignals` in `src/lib/queries.ts` (defined, referenced
  nowhere in live `src/`; ops reads `interestedSlugs`/`labelsForSlugs` directly). Confirm unused, then
  remove.

---

## 5. Suggested sequence & dependencies

1. **WS8 dev/prod fork FIRST** — unblocks clean schema work; removes the reason for the
   QUOTE-hack contortions.
2. **Parallelizable, no schema:** WS1 (request box — uses existing `customTitle`), WS6 (/plan fixes),
   WS7 (copy). WS1 is the highest leverage — start it immediately alongside the fork.
3. **After the fork:** WS2 (FEE_STRUCTURE schema + grocery/bar unification), then WS3 (bar menu
   redesign sits on top of WS2).
4. **WS5 smart intake** (decouple roster from party size) — then **WS4 ski school** reuses it.
   Don't ship ski school on the old heavy repeater.
5. WS4 ski school needs the §6 offering decision before dev starts.

---

## 6. Open questions for Parker (morning review)

1. **Lift tickets.** The audit flagged these as your *stated* CAC acquisition line, but they're not
   built and your reply didn't address them. **Ski school likely depends on this** (resort ski school
   bundles lift access). Build lift tickets this batch, defer, or fold into ski school's definition?
2. **Ski school offering shape.** Resort ski-school booking (needs lift access) vs Summit-supplied
   private instructors? Age bands, group vs private, half/full day? This blocks WS4 dev.
3. **Grocery off QUOTE — confirm.** Moving grocery fully to FEE_STRUCTURE removes the guest's
   approve-a-total step (some guests liked it). You said yes; flagging because it's a notable reversal
   of the current grocery behavior.
4. **Itinerary intent visibility.** Show SIGNALED intentions on the itinerary as "planned/pending,"
   or just soften the /plan close copy + add an empty state? (WS6)
5. **/plan reachability.** Repurpose the pre-arrival "Plan ahead" CTA → `/plan`, or add a separate
   entry so the catalog stays one tap away too?

---

## 7. Doctrine updates to fold into CLAUDE.md once approved

Several locked decisions revise standing doctrine and should be reflected in CLAUDE.md (roadmap /
menu-doctrine / pricing sections) after Parker signs off:

- Provisioning (grocery + bar) is **fee-structure cost-plus, disclosed, no quote, no minimum** —
  supersedes "grocery QUOTE" and the bar "fee shape / $250 floor."
- The **request box** is the sanctioned in-app long-tail capture (hair/occasion/etc. route here, not
  the catalog).
- **In-town transport deferred; ski school added; restaurant reservations gated on vendor
  relationships (Resy/OpenTable interim).**
- Alcohol earns a **conditional /plan question** (shown when grocery is declined).
