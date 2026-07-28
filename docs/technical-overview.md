# Summit Guest App — Technical Overview

*The engineering narrative: what's built, how it works, and the techniques that make a
two-person concierge operation feel like a platform. Written for a technical reader —
a partner's engineer, a future teammate, a diligence pass.*

*Internal document. The economics section is ops-internal; per doctrine, revenue-model
language never appears in guest- or PM-facing material.*

---

## 1 · The product, in one paragraph

Summit is a concierge layer for luxury vacation rentals in Park City. A guest of a partner
property manager receives a personal link before arrival; tapping it opens *their* trip —
itinerary, a curated seasonal service catalog, guided request flows, and a single running
tab. No app store, no account, no checkout. Behind the curtain, a human operator fulfills
every request from a purpose-built console — and every place automation will eventually
live is already a clean interface with the manual path behind it. The system's design bet:
**the guest can't tell waiter-memory from a POS**, so ship the experience first and
graduate the backend behind stable seams.

## 2 · Architecture at a glance

One Next.js 15 (App Router) application serves everything: the guest experience, the
operator console, the public intake, the demo sandbox, and the marketing flyer. Server
components render against Postgres (Supabase) through Prisma; mutations are React server
actions; the few genuinely public endpoints are route handlers.

```
                      ┌─ Vercel (auto-deploy on push; prisma migrate deploy in the build)
                      │
  Guest phone ──────► │  /t/<token> ── verify HMAC ──► session cookie ──► (trip) group
  PM prospect ──────► │  /demo ── mints an isolated sandbox stay, co-branded
  Cold lead ────────► │  /plan ── guided intake, no session needed
  Operator ─────────► │  /ops ── keyed/magic-link console: queues · stays · the book
                      │
                      └─ Postgres (Supabase) ── Prisma 6 (pooled runtime + direct migrations)
```

- **TypeScript strict, no `any`, ESLint clean** — enforced before every commit.
- **No auth library, no Redis, no UI framework, no job scheduler.** Each absence is a
  decision (§12), not a gap.
- **Zero-config degradation:** every external integration (Resend email, concierge SMS
  line, guest email sender) falls back to a console print or a quietly absent UI when its
  env var is unset. A fresh clone runs the full product loop with just a database.

## 3 · Identity without accounts: the signed-token model

The defining constraint: a luxury guest will not create an account for a four-day stay.
So the link *is* the identity.

- A token is `"<id>.<sig>"` — a 128-bit random id plus
  `HMAC-SHA256(SUMMIT_TOKEN_SECRET, id)`, base64url. The database stores **only the id**;
  the secret and signature never touch a row (`src/lib/tokens.ts`).
- Every request re-verifies the HMAC (constant-time compare) before the id resolves —
  server-side — to a Stay with its guest, property, and partner. Editing a cookie or URL
  to point at another stay breaks the signature; there is nothing to enumerate and nothing
  to brute-force.
- The entry route (`/t/<token>`) sets an `httpOnly`/`secure`/`sameSite=lax` cookie holding
  the *full signed token* (never a bare id) and redirects to a clean path — tokens never
  linger in the address bar. Deep links use a `?next=` that is validated relative-only, so
  a tampered link can't bounce a guest off-site.
- Tokens carry expiry (30 days past departure — the link is a real ending), revocation,
  and last-access stamps. UTM parameters ride alongside for attribution only; they are
  never the access key.
- **Domain separation:** unsubscribe tokens (`unsub:<guestId>`) and operator magic links
  (`ops:<expiry>`) reuse the same HMAC with purpose prefixes; access-token resolution
  rejects any prefixed payload, so a token minted for one purpose can never be replayed as
  another. New purposes must take a prefix — the convention is documented at the
  primitive.

The same pattern gates the operator console: one long secret (`OPS_KEY`) in an httpOnly
cookie, entered via a keyed link or a 15-minute, HMAC-signed **email magic link** — no
password database anywhere in the system. Every `/ops` page *and* every server action
checks the gate independently (App Router layouts are not a safe sole auth boundary).

## 4 · The request lifecycle: a demand broker in nine states

Every guest desire becomes a `ServiceRequest` moving through an explicit state machine:

```
SIGNALED → READY → QUOTED → CONFIRMED → SCHEDULED → COMPLETED
                (+ DECLINED · CANCELLED · EXPIRED)
```

