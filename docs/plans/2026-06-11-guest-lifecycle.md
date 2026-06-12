# Plan: Guest lifecycle pipeline — intake → stay → post-stay

> Hand-off plan for the dev agent. Written 2026-06-11. One branch:
> `feat/guest-lifecycle`, commits per piece, PR to main. Read `CLAUDE.md` first;
> constraints apply. Picks up exactly what the trip-intake plan
> (`2026-06-10-trip-intake.md`) deferred: intake→Stay conversion UI and World-A
> stay/token creation.

## Context — why this exists

The pieces don't connect into a lifecycle yet:
- A `/plan` lead lands on `/ops` as a table row with **no path to becoming a stay**.
- Stays can only be created by the seed script — there is **no ops entry point** for
  the primary case where the PM hands us guest data.
- The trip experience is **phase-blind**: "Welcome back" before arrival, no ending
  after departure. The only post-departure gate is a 2-day session cookie
  (`src/app/t/[token]/route.ts:55`); `AccessToken.expiresAt` exists but is never set.
- Ops hides departed stays entirely (`getOpsStays` filters `departureDate >= now`),
  so unsettled tabs on departed stays are invisible.

**Decided architecture (Parker, 2026-06-11) — build to this, don't re-litigate:**

- **Two front doors, one convergence point. Codified hierarchy:**
  - **Path A — PRIMARY (prefilled / PMS-piped):** PM gives guest+stay data →
    operator creates the stay directly in ops (the future PMS feed calls the same
    code) → guest gets a tokened link with everything known. If they later open
    `/plan` with their session, the intake auto-links (already works —
    `submitTripIntake` sets `stayId`/`guestId` server-side, contact screen
    suppressed). This is the route real volume flows through.
  - **Path B — SECONDARY (no prefill / cold lead):** anonymous `/plan` →
    `TripIntake` → operator converts it into a stay. Capture mechanism for non-PMS
    leads only — not the mainline.
  - Both run through **one stay-creation core** and converge on the same
    Stay + token → identical lifecycle after. UI emphasis follows the hierarchy:
    "New stay" is the prominent creation action on `/ops`; convert-from-intake is
    the secondary path off the intakes table.
- **Post-stay window: 30 days** (`POST_STAY_ACCESS_DAYS`) for both session cookie
  and minted-token expiry. After that the link is a real ending (`/invalid`).
- **Post-stay asks: block warmly.** Catalog becomes a brochure; the concierge line
  never closes. No new requests/claims can land on a departed stay.
- **Welcome email is integrated into stay creation** — visible on-by-default toggle
  on the form, env-gated by `GUEST_EMAIL_FROM` (unset → toggle absent, `sms:` +
  copy fallbacks remain; nothing may look broken). This email is touchpoint #1 of
  the future pre-arrival cadence — build it as a reusable guest-email module, NOT
  inside the action.

---

## Schema (one additive migration: `add_trip_intake_converted_at`)

```prisma
model TripIntake {
  // ... existing fields ...
  convertedAt DateTime? // operator converted this lead into a Stay
}
```

- `convertedAt` is distinct from World-A `stayId`-at-creation, and doubles as the
  conversion idempotency claim.
- **No other model changes.** `Stay.status` stays untouched (write-only legacy
  display — update its schema comment to say phase is derived; see
  `src/lib/stayPhase.ts`). `AccessToken.expiresAt` already exists — we just start
  setting it.
- `prisma/seed.ts`: add `prisma.tripIntake.deleteMany()` to `reset()` (currently
  missed — intakes accumulate across reseeds with nulled FKs), and seed ONE sample
  World-B intake (name/email/timing/2 interests/note) so conversion is testable
  immediately after `npm run db:seed`.

## New shared modules

### `src/lib/stayPhase.ts` (pure; no `server-only` — mirrors `tokens.ts`)

```ts
export type StayPhase = "PRE_ARRIVAL" | "IN_STAY" | "POST_STAY";
export const POST_STAY_ACCESS_DAYS = 30; // single source of truth

export function getStayPhase(stay, timezone, now = new Date()): StayPhase
export function daysUntilArrival(stay, timezone, now = new Date()): number
```

- Compare `dayKey(now, tz)` (exists in `src/lib/dates.ts`) lexicographically
  against `dayKey(arrivalDate, tz)` / `dayKey(departureDate, tz)`. Before arrival
  day → `PRE_ARRIVAL`; after departure day → `POST_STAY`; else `IN_STAY` (arrival
  and departure days both count as in-stay — day granularity, property-tz-correct).

### `src/lib/guestEmail.ts` (server-only; guest-facing — deliberately separate from operator `notify.ts`)

