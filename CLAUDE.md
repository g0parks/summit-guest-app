# CLAUDE.md — Summit Guest App

## What this is
Guest-facing web experience for **Summit Luxury Logistics** — a luxury vacation-rental concierge layer in Park City, UT.
A guest of a partner property manager gets a pre-arrival email with a unique link, taps it, and lands in *their* personalized trip: itinerary, curated service catalog, request flow, and a single running tab. No login, no account. Summit fulfills manually behind the scenes; the guest just gets a seamless, premium experience.

**Target user:** high-spend luxury traveler ($5–20K concierge spend), on their phone in the rental. Experience should feel like a personal concierge in your pocket — calm, premium, effortless — NOT like a booking SaaS dashboard.

## Positioning & roadmap (decided — do not regress)
- **Catalog leads with L1 essentials** (airport transfer, ski/bike rental, local experiences, grocery) — the demand-router core where margin + frequency live. Chef / heli / sommelier are **L2 "Elevated,"** sorted below the fold. Don't let splashy one-offs lead.
- **Lift tickets are NOT an exclusive moat** — just easy acquisition at a markup (CAC). Don't build "exclusive/gated access" UI around them.
- **Perk Bank (v1 shipped 2026-06-09):** "claim your complimentary perk → leave your contact" = first-party lead capture + opt-in. Guest register is gift, not lead-gen ("with our compliments" — never "exclusive"/"FREE!"); `Perk.costCents` is internal qualified-CAC, ops-only. Claims never touch the tab. Pre-arrival cadence still to build: at booking · ~2 wks post-booking · ~2 wks pre-arrival.
- **Co-brand, hot-swappable (shipped 2026-06-09):** the experience renders as "[PM] Concierge, powered by Summit" — PM brand primary, Summit quiet. `Partner` is the theming resolution point (`src/lib/branding.ts` — ALL co-brand display logic goes through `resolveBrand()`); tokens stay minimal (name, logo, one accent) until a real partner forces more. Never surface rev-share language in partner-facing copy.
- **Landing page (next step, post-demo — not built):** pre-trip landing with concierge opt-in + charge/service-fee agreement (card-on-file consent moment). Placement TBD — may fold into the token landing or the pre-arrival email flow rather than stand alone. Don't start without a plan.
- **Rev-share is internal-only.** The data model will carry per-line economics (vendor cost / PM share / net; net target 15–20%), but **never surface rev-share in any guest- or PM-facing copy.** The PM-facing pitch stays "free / PM pays nothing."

## Stack
- **Next.js** (App Router) — frontend + API routes in one app
- **Postgres** via Supabase (or Prisma) — real DB, not Airtable
- **TypeScript**, strict mode, no `any`
- Mobile-first. Clean, restrained luxury styling — generous whitespace, high-end not flashy
- Keep infra minimal: no auth library, runnable locally first

## Architecture (decided — do not deviate without flagging)
- **Access = signed, unguessable per-guest token** in the link, server-resolved to the guest record. The token IS identity. NOT a UTM/analytics param, NOT a guessable/sequential ID. UTM params may ride alongside for attribution analytics only — never as the access key.
- **`/demo` is the ONE sanctioned self-serve mint:** creates a fresh per-visitor sandbox (guest+property+stay, `Stay.isDemo`) with a real signed token — pitch URL + post-pitch PM leave-behind. `?partner=<slug>` renders a pre-created partner's co-brand (never URL-driven free text). 30-day lazy GC on each hit; notifications tagged `[Summit DEMO · <partner>]`; ops shows DEMO badges. Token model otherwise unchanged.
- **Passwordless.** No login screen, no account creation. Token resolves the guest. First visit may optionally bind token→email/phone for re-entry; keep minimal.
- **Payments are STUBBED for now** — mock card-on-file + mock per-service charges, real-feeling running-tab state. But ARCHITECT for real Stripe later: SetupIntent (save card once) + off-session PaymentIntent (charge per service). Leave clean seams/interfaces where Stripe drops in. No real keys, no real money. Big-ticket items (e.g. transport reservations) pre-authorize a hold and capture the actual amount after — the `PaymentProvider` interface reserves a hold/capture path.
- **Provider fulfillment is manual** — a guest request registers in the system (and ideally notifies the operator). No provider integration, no automated dispatch.
- **Single guest-facing app.** Catalog can be seeded data.
- **Reserve internal per-line economics** — tab lines can carry `vendorCostCents` / `pmShareCents` / `netCents` (net target 15–20%); computed + stored internally, NEVER surfaced to guest or PM.

## The three things the experience must nail (equal priority, one connected flow)
1. Itinerary view — their trip in one place
2. Service catalog + low-friction request flow
3. Running tab — "you never pull out your wallet" feel

## Out of scope (do NOT build yet — flag if tempted)
- PM-**facing** dashboard (internal operator console `/ops` exists as of 2026-06-09)
- Multi-tenancy
- PMS API integration
- Real payments / Stripe Connect
- Native app / app store
- CMS for the catalog

## Working agreements
- **Plan before building.** Propose approach + schema + file structure and WAIT for my approval before implementing. Use plan mode.
- After edits, give a **per-file summary** of what changed.
- **Flag, don't work around.** If a request conflicts with an architecture constraint above, surface it — don't silently route around it.
- **Ask, don't assume** when a decision isn't specified.
- Conventional Commits (`feat:`, `fix:`, `refactor:`). Feature branches, never commit straight to main.
- Run lint before committing.

## Commands
- `npm run dev` — start dev server (localhost:3000)
- `npm run build` / `npm run start` — production build / serve
- `npm run lint` · `npm run typecheck` — lint / type-check (run before committing)
- `npm run db:seed` — wipe + reseed demo data; prints a fresh demo link. Co-brand hot-swap for a pitch: `$env:DEMO_PARTNER_NAME = "Luxury Park City Rentals"; $env:DEMO_PARTNER_ACCENT = "#335577"; npm run db:seed` (default partner is fictional on purpose — never ship a real PM's brand uninvited)
- `npm run db:migrate` — apply Prisma migrations · `npm run db:studio` — DB browser
- `npm run token` — mint a new demo access token (`scripts/new-demo-token.ts`)
- `npm run ops:link` — print the operator entry link for `/ops` (`scripts/ops-link.ts`)
- `npm run partner:add` — pre-create a partner + print its pitch URL (`/demo?partner=<slug>`): `$env:PARTNER_NAME = "Luxury Park City Rentals"; $env:PARTNER_ACCENT = "#335577"; npm run partner:add`. Reseeding wipes partners — re-run after `db:seed`.

## Deploy
- Hosted on **Vercel** (project `summit-guest-app`), GitHub-connected → **auto-deploys on push to `main`**. Live (token-gated): https://summit-guest-app.vercel.app
- Env vars live in the Vercel dashboard (paste `.env`; don't use `vercel env add` from PowerShell — it appends a stray `\r`). `vercel --prod` from this machine fails (UNKNOWN) — **deploy via git push, not the CLI.**
- Env vars (see `.env.example`): `RESEND_API_KEY` + `OPERATOR_EMAIL` (operator emails; unset → console fallback), `APP_BASE_URL` (email deep links + link scripts), `OPS_KEY` (gates `/ops`) — set locally in `.env` and in the Vercel dashboard.

## Notes
- This file is living. When you correct me on something that should persist, remind me to add it here.
- Keep this file under ~150 lines — it loads every session.