- **One tap creates demand.** "Arrange this" writes a SIGNALED row immediately — intent is
  captured before a single detail is asked. The guided wizard (one question per screen,
  graceful "finish later" on every screen) advances it.
- **Three pricing modes, never conflated** (`priceUnit` is the discriminator):
  1. **Fixed-price** — completion auto-confirms: tab line + itinerary entry, no waiting.
  2. **QUOTE** — parks at READY for the operator; pricing moves it to QUOTED; only the
     guest's in-app **approval tap** creates the tab line. Nothing ever lands on the tab
     without the guest's explicit yes — and that tap now carries the card gate (Stripe
     off-session consent), so nothing lands uncarded either.
  3. **FEE_STRUCTURE** (provisioning — grocery) — the cost isn't knowable until a human
     shops the order, so the guest consents to a *disclosed fee schedule* (cost +
     delivery + service % + derived rush) at completion; the operator prices the shopped
     order afterward with no second approval. Rush is **derived, never asked** — phase +
     same-day cutoff + supplier closed-days, stamped on the order so pricing reflects
     order-time state.
- **Unconverted demand is still data.** Signals open at departure sweep to EXPIRED (lazy,
  on dashboard load) — kept, never deleted. The record of what guests *wanted* feeds
  vendor negotiation and next-stay personalization.
- **Config-driven execution schemas** (`src/lib/serviceForm.ts`): per-service wizard
  steps, per-person repeaters (ski fittings), conditional steps (`showIf`), and cross-sell
  attaches (grocery "cooking in" → offers a chef night, spawning a sibling SIGNALED
  request). The *same* predicate config drives the client wizard, the server's detail
  collection, and completeness validation — one source of truth, so a hidden step is
  never required of a guest who never saw it.
- **Structured changes, not chat.** Move/Cancel/Modify are one-tap flows gated by
  per-service cutoff windows, enforced on the page *and* re-enforced in the action; past
  cutoff, the quiet human escape hatch takes over — by doctrine.

## 5 · Money: integer cents and paranoid transitions

- All money is **integer cents + currency code**; one formatter renders everywhere.
- The tab is a ledger (`TabLineItem`: PENDING → CHARGED, VOID for cancellations before
  charge, REFUNDED reserved), never a mutable balance.
- **The guarded-claim idiom** is used at every money transition: a conditional
  `updateMany({ where: { id, status: <expected> } })` where exactly one racing writer
  wins and losers see count 0. Double-taps on a passwordless link, two operator tabs, a
  retried server action — none can double-bill:
  - request completion, quote approval, and provisioning pricing each claim the status
    flip **inside a transaction with their tab-line and itinerary writes**, so a crash
    can't strand a confirmed request with no bill;
  - charging (single line or settle-all) **claims the line before calling the payment
    provider** and releases the claim on provider failure — the provider is never called
    twice for one line;
  - operator lifecycle moves are guarded against the status they validated, so racing
    taps can't cancel a delivered service and void an owed bill.
- **Payments are real, and nothing automated moves money.** Cards are captured in-app
  through Stripe's Payment Element (browser → Stripe; no PAN ever reaches the server, PCI
  SAQ-A) and every charge is an **operator tap** in `/ops` — no cron, no webhook, no
  auto-charge. `TabLineItem.chargeDueAt` is display/sort only: it orders the charge queue
  and triggers nothing. Four properties hold the money path together:
  - **Resolution is per stay, with three answers** (`resolvePayments`): demo sandboxes are
    always MOCK; a real stay is STRIPE only when configured with both keys; otherwise
    payments are *unavailable* and the app **fails closed** — the guest gets the concierge
    hand-off with their answers kept, `/ops` shows a banner, and nothing confirms uncarded.
    There is deliberately no mock fallback for real stays: storing a card that can never be
    charged is worse than visibly not taking one.
  - **A card is asked for at the money-committing tap** (`CardGate`): the fixed-price
    wizard confirm, a provisioning order, and the quote approval. Signals, "finish later",
    and browsing stay ungated.
  - **Idempotency keys are `<lineId>:<attempts>`, and the counter advances only on a
    definitive decline.** Any ambiguous failure (timeout, lost response) keeps the key so a
    retry replays Stripe's stored result instead of billing twice; a key conflict surfaces
    as its own instruction rather than a stuck line.
  - **A card is only used by the provider that saved it** (`resolveCardOnFile`): a
    pre-Stripe MOCK row is never handed to Stripe, it's reported as "the guest needs to
    re-add their card". Refunds are done in the Stripe dashboard; line metadata makes them
    findable. `PAYMENTS_PROVIDER=mock` is the kill switch. Auth holds remain a seam.
