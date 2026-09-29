# Live App Audit — 2026-08-29 (Claude + Playwright/browser pass against production)

Tested against https://summit-guest-app.vercel.app/demo (live prod, not local). Known limitation: `/demo?partner=` co-branding bug means this ran against the seeded placeholder partner ("Alpine Crest Collection") rather than a real co-branded example — that bug is already tracked in `Summit — Master.md`, not re-flagged here.

## Corrections after review with Parker (8/29)

1. ~~**Header says "POWERED BY SUMMIT" — should say "Powered by Aerie."**~~ **Not an issue — this was correct all along.** I mistakenly generalized the "lead with Aerie" doctrine (which is about verbal/spoken pitch language on sales calls, to avoid confusion with the competitor "Summit Luxury Vacations") into a rule about in-app UI copy. Parker's actual model: Aerie is the guest-facing app product itself; Summit is the company operating it; "powered by Summit" is the correct Stripe/Shopify-style attribution line. No code change made.

2. ~~**Airport Transfer cutoff shows "12h notice" — doctrine says 24h.**~~ **Partially my error, partially a real fix.** The "12h notice" was `leadTimeHours` (booking lead time), a different field from `moveCutoffHours`/`cancelCutoffHours` (both already correctly 24h, matching doctrine). Parker confirmed the lead time itself should also be 24h — **fixed**: `prisma/seed.ts`, `leadTimeHours: 12` → `24` for `airport-transfer-slc`.

3. ~~**Flight number not visible in the first two steps.**~~ **Not a bug — I just hadn't clicked far enough.** Confirmed in `src/lib/serviceForm.ts`: flight number is step 3 of the Airport Transfer intake (after date/time/party size, then direction), exactly as doctrine describes ("the hero field"). No change needed.

## Original findings (superseded by corrections above, kept for the record)

1. **Header says "POWERED BY SUMMIT" — should say "Powered by Aerie."** This is live, guest-facing, in production. Directly contradicts the spoken-brand doctrine (Aerie = guest-facing/spoken, Summit = legal/written only) that's documented in the app's own `CLAUDE.md`/`AGENTS.md` and multiple vendor conversations. Notably, the demo lead-capture popup later in the same flow correctly says "This is the **Aerie** demo" — so the app is internally inconsistent about its own name. This is a trivial copy fix (one string) with outsized brand-consistency impact since it's the very first thing a guest/PM sees.

2. **Airport Transfer cutoff shows "12h notice" — doctrine says 24h.** `Product Doctrine.md`'s changeability policy states transfer cutoff = 24h (rentals 48h, chef/experiences 72h). The live seeded service data has this specific service set to 12h. Either the seed data is wrong or the doctrine number was always a placeholder that never got reconciled with what's actually seeded — worth deciding which is correct and aligning the other.

3. **Flight number not visible in the first two steps of the Airport Transfer intake.** Doctrine calls flight number "the hero field" for this exact service (`Product Doctrine.md`: "Airport transfer — flight number is the hero field"). I walked through: (1) date/time/party size, (2) direction (airport→residence / residence→airport / round trip) — no flight number field surfaced in either step. It may appear on a later step I didn't reach (the flow continues past "direction"), but worth Parker walking the full flow himself to confirm the hero field actually appears somewhere, since it didn't show where I'd have expected it (step 1, alongside date/time).

## Things that work well (confirmed doing what doctrine says)
- **Resumption surface**: abandoning the Airport Transfer mid-flow and returning to the home screen correctly surfaced an "IN MOTION — Airport Transfer — SLC, a few details and it's done" card. Matches the INFO_NEEDED/resumption doctrine exactly.
- **Running tab**: clean, shows saved card + settled line items, genuinely delivers the "never pull out your wallet" feel the doctrine is going for.
- **Seasonal menu**: no ski rental shown (only bike rental) since it's currently August — correctly reflects the "dishes are seasonal" doctrine, not a bug.
- **Perk gift card, concierge phone/email links, itinerary "next up" card** — all present and reasonably polished for a solo-built MVP.

## What I didn't get to (would need more time / your input to finish)
- Completing the full Airport Transfer intake to confirm where/whether flight number actually appears.
- The `/plan` pre-arrival intake flow specifically (different entry point than `/demo`).
- Any explicit competitor comparison (Duve, Operto, YourWelcome, or the named local competitors like Sam Rubin's Done Concierge) — would need either their public demos/marketing or your own notes on what they do differently; I don't have login access to compare live products.
- Mobile-viewport-specific issues (tested at whatever the panel's fill viewport rendered — worth a dedicated pass at actual mobile width given this is explicitly "mobile-first" doctrine).

## My honest read
The core mechanics (resumption, running tab, seasonal catalog, request lifecycle) are solid and match the doctrine you wrote. The issues I found are small, fast fixes (one copy string, one cutoff-hours value, confirm one form field) — none of them are "the app isn't ready" problems. The bigger blocker to going live isn't code quality, it's still what your own docs already say: PMs signed and guests in the funnel.
