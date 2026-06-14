# CLAUDE.md — Summit Guest App

## What this is
Guest-facing web experience for **Summit Luxury Logistics** — a luxury vacation-rental concierge layer in Park City, UT.
A guest of a partner property manager gets a pre-arrival email with a unique link, taps it, and lands in *their* personalized trip: itinerary, curated service catalog, request flow, and a single running tab. No login, no account. Summit fulfills manually behind the scenes; the guest just gets a seamless, premium experience.

**Target user:** high-spend luxury traveler ($5–20K concierge spend), on their phone in the rental. Experience should feel like a personal concierge in your pocket — calm, premium, effortless — NOT like a booking SaaS dashboard.

## Prime directive (decided 2026-06-14 — how PMs & the public should see Summit)
Summit turns money the guest was **already going to spend** into a stay they remember — and **gives the credit to the host**. Summit does the work, carries the cost, stays behind the curtain (co-brand quiet, free to the PM); it can afford to give away the credit because it monetizes the guest's spend.
**The PM is an *owner*-farmer, not a guest-farmer** — their real customer is the property owner who hired them; the guest is their product. So the pitch is a **one-two punch**: jab with **guest retention** (better stays, zero cost/effort — the easy, visible yes), then land the cross with **owner/client retention** (hand them proof their guests were thrilled = ammunition to keep the owner's management contract at renewal). Summit becomes **how the PM keeps their properties.** This is *why* rev-share never comes up — the offer is the PM's whole business surviving, not a fee split; money would only shrink it. (Sell to the PM company's owner/operator; never surface rev-share.)
**We never buy reviews — we earn them.** The ONLY thing a gift is exchanged for is honest **first-party feedback** ("tell us how we did" — better data than a star rating, and the proof we hand the host). Platform reviews stay **organic + ungated** (incentivized/gated public reviews violate Airbnb/VRBO/Google + the FTC 2024 review rule — penalty lands on the *PM's* listing).
**The integrity screen — milk, not meat:** every revenue line must leave the guest *better off* and be paid gladly for real value (renewable = milk); never extract once by hiding, gating, or manipulating (meat). If it only works when the guest doesn't notice, it's meat — cut it. (Secular form of an internal ethical charter; revenue framing stays internal.)

## Positioning & roadmap (decided — do not regress)
- **Catalog leads with L1 essentials** (airport transfer, ski/bike rental, local experiences, grocery) — the demand-router core where margin + frequency live. Chef / heli / sommelier are **L2 "Elevated,"** sorted below the fold. Don't let splashy one-offs lead.
- **Lift tickets are NOT an exclusive moat** — just easy acquisition at a markup (CAC). Don't build "exclusive/gated access" UI around them.
- **Perk Bank (v1 shipped 2026-06-09):** "claim your complimentary perk → leave your contact" = first-party lead capture + opt-in. Guest register is gift, not lead-gen ("with our compliments" — never "exclusive"/"FREE!"); `Perk.costCents` is internal qualified-CAC, ops-only. Claims never touch the tab. Pre-arrival cadence still to build: at booking · ~2 wks post-booking · ~2 wks pre-arrival — the welcome email (shipped with the lifecycle build) is touchpoint #1; ALL guest-facing email sends through `src/lib/guestEmail.ts`. Post-departure touch (roadmap): **sentiment-first** ("how was your trip — any friction?"), restay-second; **never push re-stay until the guest is home** — the post-stay page's capture stays passive/guest-initiated.
- **Co-brand, hot-swappable (shipped 2026-06-09):** the experience renders as "[PM] Concierge, powered by Summit" — PM brand primary, Summit quiet. `Partner` is the theming resolution point (`src/lib/branding.ts` — ALL co-brand display logic goes through `resolveBrand()`); tokens stay minimal (name, logo, one accent) until a real partner forces more. Never surface rev-share language in partner-facing copy.
- **Trip intake (shipped 2026-06-10): `/plan` is the pre-arrival entry experience** — guided one-tap questions over the L1s in a presupposing register ("Should we have a car waiting?" never "Would you like…"), typed capstone note, contact-as-delivery at the END. World B = anonymous lead (`TripIntake` row + prioritized operator notification); World A = known-guest token (personalized, contact skipped). NO prices/checkout in the flow — interest capture only. **Future, not built:** deposit + policy-consent moment (decided 2026-06-13: surfaced at the deposit/accept tap = the card-consent seam, written to the bundled folio email — NO per-booking confirmation email), public `/explore` catalog bridge, voice-note capstone (Postgres-bytes approach agreed).
- **The demand-broker spine (SHIPPED 2026-06-12, PRs #14/#15 + structured changes; as-built record: `docs/plans/2026-06-12-request-lifecycle.md`):** one-tap interest signals → guided execution capture → routing. Lifecycle: `SIGNALED → READY → QUOTED → CONFIRMED → SCHEDULED → COMPLETED` (+ `EXPIRED` via lazy sweep, `DECLINED/CANCELLED`); **two pricing paths, never conflated** — fixed-price auto-CONFIRMs on wizard completion (no quote, no approval); only `priceUnit QUOTE` passes READY → QUOTED → guest's in-app **approveQuote** tap (the future card-consent seam) which alone creates the tab line. `/plan` interests enroll as SIGNALED; the app home screen pre-arrival = the resumption surface (say "app home screen," never "trip home"); ops = six queues, one action each; nudges = operator-tapped `sms:` drafts with `/t/<token>?next=` deep links. Unconverted demand (EXPIRED) is still data — the broker's book records what was wanted, not just what was sold.
- **The menu doctrine (decided 2026-06-12): the app is the waiter.** Chef-designed offerings with mild substitutions — never configurators. **Parameters, not solutions:** ask party + bags, Summit picks the car; the guest never picks the operational answer. Guided completion starts immediately after the signal tap (intent is hot), graceful exit always. Stay-level parameters (e.g. has-rental-car) are captured once and re-price the menu (preemptive shuttle for distance activities). **Dishes are seasonal (shipped):** stay dates drive the menu (ski = winter dish, bike = summer dish; `staySeason()`), and `/plan` questions are season-keyed (`intakeQuestionsFor()`; World B seasons off today's date; summer copy is placeholder pending Parker's pass). Planning-horizon attribute (pre-arrival vs in-stay spontaneous, e.g. ski tuning) is roadmap. Change/cancel policy is per service (`Service.moveCutoffHours`/`cancelCutoffHours`; null = concierge-only, by doctrine); in-app Move/Cancel needs the booking **pre-delivery AND within cutoff** — delivered or past-time → escape hatch only (`isChangeableStatus`, 2026-06-13). **Refund direction (NOT built):** a refundable **deposit** holds the booking, Summit's refund deadline set INSIDE the vendor's (the gap = our buffer + forces early commitment); auto-refund before it, discretionary between Summit's and the vendor's, locked after — needs new per-service deposit/refund/modify fields + Stripe hold/capture. Fee *amounts* stay human-handled/never rendered, but the **policy shape** (refundable-until · deposit) IS disclosed (consent tap + folio email). Adding a service → `docs/adding-a-service.md`.
- **Channel doctrine (decided 2026-06-12 — supersedes "the thread is the interface"):** the APP is the interface; demand moments are structured taps, never composed messages. SMS = Summit-initiated and purposeful (nudges, confirmations — outbound infra NOT built yet, needs scoped cadence plan first). Inbound texting = quiet, unpromoted escape hatch (the one sanctioned post-cutoff surface). Email = documents (welcome, plan delivery, the bundled folio = the written record; NO per-booking confirmation email — decided 2026-06-13). Post-plan close = confirmation + "by end of day" expectation, never a contact CTA as the primary action.
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
- **Provider fulfillment is manual — by doctrine, not just MVP.** The POS principle: the guest can't tell waiter-memory from a POS; the backend graduates human → automated behind the same interface. Vendor automation WILL happen but is deferred until routing data exists — design every ops action as a clean seam ("route this order"), build none of the wiring. Per-service request fields are **demo-level config** in `src/lib/serviceForm.ts` (slug-keyed; answers land in `ServiceRequest.detailsJson`) — planned graduation: chef-designed execution schemas (per-rider repeaters, substitution points, completeness rules) per the menu doctrine.
- **Single guest-facing app.** Catalog can be seeded data.
- **The concierge texting line is the escape hatch, not the interface** (channel doctrine 2026-06-12 demoted the 2026-06-10 "thread is the interface" stance). Keep `sms:` deep links (`src/lib/concierge.ts`) but quiet — never the primary CTA. Change requests ARE structured in-app actions (shipped 2026-06-12): `/itinerary/[itemId]/change` offers Move/Cancel/Something-else inside the service's cutoff windows (`src/lib/changePolicy.ts`); past cutoff or null cutoff → ONLY the texting escape hatch, by doctrine. No in-app chat, no guest-facing bot (unchanged).
- **Stay creation is PMS-data-first** via ops "New stay" (the future PMS feed calls the same core, `src/lib/opsStay.ts`); `/plan` intake conversion is the **secondary** capture path for non-PMS leads — decided 2026-06-11. Stay phase (pre-arrival / in-stay / post-stay) is DERIVED from dates (`src/lib/stayPhase.ts`, 30-day post-stay window); `Stay.status` is write-only legacy.
- **Reserve internal per-line economics** — tab lines can carry `vendorCostCents` / `pmShareCents` / `netCents` (net target 15–20%); computed + stored internally, NEVER surfaced to guest or PM.

## Pre-launch gates (MUST clear before the FIRST real guest)
- **Fork the database — dev vs production.** Local dev and prod currently share ONE Supabase DB, and `npm run db:seed` is a full wipe that's run constantly during dev. Harmless only because prod has no real guests yet; the first real guest + one routine reseed = their data gone. Before launch: stand up a separate dev DB, point local `.env` at it, leave prod's connection string ONLY in Vercel; prod gets `migrate deploy` at deploy time, never `seed`. (See memory: shared-db-risk.)

## The three things the experience must nail (equal priority, one connected flow)
1. Itinerary view — their trip in one place
2. Service catalog + low-friction request flow
3. Running tab — "you never pull out your wallet" feel

## Out of scope (do NOT build yet — flag if tempted)
- PM-**facing** dashboard (internal operator console `/ops` exists as of 2026-06-09)
- Multi-tenancy
- PMS API integration
- Vendor API integration / automated dispatch (deferred until routing data exists — seams only, per the POS principle)
- Outbound SMS infra (Twilio etc. — needed for nudges, but the scoped cadence plan comes first)
- Local events layer ("happening during your stay" — Parker-curated via research agents; tailored to stay dates + itinerary)
- Real payments / Stripe Connect
- Deposit / refund / policy-consent build (deposit hold + new per-service refund fields + the consent tap — direction decided 2026-06-13, Stripe-gated)
- View-only itinerary link for party guests + party-member self-fill forms (e.g. each skier's own sizing) — roadmap (Parker, 2026-06-13)
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
- `npm run db:seed` — wipe + reseed demo data; prints a fresh demo link. Co-brand hot-swap for a pitch: `$env:DEMO_PARTNER_NAME = "Luxury Park City Rentals"; $env:DEMO_PARTNER_ACCENT = "#335577"; npm run db:seed` (default partner is fictional on purpose — never ship a real PM's brand uninvited). Demo/sandbox guests carry Parker's dev phone (+1 910 420 0302, his request 2026-06-12) so Nudge drafts demo live — change in `src/lib/demoStay.ts` if that number rotates.
- `npm run db:migrate` — apply Prisma migrations · `npm run db:studio` — DB browser
- `npm run token` — mint a new demo access token (`scripts/new-demo-token.ts`)
- `npm run ops:link` — print the operator entry link for `/ops` (`scripts/ops-link.ts`)
- `npm run partner:add` — pre-create a partner + print its pitch URL (`/demo?partner=<slug>`): `$env:PARTNER_NAME = "Luxury Park City Rentals"; $env:PARTNER_ACCENT = "#335577"; npm run partner:add`. Reseeding wipes partners — re-run after `db:seed`.

## Deploy
- Hosted on **Vercel** (project `summit-guest-app`), GitHub-connected → **auto-deploys on push to `main`**. Live (token-gated): https://summit-guest-app.vercel.app
- Env vars live in the Vercel dashboard (paste `.env`; don't use `vercel env add` from PowerShell — it appends a stray `\r`). `vercel --prod` from this machine fails (UNKNOWN) — **deploy via git push, not the CLI.**
- Env vars (see `.env.example`): `RESEND_API_KEY` + `OPERATOR_EMAIL` (operator emails; unset → console fallback), `APP_BASE_URL` (email deep links + link scripts), `OPS_KEY` (gates `/ops`), `CONCIERGE_PHONE` (E.164) + `CONCIERGE_EMAIL` (the Concierge Line; phone unset → text/call CTAs quietly absent, email-only; both unset → concierge surfaces absent), `GUEST_EMAIL_FROM` (guest-facing sender; unset → welcome-email toggle absent in ops, sms/copy fallbacks remain; set without `RESEND_API_KEY` → console prints the full email) — set locally in `.env` and in the Vercel dashboard.

## Notes
- This file is living. When you correct me on something that should persist, remind me to add it here.
- Keep this file under ~150 lines — it loads every session.
