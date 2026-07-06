# Summit — Guest App

The guest-facing web experience for **Summit Luxury Logistics**, a luxury vacation-rental
concierge in Park City, UT. A guest taps a unique pre-arrival link, lands in *their* trip —
no login, no account — and moves through one connected flow:

**Itinerary → Service catalog → Guided request → Running tab.**

Summit fulfills everything manually behind the scenes (by doctrine, behind clean automation
seams); the guest just gets a calm, premium experience where they never pull out their
wallet. Payments are stubbed but architected so real Stripe drops in cleanly.

> **Deeper dive:** [`docs/technical-overview.md`](docs/technical-overview.md) — the full
> technical narrative (token model, request lifecycle, pricing modes, consent spine,
> integrity idioms, seams). [`CLAUDE.md`](CLAUDE.md) holds product doctrine and working
> agreements. [`docs/plans/`](docs/plans/) are the as-built design records.

---

## Stack

- **Next.js 15 (App Router)** — UI, server actions, and route handlers in one app
- **TypeScript** (strict, no `any`)
- **Prisma 6 → Postgres (Supabase)** — pooled runtime connection + direct URL for migrations
- Mobile-first; bespoke CSS (design tokens + CSS Modules), no UI framework
- **Resend** for operator + guest email (console fallback when unset — zero-config dev)
- Hosted on **Vercel**; auto-deploys on push to `main`, migrations apply during the build

## Quick start

1. **Install Node 18+** and dependencies:
   ```bash
   npm install
   ```
2. **Create a Supabase project** (use a dev project — never point local `.env` at prod),
   then copy `.env.example` → `.env` and fill in:
   - `DATABASE_URL` — Supabase **transaction pooler** URI (port 6543, `?pgbouncer=true`)
   - `DIRECT_URL` — Supabase **session/direct** URI (port 5432), used for migrations
   - `SUMMIT_TOKEN_SECRET` — a long random string:
     ```bash
     node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
     ```
   - `OPS_KEY` — a second long random string, gates the `/ops` console
   - Everything else (`RESEND_API_KEY`, `OPERATOR_EMAIL`, `GUEST_EMAIL_FROM`,
     `CONCIERGE_PHONE`/`CONCIERGE_EMAIL`, `APP_BASE_URL`) is optional locally — every
     integration degrades to a console/quietly-absent fallback so nothing looks broken.
   > If your DB password contains URL-reserved characters (`/ * @ : ?`), percent-encode
   > them in the connection strings (e.g. `/` → `%2F`).
3. **Migrate + seed** (seed wipes the DB and prints a fresh demo link):
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
4. **Run it:**
   ```bash
   npm run dev
   ```
   Open the demo link the seed printed — you land in a fully furnished sandbox trip.

## The surfaces

| Surface | Route | What it is |
|---|---|---|
| Guest app | `/` `/itinerary` `/services` `/tab` `/perks` `/ask` | The trip, cookie-gated by the signed token; phase-aware (pre-arrival / in-stay / post-stay) |
| Token entry | `/t/<token>` | Verifies the signed link, sets the session cookie, redirects clean |
| Trip intake | `/plan` | Public guided pre-arrival questionnaire; personalizes when a session exists |
| Demo sandbox | `/demo` (`?partner=<slug>`) | Self-serve pitch: mints a fresh sandbox stay per visitor, co-branded, 30-day GC |
| Ops console | `/ops` | Operator-only: six fulfillment queues, stay detail, touchpoint cadence, the Broker's Book |
| Ops entry | `/ops-login`, `npm run ops:link` | Magic-link email sign-in, or the direct keyed link |
| Marketing | `/aerie` | The static PM-facing flyer with a lead-capture form |

## Walking the demo

1. Open the seeded link → cookie set → trip home (`/`).
2. **Itinerary** — the full trip by day; the next moment is highlighted.
3. **Concierge** — browse the seasonal catalog, tap a service, complete the guided wizard.
   - A **fixed-price** service auto-confirms: pending tab line + itinerary entry.
   - A **quote** service (e.g. Private Chef Dinner) parks with the operator; once priced,
     the guest gets an in-app **Approve** tap — nothing lands on the tab before their yes.
   - A **provisioning** service (grocery) discloses a fee *schedule* up front; the operator
     prices the shopped order afterward, no second approval needed.
4. **Tab** — running total, card on file (mock), **Settle now** to charge pending items.
5. **Ops** — `npm run ops:link`, open the printed URL: the request appears in its queue;
   quote it, watch the guest's approval land, charge the line.

