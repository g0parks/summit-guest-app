# Plan #2: Partner co-brand theming + Perk Bank (MVP)

> Hand-off plan for the dev agent. Written 2026-06-09. Two branches, in order:
> `feat/partner-theming`, then `feat/perk-bank` (B depends on A's schema; both depend on
> plan #1 — `docs/plans/2026-06-09-ops-mvp.md` — being merged, see Phase D note).
> Read `CLAUDE.md` first; constraints there apply. This plan implements two roadmap
> pillars already decided there ("Co-brand, hot-swappable" and "Perk Bank").

## Context — why this exists

- The guest app is the **PM sales weapon**: the pitch moment is a PM tapping a demo on
  their own phone and seeing "**[Their Brand] Concierge** — powered by Summit." Today the
  wordmark is hard-coded `SUMMIT` and `Property.partnerName` is a display-only string.
- The **Perk Bank** is Summit's first-party acquisition mechanism: guest claims a
  complimentary perk → leaves contact + opt-in → Summit builds its own cross-PM list.
  Perks are qualified-CAC (a guest who claims a recovery session self-identifies as the
  whale profile). None of this exists in the app yet.

**Standing guardrails that bite here:**
1. Theming is a **data-driven layer, not hard-coded** — hot-swappable per partner with
   zero code changes. PM brand primary, Summit quiet.
2. **Never** surface rev-share, vendor economics, or "vendor-funded" language in any
   guest-facing copy. Perk internal cost is operator-only.
3. The claim flow must feel like a **gift, not lead-gen** — design taste: warm, airy,
   restrained; one primary action; minimal fields. No coupon-spam energy.

---

## Phase A — Partner model + theming layer (`feat/partner-theming`)

### A1. Schema

```prisma
model Partner {
  id             String     @id @default(cuid())
  slug           String     @unique
  name           String     // "Luxury Park City Rentals"
  conciergeLabel String?    // optional override; default co-brand = "<name> Concierge"
  logoUrl        String?    // optional; text wordmark fallback when null
  accentColor    String?    // hex, e.g. "#7A6248"; null = Summit default accent
  isActive       Boolean    @default(true)
  properties     Property[]
  perks          Perk[]     // Phase B
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
}
```

- `Property`: add `partnerId String?` + relation. **Remove `partnerName`** (it's
  display-only cruft once Partner exists; pre-launch, seed wipes data — safe).
- Keep theme tokens minimal on purpose (name + logo + one accent). Resist adding a
  full token set until a real partner forces it.

### A2. Resolution + rendering

- `src/lib/session.ts`: include `partner` in the property include on `ActiveStay`
  (token → stay → property → partner). One query, no extra round trip.
- `src/lib/branding.ts` (new): `resolveBrand(property)` →
  `{ label: "<partner.name> Concierge" | "SUMMIT", poweredBy: boolean, accentColor, logoUrl }`.
  Null partner (or inactive) → pure Summit branding, exactly the current look. All
  co-brand display logic goes through this one function.
- `src/app/(trip)/layout.tsx`: set CSS custom properties from the brand on the layout
  wrapper (inline `style` — e.g. `--accent: ...`) so the accent flows everywhere without
  per-component changes. **Check `globals.css` first** and make sure accent usages
  reference the custom property being overridden; align names rather than introducing a
  parallel variable.
- Home topbar (`src/app/(trip)/page.tsx`): wordmark becomes the co-brand lockup —
  partner label primary, `powered by Summit` small and quiet beneath. Summit-only
  fallback keeps the current `SUMMIT` wordmark with no "powered by" line.
- Page `metadata` title: "<brand label>" instead of hard-coded Summit where stay context
  exists. `/invalid` stays Summit-generic (no stay context — never guess a brand there).

### A3. Demo reseed as the sales weapon

- `prisma/seed.ts`: create one demo partner and attach the demo property. Default is a
  **fictional but plausible** PM (e.g. "Alpine Crest Collection") — do NOT ship a real
  PM's name in the default seed (the deploy is live; a Tier-1 target finding their own
  brand on it uninvited is a bad first impression).
