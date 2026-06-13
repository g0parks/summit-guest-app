# Request lifecycle — the demand-broker spine (as built, 2026-06-12)

Shipped in three PRs: **#14** (spine: signal → guided completion), **#15** (six ops
queues + quote approval), and **structured changes + channel-doctrine UI** (this
doc's PR). Written so a maintainer with zero session context can hold the whole
thing. The product doctrine behind it lives in `CLAUDE.md` (demand broker, menu
doctrine, channel doctrine) — this file is the mechanics.

## The state machine

```
SIGNALED ──(completeness rule passes)──► READY ──(ops quotes)──► QUOTED ──(guest approves)──► CONFIRMED
   │                                       │                                                    │
   │                                       └──(fixed-price: skips READY/QUOTED entirely —       ▼
   │                                           wizard completion auto-CONFIRMs)             SCHEDULED ──► COMPLETED ──► (charge)
   └──► abandoned; stay departs ──► EXPIRED        any open state ──► DECLINED / CANCELLED (ops)
```

- **Guest moves:** signal (`createSignal`), complete (`saveRequestDetails`),
  approve (`approveQuote`) — all in `src/app/actions/requests.ts`.
- **Ops moves:** quote/re-quote (`quoteRequest` — READY *or* QUOTED, guarded so a
  re-quote can't race the approval tap), schedule/complete/decline/cancel
  (`setRequestStatus`, allowlist `TRANSITIONS`) — `src/app/actions/ops.ts`.
- **Sweep:** `sweepExpiredSignals` (`src/lib/opsQueries.ts`) runs lazily on every
  `/ops` load — open SIGNALED/READY/QUOTED on phase-derived POST_STAY stays flip
  to EXPIRED. Rows are never deleted: unconverted demand is the broker's book.
- **EXPIRED is sweep-only; nothing resurrects.** Guest-facing copy never shows
  enum names (labels: "A few details and it's done" / "Being arranged" /
  "Approve — $X" / "Confirmed").

## The two pricing paths (the guardrail — do not conflate)

`Service.priceUnit` decides, via `isFixedPrice()` (`src/lib/catalog.ts`):

1. **Fixed price** (`FLAT`/`PER_PERSON`/`PER_DAY`/`PER_HOUR` with an amount):
   wizard completion auto-CONFIRMs — tab line + itinerary item immediately, no
   quote, no approval, no operator in the loop. The "request & it's done" magic
   is a feature. `quoteRequest` refuses these outright.
2. **Quote-priced** (`priceUnit: QUOTE` only — grocery, chef, heli): completion
   parks at READY → ops sets `quotedAmount` + QUOTED (**no tab line**) → the
   guest's `approveQuote` tap creates the tab line + itinerary item and is the
   future Stripe off-session card-consent seam. Nothing touches the tab the
   guest hasn't said yes to.

Vendor cost typed at quote time has no tab line to land on yet, so it rides
`ServiceRequest.operatorNote` as a parseable line (`src/lib/vendorNote.ts`) and
becomes line economics (`vendorCostCents`/`netCents`) at approval. If quoting
grows more state, give it a real column.

## The guided wizard

- `/services/[slug]` → one CTA ("Arrange this") → `createSignal` → SIGNALED row
  (deduped per service+stay) → `/requests/[requestId]` wizard.
- Execution schemas are slug-keyed config in `src/lib/serviceForm.ts` (steps,
  per-person repeaters, completeness rule `isFlowComplete`, queue-badge summary
  `missingSummary`). Answers land in `ServiceRequest.detailsJson` as
  `[{name, label, value}]`.
- Every screen offers "Finish later — we'll hold it"; the app home screen
  (pre-arrival) renders the open-request checklist as the resumption surface.
- QUOTED renders the approval screen (`ApproveQuote`); later states render calm
  status screens — the guest never edits a priced order.

## The six ops queues (`/ops`, one action each)

| Queue | Filter | Action |
|---|---|---|
| New signals | SIGNALED < 24h | watch (badge shows missing info) |
| Awaiting guest | SIGNALED ≥ 24h **+ every QUOTED** | **Nudge** — operator-tapped `sms:` draft |
| Ready to route | READY | route; QUOTE dishes get the inline quote form |
| Scheduled | CONFIRMED/SCHEDULED, next 48h | deliver |
| Changes | OPEN ChangeRequests | apply (ItineraryItemForm) or decline |
| To settle | COMPLETED w/ PENDING lines + departed stays w/ pending | charge |

Nudge drafts (`NudgeButton` + `src/lib/smsLink.ts`) are sent from the
**operator's own phone** — there is deliberately no outbound SMS infra. The
draft carries `/t/<token>?next=/requests/<id>`; the token route validates
`next` as relative-only and lands the guest on the wizard post-resolution.

## Structured changes (channel doctrine: taps, never composed messages)

- Guest door: `/itinerary/[itemId]/change` (links on every upcoming itinerary
  item + the home "Next up" card). Options gate on the linked service's
  cutoffs via `changeWindows()` (`src/lib/changePolicy.ts`): Move (date/time,
  wall-clock strings in property tz) / Cancel / Something else (note).
  **Null cutoff or past cutoff = ONLY the quiet texting escape hatch** —
  doctrine, not a fallback. Unlinked items (manual itinerary entries) have no
  service ⇒ always concierge-only.
- `createChangeRequest` (`src/app/actions/changes.ts`): re-checks the gate
  server-side, dedupes against open changes, sets
  `itineraryItem.changePending` (the guest's "Being rearranged" chip), notifies
  the operator (`change_requested`).
- Ops resolution (`src/app/actions/ops.ts`): `applyChangeEdit` (MOVE/MODIFY —
  ItineraryItemForm prefilled with the ask; one submit updates the item, clears
  the chip, stamps APPLIED + resolvedAt), `applyChangeCancel` (standing cancel
  semantics: request → CANCELLED where allowed + note stamped, PENDING lines
  voided, item deleted), `declineChangeRequest` (item stands, chip clears).
- **FK caveat:** `ChangeRequest.itineraryItemId` is a required relation with no
  cascade — anything that deletes an itinerary item must delete its change rows
  first (`setRequestStatus`, `deleteItineraryItem`, `applyChangeCancel`, demo GC
  all do). Cancel therefore loses its change rows; the CANCELLED request is the
  record. If change history matters enough later, make the column nullable.

## Seasons

`staySeason()` / `seasonForDate()` (`src/lib/stayPhase.ts`): Nov–Apr = WINTER,
else SUMMER, property-tz. Stay dates pick the catalog menu
(`getActiveServices`) and the `/plan` question set (`intakeQuestionsFor()` —
World A from stay dates, World B from today). Off-season dishes are hidden, not
greyed. Summer `/plan` copy is **placeholder pending Parker's copy pass**.

## Post-plan close (channel doctrine)

`IntakeFlow` close = confirmation + "by end of day" delivery expectation; the
concierge contact is ONE quiet "Need us sooner?" line, never the primary CTA.
Service detail pages have no "prefer to ask first?" detour — the wizard is the
ask.

## Gotchas (each of these has bitten before)

- Server actions whose own page's render branch flips on their result must
  **NOT** `revalidatePath` — the close screen unmounts mid-render. All guest
  surfaces are `force-dynamic`; navigation renders fresh. (See comments in
  `requests.ts`, `changes.ts`, `intake.ts`, `opsStays.ts`.)
- Money-creating transitions use guarded `updateMany` (status in the WHERE) so
  double taps / races can't stack tab lines or drag a CONFIRMED request back.
- Demo/sandbox guests are seeded with Parker's dev phone (+1 910 420 0302, his
  request) so Nudge demos live; `src/lib/demoStay.ts`.
- Puppeteer walks: CSS-uppercased labels appear UPPERCASE in `innerText`;
  placeholders never appear in `innerText`; rendered copy uses typographic
  apostrophes (’). Harnesses: `.scratch/verify-spine.mjs` (PR A),
  `verify-queues.mjs` (PR B), `verify-changes.mjs` (PR C) + `*-db.ts` sidecars;
  each needs `npm run dev`, a fresh `npm run db:seed` link, and `OPS_KEY`.

## Deferred (decided, not built)

Stay-level parameters re-pricing the menu (has-rental-car) · planning-horizon
attribute (in-stay spontaneous dishes) · perks-as-drinks · outbound SMS infra
(scoped cadence plan first) · charge/service-fee consent moment (Stripe) ·
chef-designed execution-schema graduation per the menu doctrine.