`npm run token` mints a fresh guest link anytime; `/demo` mints a whole fresh sandbox.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Next dev server |
| `npm run build` | `prisma migrate deploy && next build` (same as the Vercel build) |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:seed` | Wipe + seed; prints a fresh demo link |
| `npm run db:reset` | Reset DB + re-seed |
| `npm run db:studio` | Prisma Studio |
| `npm run token` | Mint a fresh demo guest link |
| `npm run ops:link` | Print the operator entry link for `/ops` |
| `npm run partner:add` | Pre-create a partner co-brand + print its pitch URL (`/demo?partner=<slug>`) |
| `npm run lint` / `npm run typecheck` | Lint / strict typecheck (run before committing) |

Co-brand a pitch: `$env:DEMO_PARTNER_NAME = "Luxury Park City Rentals"; $env:DEMO_PARTNER_ACCENT = "#335577"; npm run db:seed`
(partners are wiped by reseed — re-run `partner:add` after).

## Deploy

Hosted on **Vercel** (project `summit-guest-app`), GitHub-connected: **every push to `main`
auto-deploys**, and the build runs `prisma migrate deploy` first — committed migrations
apply to prod on push. Live (token-gated, bare URL shows `/invalid`):
https://summit-guest-app.vercel.app

- **Env vars** live in the Vercel dashboard (paste `.env` there; don't pipe values through
  `vercel env add` from PowerShell — it appends a stray `\r`). Full list + fallback behavior:
  [`.env.example`](.env.example).
- **Deploy via git push, not the CLI** — `vercel --prod` from a Windows machine lands in an
  UNKNOWN state.
- A daily cron (`vercel.json`) pings `/api/health` to keep the free-tier Supabase project
  from pausing on idle.

## Architecture in one breath

Access is a **signed, unguessable per-guest token** (`"<id>.<hmac>"`; DB stores only the
random id; HMAC re-verified on every request) — the token *is* identity, no passwords.
Requests move through an explicit lifecycle (`SIGNALED → READY → QUOTED → CONFIRMED →
SCHEDULED → COMPLETED`) with **three pricing modes** that never conflate: fixed-price
auto-confirms, quotes wait for the guest's in-app approval tap, provisioning consents to a
disclosed fee schedule. Money is integer cents; every money transition is a **guarded
`updateMany` claim inside a transaction** so double-taps and crashes can't double-bill or
strand state. Payments and notifications sit behind provider interfaces (mock today,
Stripe/Twilio drop in without touching call sites). Consent is a first-class spine:
email opt-out (CAN-SPAM), SMS opt-in-only (TCPA), versioned disclosures, RFC 8058
one-click unsubscribe. The whole story: [`docs/technical-overview.md`](docs/technical-overview.md).

## Project layout

```
prisma/              schema.prisma · seed.ts · migrations/ · manual/ (prod SQL)
scripts/             new-demo-token.ts · ops-link.ts · add-partner.ts
public/aerie.html    the static PM-facing marketing flyer
src/
  app/
    t/[token]/       token entry → cookie → redirect
    demo/            self-serve sandbox mint (+ lazy GC)
    plan/            public trip intake
    welcome/         first-visit threshold
    unsubscribe/     tokened email opt-out (+ /api/unsubscribe one-click POST)
    invalid/         bad/expired link
    (trip)/          cookie-gated group: home · itinerary (+change) · services ·
                     requests (wizard/approve) · tab · perks · ask
    ops/             operator console: queues · stay detail · new stay · convert · book
    ops-login/ ops-key/ ops-magic/   operator entry doors
    api/             health (keep-alive cron) · unsubscribe · aerie-lead
    actions/         server actions: requests · changes · payments · perks · intake ·
                     consent · welcome · stay · ops · opsStays · opsAuth · touchpoints · demoLead
  components/        guest (wizard, intake, changes, tab, perks, trip prompts) + ops panels
  lib/               tokens · session · opsSession · consent · phone · stayPhase · dates ·
                     money · catalog · serviceForm · provisioningPricing · changePolicy ·
                     queries · opsQueries · opsBook · opsStay · touchpoints · notifications ·
                     notify · guestEmail · concierge · smsLink · branding · demoStay · payments/
docs/                technical-overview · mvp-launch-line · adding-a-service · plans/ · reviews/
```

## Not in scope (yet)

PM-facing dashboard, multi-tenancy, PMS/vendor API integration, outbound SMS infra,
real Stripe money movement, deposits/refunds, native app, catalog CMS. Flagged in
`CLAUDE.md` — don't build these without reading it first.