- Hot-swap for a real pitch via env overrides read by the seed:
  `DEMO_PARTNER_NAME`, `DEMO_PARTNER_ACCENT` (and optional `DEMO_PARTNER_LOGO_URL`).
  PowerShell: `$env:DEMO_PARTNER_NAME = "Luxury Park City Rentals"; npm run db:seed`.
  Document this in CLAUDE.md commands — this is the "demo on their own phone" move.

---

## Phase B — Perk Bank (`feat/perk-bank`)

### B1. Schema

```prisma
enum PerkClaimStatus {
  CLAIMED
  FULFILLED
  CANCELLED
}

model Perk {
  id         String      @id @default(cuid())
  slug       String      @unique
  name       String      // "Recovery Lounge Session"
  vendorName String?     // "Avanto"
  shortDesc  String
  longDesc   String?
  valueLabel String?     // guest-facing: "$65 value" — generosity framing, optional
  heroImage  String?
  costCents  Int?        // INTERNAL qualified-CAC — NEVER guest- or PM-facing
  partnerId  String?     // null = available across all partners
  partner    Partner?    @relation(fields: [partnerId], references: [id])
  isActive   Boolean     @default(true)
  sortOrder  Int         @default(0)
  claims     PerkClaim[]
  createdAt  DateTime    @default(now())
  updatedAt  DateTime    @updatedAt
}

model PerkClaim {
  id             String          @id @default(cuid())
  perkId         String
  perk           Perk            @relation(fields: [perkId], references: [id])
  stayId         String
  stay           Stay            @relation(fields: [stayId], references: [id])
  email          String?
  phone          String?
  marketingOptIn Boolean         @default(false)
  status         PerkClaimStatus @default(CLAIMED)
  operatorNote   String?
  createdAt      DateTime        @default(now())

  @@unique([stayId, perkId]) // one claim per perk per stay
}
```

(Add `perkClaims PerkClaim[]` to `Stay`.)

### B2. Guest flow

- **Perks visible to a stay** = active perks where `partnerId` is null OR matches the
  stay's property partner. Query lives in `src/lib/queries.ts`.
- `src/app/(trip)/perks/page.tsx` (+ module.css) — the Perk Bank. Framed as a gift from
  the brand: heading like "With our compliments" / "A gift from <brand label>". Cards
  show name, vendor, shortDesc, valueLabel; claimed perks show a quiet "Claimed" state.
- `src/app/(trip)/perks/[slug]/page.tsx` — detail + claim (mirror the services
  detail/request pattern).
- `src/components/perks/ClaimForm.tsx` (client, `useActionState` — copy the
  `RequestForm.tsx` pattern): fields are **first name (prefilled, read-only), email,
  phone, one opt-in checkbox** — nothing else. Validation: at least one of email/phone.
  Opt-in copy, exactly this register: "Keep me in touch for future stays" — default
  UNCHECKED, claim works without it. Confirmation state: warm, concierge-voiced
  ("Consider it arranged — we'll be in touch to schedule.").
- `src/app/actions/perks.ts` — `claimPerk` server action:
  1. `getActiveStay()` gate (same expiry error shape as `createServiceRequest`).
  2. Validate perk is active + visible to this stay; reject duplicate claim cleanly
     (catch the unique violation, return "already claimed" — not a 500).
  3. Create `PerkClaim`.
  4. **First-party capture:** if `Guest.email` / `Guest.phone` is null, write the
     provided value onto the Guest record. Never overwrite existing values.
  5. `notifyOperator({ type: "perk_claimed", ... })` — new member of the
     `OperatorEvent` union in `src/lib/notify.ts` (guest, property, perk, contact,
     optIn). Works with either the console fallback or plan #1's email transport.
  6. `revalidatePath("/perks")` + `/`.