- `getGuestEmailConfig()`: enabled only when `GUEST_EMAIL_FROM` is set.
  Set + `RESEND_API_KEY` unset → console fallback prints the full email
  (zero-config dev mode, the `notify.ts` precedent). Both set → real Resend send.
- `sendWelcomeEmail({ guest, stay, property, link })` — brand-aware via
  `resolveBrand()` ("[Partner] Concierge, powered by Summit" when partnered):
  your trip is set · property + dates · **the tokened link as the button** ·
  one plan-ahead line · concierge contact when configured. Luxury register,
  no prices, no "exclusive"/"FREE".
- `// SEAM: pre-arrival cadence (next phase) sends through this module.`
- Add `GUEST_EMAIL_FROM` to `.env.example` (commented, fallback behavior noted)
  and the CLAUDE.md env list.

---

## Piece 0 — Stay-creation core + two ops entries

### Core helper `createStayWithToken(tx, input)` (in `src/lib/opsStay.ts` or co-located in `src/app/actions/ops.ts`)

Used by BOTH actions inside an interactive `prisma.$transaction`:

- **Guest matching:** explicit `guestId` (World-A intake) → reuse. Else
  case-insensitive email match → reuse, **fill blanks only, never overwrite**
  (the `claimPerk` precedent). Else create.
- **Stay:** `isDemo: false`, status left at default, `currency: "usd"`.
- **Dates → instants:** `zonedDateTime(arrivalStr, property.checkInTime ?? "16:00",
  property.timezone)` / departure with `checkOutTime ?? "10:00"` — property-tz
  correct (the established rule; never naive `new Date()` parsing).
- **Token:** `generateTokenId()` (`src/lib/tokens.ts`), `expiresAt:
  addDays(departure, POST_STAY_ACCESS_DAYS)`, label `"manual · ops"` or
  `"converted from intake"`. First mint site that sets expiry; demo/legacy
  null-expiry tokens untouched.
- **No PaymentMethod row** — card-on-file is the future consent moment
  (CLAUDE.md); the mock card stays a demo-seed artifact. Charging is impossible
  until a card exists — correct.
- **After commit** (not inside the tx): if toggle on + email present + config
  enabled → `sendWelcomeEmail()`. Send failure ≠ creation failure — the panel
  reports send status honestly.

### Entry A — `/ops/stays/new` (PRIMARY)

`src/app/ops/stays/new/page.tsx`: blank `StayForm` — property select,
arrival/departure dates (`<input type="date">`), party size, guest
first/last/email/phone, welcome-email toggle. Prominent **"New stay"** button on
`/ops` (this is where PMS-sourced guest data gets keyed today; the future feed
calls the same core). Property options via new `getConvertProperties()`
(`src/lib/opsQueries.ts`): `property.findMany({ where: { stays: { none:
{ isDemo: true } } }, orderBy: { name: "asc" } })` — filters `/demo` sandbox
property clones, keeps canonical/real properties.

### Entry B — `/ops/intakes/[intakeId]` (SECONDARY)

`src/app/ops/intakes/[intakeId]/page.tsx`, linked from the intakes table:

- **Unconverted:** full intake readout (interest/declined chips via existing
  `interestedLabels`, note verbatim, timing, contact, source/UTM) + the **same
  `StayForm`** prefilled (name split on first space; email/phone verbatim; all
  operator-editable). On success additionally stamps `convertedAt` and links
  `TripIntake.stayId`/`guestId`.
- **Converted:** no form. Panel with the guest link + "open stay".
- **Idempotency:** the transaction opens with
  `tx.tripIntake.updateMany({ where: { id, convertedAt: null, stayId: null },
  data: { convertedAt: now } })`; count 0 → return the existing stay (double-click
  and second-operator safe; rollback un-claims on later failure). World-A intakes
  (`stayId` already set) are **not convertible**.