- **Per-line internal economics** (vendor cost / share / net) are captured ops-side on a
  separate query layer (`opsQueries`/`opsBook`, `server-only`) that guest queries
  physically cannot reach — the split between `queries.ts` (guest) and `opsQueries.ts`
  (internal) makes "never render internal numbers to a guest" a structural property, not
  a code-review hope.

## 6 · Time, done correctly

Everything renders in the **property's timezone**, never the server's (Vercel runs UTC):

- `zonedDateTime()` converts a wall-clock date+time in an IANA zone to a UTC instant with
  a dependency-free double-check across DST transitions — no date library in the bundle.
- Stay phase (pre-arrival / in-stay / post-stay) is **derived from dates** at read time,
  day-granular in property time, never stored — so it can't go stale. Phase drives the
  home screen, request gating, seasonal catalogs (Nov–Apr winter menu, May–Oct summer),
  intake question sets, and the rush derivation.
- The demo seeder pins itinerary moments to Mountain-Time wall-clock hours regardless of
  where the code runs, so a sandbox minted at 3 a.m. UTC still shows dinner at 6:30 p.m.

## 7 · Consent and compliance as engineering

The consent spine (`src/lib/consent.ts`) is the one place channel permission is written
and interpreted:

- **Email is opt-out** (CAN-SPAM: relational stay email may open the relationship):
  every guest email carries a working unsubscribe link, the postal address, and RFC 8058
  `List-Unsubscribe-Post` headers so Gmail/Yahoo's native one-click works. The one-click
  endpoint is **POST-only**; the tokened unsubscribe *page* never mutates on GET — so
  corporate link-prefetch scanners can't opt guests out by scanning an inbox.
- **SMS is opt-in only** (TCPA): no consent record → no text, no exceptions. Each opt-in
  records its **source** (perk claim, /plan, app-home prompt, wizard engagement gate) and
  the **version of the disclosure copy shown** — provable consent, not a boolean. A STOP
  beats older consent; fresh express consent re-opens the channel. Phones normalize to
  E.164 at the consent moment so the record binds to a stable value.
- Every sender consults `canEmail()`/`canSms()` before composing. The unsubscribe token is
  HMAC-signed with no DB row and no expiry — an unsubscribe link in a years-old email must
  keep working.
- Behavioral honesty extends to analytics: the "guest opened their link" signal for
  re-engagement runs on a **human-only act** (the welcome threshold tap), not raw link
  opens, precisely because scanners open links.

## 8 · The ops console: one human, six queues

`/ops` is built around the operator's glance: **six queues, one action each** — new
signals (watch), awaiting-guest (nudge), ready-to-route (price), scheduled (deliver),
changes (apply/decline), to-settle (charge). Supporting panels: perk claims, live stays
with engagement stamps, sales leads, /plan intakes with one-tap conversion.

- **The touchpoint cadence is computed, the send is human.** A signal-aware engine
  (`src/lib/touchpoints.ts`) derives what's due (welcome · plan-ahead · pre-arrival ·
  a behavior-gated resume nudge) from the stay's own dates and the guest's actual
  activity — and *suppresses* touches whose job is already done, showing the operator
  why. Sends claim a unique `(stay, kind)` row **before** the email goes out, so two
  operator tabs can't double-send; content is generated from live signals ("X is set,
  Y still waits on you").
- **Nudges are drafts, not blasts:** an operator-tapped `sms:` deep link, pre-composed
  with a tokened deep link back into the exact request — the human presses send from
  their own phone. (Programmatic SMS is a planned provider drop-in behind the
  `NotificationProvider` seam; inbound STOP handling and quiet hours are specified there.)
- **The Broker's Book** turns operational data into three legible views: forward demand
  (what a vendor is shown), unconverted demand (what guests wanted), and a per-partner
  value story with a copy-ready recap in which internal numbers are structurally absent.

## 9 · Co-branding: hot-swappable, one resolution point