- **Home page**: when unclaimed perks exist, a gift card section above "Next up" —
  eyebrow "A gift from <brand label>", first unclaimed perk name, link to `/perks`.
  This is the pre-arrival hook moment; keep it one card, not a carousel.
- **BottomNav** (`src/components/nav/BottomNav.tsx`): add "Perks" as a 5th item (gift
  icon, match existing stroke style). If 5 items visibly cramps the existing layout at
  390px width, flag and propose before improvising.
- **No payments involvement.** Perks never touch the tab. A claim is not a tab line.

### B3. Seed

2–3 demo perks aligned with the actual vendor thesis (recovery/wellness = whale filter):
e.g. complimentary Avanto recovery session (`costCents` ~3500, internal), a welcome
provisioning basket, a 50%-off sauna session. Copy: generous and specific, no "FREE!"
energy, no exclusivity overclaiming (don't say "exclusive" — say "with our compliments").

---

## Phase C — Ops + notification integration (after plan #1 merges)

- `OperatorEvent` union gains `perk_claimed` (done in B2 regardless — the transport
  doesn't care).
- Ops console: perk claims appear in the `/ops` needs-action queue (status `CLAIMED`)
  and as a section on `/ops/stays/[stayId]` (perk, contact left, opt-in flag, internal
  `costCents`), with a mark-FULFILLED / CANCELLED action in `src/app/actions/ops.ts`.
- If plan #1 hasn't merged when Phase B is done, ship B without this and do Phase C as a
  follow-up PR — don't block the guest flow on it.

## Phase D — CLAUDE.md updates (same PRs as the work)

- Roadmap section: mark co-brand theming and Perk Bank v1 as **shipped** (keep the
  pre-arrival cadence bullet — that's still future).
- Commands: document `DEMO_PARTNER_NAME` / `DEMO_PARTNER_ACCENT` reseed move.
- Architecture: note `Partner` is the theming resolution point (guest copy: partner
  primary, Summit quiet; never rev-share language).

---

## Acceptance checklist (run before each PR)

**Theming (Phase A):**
1. `npm run lint` + `npm run typecheck` clean.
2. Default seed → home shows "Alpine Crest Collection Concierge" lockup with quiet
   "powered by Summit"; accent color applied app-wide (nav active state, CTA, links).
3. `$env:DEMO_PARTNER_NAME = "Test PM"; $env:DEMO_PARTNER_ACCENT = "#335577"; npm run db:seed`
   → branding + accent hot-swap with zero code changes.
4. Property with no partner → current pure-Summit look, no "powered by" line, default
   accent. Pixel-identical to today.
5. `/invalid` shows Summit-generic branding always.

**Perk Bank (Phase B):**
6. Perks page lists seeded perks under the co-brand gift framing; home shows the gift
   card when unclaimed perks exist, hides it when all are claimed.
7. Claim with email only → claim recorded; `Guest.email` populated (was null); operator
   notification fires; perk shows "Claimed"; home gift card updates.
8. Second claim attempt on same perk → clean "already claimed" message, no 500.
9. Claim with neither email nor phone → validation error, nothing written.
10. Existing `Guest.email` is never overwritten by a claim with a different email.
11. Grep `costCents` (Perk's) — appears only in schema, seed, ops files, migrations.
    Zero hits under `src/app/(trip)` or `src/components`.
12. Grep guest-facing copy for forbidden language: no "rev-share", no "vendor-funded",
    no "exclusive". ("Complimentary" / "with our compliments" is the register.)

## Explicitly OUT of this plan (do not start)

- Pre-arrival email cadence / sending guests anything (no guest-facing email infra yet)
- Perk inventory limits, expiry windows, redemption codes
- Multi-tenancy, PM-facing anything, partner self-service
- Logo upload/storage (logoUrl is a plain URL for now)
- Scheduling a claimed perk onto the itinerary (operator can handle manually; revisit)

## Conventions reminder

- Two feature branches as named above, Conventional Commits, lint before commit,
  per-file summary after edits. This document is the approved plan — build as specced;
  flag (don't improvise) on any conflict with reality.