- New query `getIntakeDetail(intakeId)` in `src/lib/opsQueries.ts` (intake + stay +
  guest + the stay's access tokens).

### Created/converted panel (both entries)

- The guest link is **re-derived on every render** via `buildToken(tokenId)` +
  `APP_BASE_URL` — nothing secret stored, link recoverable forever.
- Welcome-email status line (sent to x@y · console fallback · not configured).
- Prefilled `sms:` deep link when the guest has a phone — reuse the
  platform-aware pattern from `src/lib/concierge.ts` / `ConciergeLinks` (iOS
  `&body=`, Android `?body=`; message = warm one-liner + the link).
- Copy button as last resort (clipboard + brief "Copied" state, the existing
  pattern).

### Intakes table (`src/app/ops/page.tsx`)

Trailing column, three states: `CONVERTED` badge + "open" → intake detail ·
"linked — open stay" (World A, `stayId` set, not converted) · "convert →" link.

### Components

`src/components/ops/StayForm.tsx` — ONE client component for both entries
(`useActionState`, named-error pattern, `ops.module.css` classes, dense
utilitarian ops styling).

---

## Piece 1 — Intake-aware stay

- `src/lib/intakeFlow.ts`: add `interestedSlugs(answers)` beside `interestedLabels`.
- `src/lib/queries.ts`: `getStayIntakeSignals(stayId)` → latest linked intake →
  `{ interestedSlugs, note } | null`. **Null → every surface renders exactly as
  today** (pure degradation, byte-identical).
- **Services catalog** (`src/app/(trip)/services/page.tsx`): when interested slugs
  match active services, a new FIRST section — eyebrow `From planning your trip`,
  one quiet line ("You mentioned these — say the word and they're arranged."),
  same card markup as everywhere. Those services ALSO remain in their normal
  category sections. No badges, no reordering pressure — suggestion, not upsell.
- **Trip home:** PRE_ARRIVAL only — the "Before you arrive" card lists up to 3
  interest labels as quiet text linking to `/services`. IN_STAY home unchanged
  (restraint — the catalog section carries it).
- **Ops stay detail** (`src/app/ops/stays/[stayId]/page.tsx`): add `tripIntakes`
  (desc order) to `getOpsStayDetail` include; new "Trip intake" section rendered
  only when present — interest chips, declined muted, capstone note verbatim,
  timing, taken/converted timestamps.

---

## Piece 2 — Stay phases + post-stay

### Window

`src/app/t/[token]/route.ts`: cookie window `addDays(departure, 2)` →
`addDays(departure, POST_STAY_ACCESS_DAYS)`. (Also de-fangs the 60-second-floor
cookie edge for late taps.) Converted/manual tokens carry
`expiresAt = departure + 30d` from Piece 0, so after the window the link resolves
to `/invalid` — a real ending. Demo/legacy null-expiry tokens keep current behavior.

### Trip home (`src/app/(trip)/page.tsx` — three branches on `getStayPhase`; new classes in `page.module.css`)

- **PRE_ARRIVAL:** greeting "Welcome, {first}." (NOT "back"); "{n} days until
  {property}" (or "Tomorrow" / "Arriving today") + date range. Perk gift card
  unchanged (it's the pre-arrival hook by design). "Next up" card becomes
  **"Before you arrive"** (interest labels if intake exists, else "A little
  planning now means a seamless arrival." — informational, not a second button).
  Primary CTA **"Plan ahead"** → `/services`; secondary "View itinerary" stays.
- **IN_STAY:** current page, untouched.
- **POST_STAY:** the quiet recap — "Thank you, {first}." · property · past-tense
  date line. Tab summary card via existing `getTab`: settled total; if pending
  → "{$x} settled · {$y} being closed out" linking to `/tab` (never an internal
  number). Brand-voice thank-you (co-brand aware via `resolveBrand`). **ONE
  primary CTA: "Have us along next time."** → inline `NextTripForm`
  (`src/components/trip/NextTripForm.tsx`: one optional "When are you thinking?"
  field + submit, nothing else). Concierge card stays — the line never closes.
  No perk card, no "Next up". BottomNav untouched (itinerary = keepsake,
  tab = receipt).

### Return intent — `submitReturnIntent` in `src/app/actions/intake.ts`

- Requires `getActiveStay()` (token = identity; ZERO contact fields — never ask
  what we already know).
- Creates a `TripIntake`: `answersJson: []`, `tripTiming` from the field,
  `source: "post-stay"`, `stayId`/`guestId`, contact copied from the Guest record.
- Fires the existing `notifyOperator({ type: "trip_intake", ... })` → lands in
  the ops intakes table with zero new ops surface, and is itself convertible via
  Entry B. **The lifecycle loops.**

### Warm close-down (server guards are source of truth; UI mirrors)

- `createServiceRequest` (`src/app/actions/requests.ts`) and `claimPerk`
  (`src/app/actions/perks.ts`): POST_STAY → `{ ok: false }` with warm copy
  ("Your stay has wrapped — text your concierge and we'll take care of next
  time."). **PRE_ARRIVAL requests stay allowed** — that's the plan-ahead funnel.
- `services/[slug]/page.tsx` POST_STAY: `ConciergeLinks` block replaces
  `<RequestForm>`. Services index: one quiet header line ("Your stay has
  wrapped — for next time, just say the word."). Perks index: claim CTAs become
  quiet "your stay has ended" text.
- Itinerary + tab pages: NO changes — they read naturally as history.

### Ops (minimum only — deep ops workflow is explicitly next phase)

- `getRecentlyDeparted()` in `src/lib/opsQueries.ts`: departed within the last
  14 days AND has PENDING tab lines, with pending totals → small **"Recently
  departed — close out"** section on `/ops` after the stays table (guest,
  property, departed date, pending amount, "open" link). The close-out action is
  the existing ChargeButton on stay detail — nothing new.
- Stay detail: replace the meaningless muted `stay.status` string with a derived
  phase badge (`PRE-ARRIVAL` / `IN-HOUSE` / `DEPARTED`).

### CLAUDE.md updates (same PR)

- Env list: `GUEST_EMAIL_FROM` (+ unset behavior).
- Architecture section, one line: stay creation is **PMS-data-first** via ops
  "New stay" (future PMS feed calls the same core); `/plan` intake conversion is
  the **secondary** capture path for non-PMS leads — decided 2026-06-11.
- Roadmap: pre-arrival cadence still pending; welcome email = touchpoint #1,
  sends through `src/lib/guestEmail.ts`.

---

## Implementation order

1. Branch `feat/guest-lifecycle` from `main`.
2. Migration + seed fixes → `npm run db:migrate && npm run db:seed`.
3. `stayPhase.ts` → `guestEmail.ts`.
4. Piece 0 (core → actions → both entry pages → StayForm → table column).
5. Piece 1 (signals → catalog section → ops intake panel).
6. Piece 2 (cookie window → home branches → NextTripForm/submitReturnIntent →
   guards → ops close-out + badge → CLAUDE.md).
7. `npm run lint` + `npm run typecheck` + `npm run build`; conventional commits
   per piece; per-file summary; PR with `--body-file`. **Stop at PR unless told
   to merge.**

## Acceptance checklist (run before the PR)

1. `npm run lint` · `typecheck` · `build` clean.
2. **IN_STAY regression:** `npm run db:seed` → demo link → home byte-identical to
   today (seeded stay is mid-stay); `/demo` sandbox unaffected.
3. **Path B:** incognito `/plan` → 2+ interests + note + contact → `/ops` intake
   row shows "convert" → convert with future dates → panel shows re-derivable
   link + email status (with `GUEST_EMAIL_FROM` set locally, console prints the
   full welcome email; unset → toggle absent, sms/copy fallbacks present) → open
   link in a fresh browser → PRE_ARRIVAL home (countdown + "Before you arrive"
   interests) → `/services` shows "From planning your trip" → submitting a
   request PRE_ARRIVAL works → appears in ops Needs action.
4. **Path A:** `/ops` → "New stay" (blank form) → create → same panel → open
   link → `/plan` as known guest (contact screen absent) → intake auto-links →
   ops stay detail shows the Trip intake panel.
5. **Idempotency:** reopen convert page → panel, not form. Double-submit → exactly
   ONE Guest/Stay/AccessToken (`npm run db:studio`). World-A intake rows show
   "linked", never "convert".
6. **Post-stay:** set stay dates into the past (Studio) → reload → recap (settled
   total · one CTA · concierge card) → submit return intent → new intake
   (`source: "post-stay"`) + operator notification → replayed request POST gets
   the calm refusal → PENDING line on the departed stay appears under "Recently
   departed — close out" → charge via existing button → row clears, guest tab
   settled.
7. Token expiry: minted token has `expiresAt = departure + 30d`; a token past
   expiry resolves to `/invalid`.
8. Reseed → intake cleanup holds, sample intake present, nothing FK-breaks.
9. Guardrail greps clean: economics fields ops-only; no "exclusive" /
   "rev-share" / "vendor-funded" in guest copy (including the welcome email).
10. No hydration warnings on any touched page.

## Explicitly OUT of this plan (do not start)

- Pre-arrival cadence automation (cron / scheduled sends) — `guestEmail.ts` is
  the seam.
- Resend domain verification — deferred; activation is env-only
  (`GUEST_EMAIL_FROM` in Vercel when the domain exists).
- Deep ops workflow (inline status moves from the queue, server-side state-machine
  enforcement) — next phase.
- PMS integration — Entry A's form is the manual stand-in; the core function is
  the seam.
- Card-on-file consent moment / real payments.
- Editing or rescheduling stays in ops (create-only for now).
- Guest accounts, profiles, or cross-stay identity beyond the existing
  email-match-on-create.

## Conventions reminder

Feature branch as named, Conventional Commits, lint before commit, per-file
summary after edits. This document is the approved plan — build as specced; flag
(don't improvise) on any conflict with reality, especially around guest matching
and the idempotency claim.
