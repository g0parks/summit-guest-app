# Summit — Guest App

The guest-facing web experience for **Summit Luxury Logistics**, a luxury vacation-rental
concierge in Park City, UT. A guest taps a unique pre-arrival link, lands in *their* trip —
no login — and moves through one connected flow:

**Itinerary → Service catalog → Request → Running tab.**

Summit fulfills everything manually behind the scenes; the guest just gets a calm, premium
experience where they never pull out their wallet. Payments are stubbed but architected so
real Stripe drops in cleanly.

---

## Stack

- **Next.js (App Router)** — UI, server actions, and the token route in one app
- **TypeScript** (strict, no `any`)
- **Prisma 6 → Postgres (Supabase)**
- Mobile-first; bespoke CSS (design tokens + CSS Modules), no UI framework
- Fonts: Newsreader (display) + Hanken Grotesk (body)

## Quick start

1. **Install Node 18+** and dependencies:
   ```bash
   npm install
   ```
2. **Create a Supabase project**, then copy `.env.example` → `.env` and fill in:
   - `DATABASE_URL` — Supabase **transaction pooler** URI (port 6543, `?pgbouncer=true`)
   - `DIRECT_URL` — Supabase **direct** URI (port 5432), used for migrations
   - `SUMMIT_TOKEN_SECRET` — a long random string:
     ```bash
     node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
     ```
   > If your DB password contains URL-reserved characters (`/ * @ : ?`), percent-encode them
   > in the connection strings (e.g. `/` → `%2F`).
3. **Migrate + seed** (seed prints a demo link):
   ```bash
   npm run db:migrate      # applies the schema
   npm run db:seed         # property, catalog, demo guest/stay/itinerary/card/tab
   ```
4. **Run it:**
   ```bash
   npm run dev
   ```
   Open the demo link the seed printed — you'll land in Parker's trip.

## Walking the demo

1. Open the seeded link → cookie set → trip home (`/`).
2. **Itinerary** — the full trip by day; the next moment is highlighted.
3. **Concierge** — browse the catalog, open a service, submit a request.
   - A **fixed-price** service auto-confirms and drops a **pending** line on your tab
     (and, if you picked a date/time, appears on your itinerary).
   - A **quote** service (e.g. Backcountry Heli Day) stays *requested* until priced.
4. **Tab** — see the running total, the card on file, add/replace a card, and **Settle now**
   to charge pending items (stubbed).

`npm run token` mints a fresh link anytime without re-seeding.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Next dev server |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:seed` | Seed + print demo link |
| `npm run db:reset` | Reset DB + re-seed |
| `npm run db:studio` | Prisma Studio |
| `npm run token` | Mint a fresh demo link |
| `npm run lint` / `npm run typecheck` | Lint / strict typecheck |

## Deploy

Hosted on **Vercel** (project `summit-guest-app`), connected to this GitHub repo:
**every push to `main` auto-deploys** (server-side build; `prisma generate` runs via the
`postinstall` script).

- **Live URL:** https://summit-guest-app.vercel.app — token-gated, so the bare URL shows
  `/invalid`; open a `/t/<token>` link to see a trip. `npm run token` mints one that works
  against the live domain.
- **Env vars** live in the Vercel project (Production): `DATABASE_URL`, `DIRECT_URL`,
  `SUMMIT_TOKEN_SECRET`, `APP_BASE_URL`, `PAYMENTS_PROVIDER`. Set them by **pasting `.env` in the
  Vercel dashboard** — do *not* pipe values through `vercel env add` from PowerShell (it appends a
  stray `\r` that corrupts the secret/URLs).
- **Migrations** don't run on Vercel — apply them from your machine: `npx prisma migrate deploy`
  against Supabase.
- **Don't** `vercel --prod` from this Windows machine — CLI deploys land in an UNKNOWN/canceled
  state here. Deploy by pushing to `main`.

## Architecture notes

- **Access = signed, unguessable token.** The link carries `"<id>.<hmac>"`; the DB stores only
  the random `id`. The server re-verifies the HMAC every request, then resolves the **Stay**.
  The session cookie holds that signed token (`httpOnly`, `secure`, `sameSite=lax`) — editing it
  to another stay breaks the signature → `/invalid`. UTM params ride along for attribution only,
  never as the access key. (`src/lib/tokens.ts`, `src/lib/session.ts`)
- **Payments are stubbed behind an interface.** `PaymentProvider.saveCard` → Stripe SetupIntent,
  `chargeService` → off-session PaymentIntent later. `externalRef` is the seam for Stripe ids.
  Swap providers in `src/lib/payments/index.ts` — no call sites change.
- **Fulfillment is manual.** Every request calls `notifyOperator()` (`src/lib/notify.ts`), today
  a structured server log — the drop-in for email/SMS/Slack.
- **Money** is integer cents + currency everywhere (`src/lib/money.ts`).

## Project layout

```
prisma/            schema.prisma · seed.ts · migrations
scripts/           new-demo-token.ts
src/
  app/
    t/[token]/     token entry → cookie → redirect
    invalid/       bad/expired link
    (trip)/        cookie-gated group: trip home · itinerary · services · tab
    actions/       server actions: requests · payments
  components/      nav · services (RequestForm) · tab (Wallet)
  lib/             db · tokens · session · queries · money · dates · notify · catalog · payments/
```

## Not in scope (yet)

PM/admin dashboard, multi-tenancy, PMS integration, real Stripe/money, native app, catalog CMS.
