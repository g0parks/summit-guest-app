# Plan: Guided trip-intake flow (`/plan`) — the pre-arrival entry experience

## Context

New entry experience for **anonymous pre-arrival leads (World B)**: guest taps a link from a text/email and lands in a calm, guided, presupposing-register conversation that plans their stay — interest capture, not checkout. Ends with contact capture framed as delivery, fires an operator notification, and closes warmly ("your concierge is on it"). Fills the "landing page (next step — not built)" roadmap slot.

### Brief-vs-repo conflicts (brief came from another session; resolved with Parker)

1. **No `Lead` model / no existing landing on `main`** → building fresh; `TripIntake` IS the lead record (nullable `guestId`/`stayId` keep Guest/Stay conversion open). World A = known-guest token, World B = anonymous lead — defined in CLAUDE.md.
2. **Charge/service-fee agreement (card-on-file consent moment)**: stays IN the roadmap as a future, separate build — explicitly NOT in this flow (brief: "Not a checkout"). Don't build for demo.
3. **Bridge → catalog**: `/services` is token-gated; the agreed public **`/explore` page is a FUTURE add, not this build**. Close screen = concierge promise + optional "text us now" only.
4. **Voice notes: DEFERRED (nice-to-have).** Capstone ships typed-note-only. Fast-follow path agreed: Postgres `Bytes` table + ops audio route + `bodySizeLimit` bump — its own migration/PR later. No unused schema now.

## Scope (this build)

### Schema (migration: `trip_intake`)

```prisma
model TripIntake {
  id          String   @id @default(cuid())
  name        String?
  email       String?
  phone       String?
  tripTiming  String?  // loose free text: "mid-February, presidents' week"
  answersJson Json     // [{ key, question, answer: "interested"|"declined", serviceSlug }]
  note        String?  // typed capstone
  utmJson     Json?    // attribution only (AccessToken.utmJson precedent)
  source      String?  // ?src= on the link (sms | email | …)
  stayId      String?  // set when a known-guest session existed at intake time
  stay        Stay?    @relation(fields: [stayId], references: [id])
  guestId     String?  // future World-A conversion
  guest       Guest?   @relation(fields: [guestId], references: [id])
  createdAt   DateTime @default(now())
}
```
(+ back-relations on `Stay`/`Guest`.) One write at completion — no partial rows (anonymous abandon has no contact → not actionable; no funnel analytics in v1).

### The flow — one route, client step machine

`src/app/plan/page.tsx` (public server component): reads `searchParams` (utm/`src`), calls existing `getActiveStay()` (`src/lib/session.ts`) — session present → personalized welcome ("Park City · Mar 14–18 · Empire Pass Chalet"), contact screen skipped, `stayId` recorded; else "your upcoming stay". Renders `<IntakeFlow>` (client, `src/components/intake/IntakeFlow.tsx` + module css).

Screens:
1. **Welcome** — serif headline, trip acknowledged, one "Begin" action. Premium, same design tokens.
2. **Q1–Q5** — one per screen, serif question, two tap answers (presuppose / guilt-free pass), subtle dots, back chevron. Config in `src/lib/intakeFlow.ts` (`serviceForm.ts` demo-config pattern), L1-mapped:
   - `airport-car` → "Should we have a car waiting when you land at SLC?" (*Yes — have a car waiting* / *I'm set*) → `airport-transfer-slc`
   - `kitchen` → "Arriving to a stocked kitchen, or planning to shop?" (*Stock it* / *I'll shop*) → `grocery-pre-stock`
   - `gear` → "Skis and boots fitted and waiting in the mudroom — or bringing your own?" (*Fit us* / *Bringing ours*) → `ski-bike-rental`
   - `chef` → "Most guests do at least one dinner in-residence. Want us to hold a chef for a night?" (*Tell me more* / *We're set*) → `private-chef-dinner`
   - `guide` → "One day on the mountain with a private guide — first tracks, no lift lines. Interested?" (*Interested* / *Not this trip*) → `private-ski-guide`
   - No prices anywhere in the flow.
3. **Capstone** — "Anything else about your trip? A celebration, dietary notes, something you're hoping for —" textarea, optional, skippable. (Voice = fast-follow.)
4. **Contact** (anonymous only) — "Where should we send your trip plan?" name / email / phone / optional "When's the trip? (roughly is fine)". Quiet skip link — nothing forced.
5. **Close** — "Your concierge is on it — we'll have your plan shortly." If `CONCIERGE_PHONE`/`EMAIL` configured: quiet "or text us now" via existing `ConciergeLinks` + new generic builder `intakeFollowupMessage()` in `src/lib/concierge.ts` (World B has no stay context). Skipping everything still lands here warmly. No catalog bridge (future `/explore`).

### Submission + notification

`src/app/actions/intake.ts` — `submitTripIntake(prev, formData)` (useActionState idiom like QuoteForm): persist `TripIntake`, fire `notifyOperator` new event `trip_intake` (`src/lib/notify.ts`): interest labels, note preview, contact, timing, source. **Priority legible in subject**: ≥2 interests OR a note → `[Summit] ★ PRIORITY trip intake — <name> (3 interests · note)`. No-contact skips persist + notify, marked "no contact left".

### Ops visibility

- `getRecentIntakes()` in `src/lib/opsQueries.ts`; "Trip intakes" section on `/ops` home: when · name/contact · timing · interest chips · note excerpt. Dense/utilitarian.

### Docs

- `CLAUDE.md` roadmap bullet rewrite: intake shipped at `/plan` (World B); card-consent agreement = future separate build; `/explore` public catalog = future add; voice capstone = fast-follow; World A/B terms.
- Repo copy of this plan → `docs/plans/2026-06-10-trip-intake.md`.

## Out of scope (flag if tempted)
Voice recording/storage · `/explore` public catalog · card-on-file consent · World-A token generation/email cadence · transcription · prices in the flow · intake→Stay conversion UI · funnel analytics.

## Verification

1. `npm run lint` · `typecheck` · `build` clean.
2. Puppeteer walk (`.scratch/verify-intake.mjs`, mobile viewport 390×844):
   - Full path: 3 interested + 2 passed, typed note, contact + timing → close screen; DB row correct (check script); `/ops` shows intake with chips; console notification contains `PRIORITY`.
   - Skip-everything path: all passes, no note, skipped contact → warm close; row persisted; notification marked no-contact.
   - Known-session path: `/plan` with demo token cookie → personalized welcome, contact screen absent, `stayId` set.
   - Close-screen concierge link present when env set; absent + unbroken when unset.
   - Zero hydration warnings; guardrail greps (no "exclusive"/"rev-share"/"vendor-funded" in guest copy).
3. Branch `feat/trip-intake`, conventional commits, PR to main with `--body-file`, per-file summary. Stop at PR unless told to merge.