The experience renders as "**[PM] Concierge**, powered by Summit" — partner brand primary,
Summit quiet. All of it flows from one function (`resolveBrand()` in `src/lib/branding.ts`)
and three CSS custom properties: a partner row carries name, optional logo, and one accent
hex; the layout derives pressed/tint shades and overrides the same variables the global
stylesheet defines. No partner → zero inline style → pixel-identical Summit default.
Partner rows are created privately (`npm run partner:add`) — co-branding is never
URL-injectable free text. The same tokens theme guest emails.

## 10 · The demo machine

`/demo` is the sales motion as infrastructure: every visitor gets their **own pristine
sandbox** — property, guest, stay, itinerary anchored to *now*, card on file, settled
starter lines — minted through the same signed-token model as production (flagged
`isDemo`, tagged loudly in operator notifications, excluded from the Book). A
`?partner=<slug>` pitch URL renders that PM's co-brand. Sandboxes garbage-collect lazily
after 30 days (FK-safe cascade, capped population); a real guest who wanders onto the
pitch URL is bounced to their own trip, never clobbered. The demo's lead-capture stores
prospects *outside* the sandbox so GC can't eat a warm lead.

## 11 · Security posture (summary)

- Unguessable signed tokens; constant-time comparisons; server-side resolution; cookie
  never holds a bare id; token-family domain separation enforced at resolve time.
- `/ops` gated per-page **and** per-action; failures bounce to the guest invalid page
  without advertising the console exists.
- Guest surfaces send `noindex`; the token never persists in the URL; open-redirect
  (`?next=`) validated relative-only.
- Public endpoints are throttled (lead form, magic-link sender) with honeypot screening
  on the marketing form; guest input is length-capped server-side; party size is clamped
  server-side to what the wizard renders so a crafted POST can't inflate a charge.
- All emails HTML-escape interpolated content; money paths are claim-guarded and
  transactional (§5).
- Secrets live only in env (Vercel dashboard / local `.env`); prod and dev are separate
  Supabase projects; `db:seed` (a full wipe) can only ever reach dev.

## 12 · Deliberate non-choices

| Not used | Why |
|---|---|
| Auth library / passwords | The token *is* identity; an account is friction the guest won't accept. Two secrets and an HMAC replace an auth stack. |
| Redis / distributed rate limiting | Per-instance in-memory throttles are proportionate for a marketing form and a single-operator login door. |
| Job scheduler / cron workers | Sweeps (expired signals, demo GC) run lazily on the pages that need their results; the one true cron is a Vercel keep-alive ping. Cadence sends are operator-triggered **by doctrine**, not by missing infra. |
| UI framework / component library | The product's register is bespoke luxury calm; design tokens + CSS Modules keep the bundle small and the look ownable. |
| Vendor API integrations | Deferred until routing data exists (POS principle): every ops action is already the seam ("route this order"); wiring comes when the demand graph says which vendors earn it. |
| Microservices / separate ops app | One deployable, two query layers with a hard guest/internal split. The isolation that matters (data exposure) is structural; the isolation that doesn't (process boundaries) is omitted. |

## 13 · Developer experience

- `npm run db:seed` wipes and rebuilds a furnished world, printing a working guest link;
  `npm run token`, `ops:link`, `partner:add` mint every credential a demo needs.
- Fallback ladders make local dev zero-config: unset email keys print full emails to the
  console; unset concierge numbers remove their CTAs cleanly.
- Migrations deploy in the **production** Vercel build only (`scripts/migrate-if-prod.mjs`
  gates on `VERCEL_ENV`) — schema and code ship atomically on push to `main`, and a branch
  push can't migrate the production database from a preview build.
- Strict TypeScript + ESLint gate every commit; docs are part of the codebase
  (`CLAUDE.md` doctrine, `docs/plans/` as-built records, `docs/reviews/` audit trail).

## 14 · What's next (already seamed)

Automating the charge tap (the `chargeTabLine` seam is ready; a sweep drops in behind it
once winter volume proves the rhythm), the bundled folio email, auth holds for big-ticket
reservations, programmatic SMS with STOP handling behind `NotificationProvider`
(A2P 10DLC registration is the long pole), a PMS feed calling the same
`createStayWithToken` core the ops form uses, deposit/refund windows (per-service fields +
hold/capture), and chef-designed execution schemas replacing the demo-level wizard config.
Each lands behind an interface that already exists — the call sites don't move.
