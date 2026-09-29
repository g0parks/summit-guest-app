# Stripe money path — build plan v2 (2026-07-24, re-scoped 2026-07-27)

> **Status: APPROVED scope, awaiting build.** Written spec-style for a fresh build session.
> v2 re-scope (Parker, 2026-07-27): **no automation moves money in v1.** The cron sweep,
> webhook endpoint, and every auto-charge path are CUT. The app saves cards and computes
> when a line is *due*; a human taps every charge from ops. This is the POS principle
> applied to money: clean seam now (`chargeTabLine`), automation drops in behind it later
> without redesign. Dashboard mechanical work by the operator is acceptable MVP ops.
>
> Context: winter launch plan (vault `Summit/Winter Launch Plan.md`). Stripe payouts →
> Mercury already connected. This is a **launch-line money-path build** (allowed under the
> feature freeze), not feature work.

---

## The payment doctrine, v2 (LOCKED 2026-07-27)

**One sentence:** the guest's card is captured in-app at the first money-committing tap
and kept on file; every charge is an operator tap in ops against that card; vendors are
paid monthly from Mercury after delivery — so no money ever moves without a human, and
Summit is never cash-negative.

1. **Card capture is in-app and automated (the only automated part).** At the guest's
   first money-committing tap, a card gate appears: Stripe **Payment Element** inside our
   page, card number goes browser→Stripe, we store only a reference (PCI SAQ-A; no PAN
   ever touches our server). Saved with off-session usage consent — i.e., durable
   permission to charge later. **Saving a card moves $0** and reserves $0 — it is not an
   auth hold. (Auth holds expire in 7 days; they're the wrong tool for bookings made
   weeks out. The saved card IS the practical "hold": permission + ability. Real holds
   stay reserved in the provider seam for big-ticket, later, if ever.)
2. **Three card gates, one shared UX component** (card on file → one-tap confirm; none →
   inline Payment Element):
   - `approveQuote` (QUOTE services + request-box/customTitle approvals);
   - `completeRequest`'s final confirm for **fixed-price** services — stacks with the
     existing phone engagement gate as ONE calm confirm step ("Confirm with a card — you
     won't be charged until your booking locks");
   - **provisioning (grocery) order submission** — card before Summit shops, so the
     post-shop `priceProvisioningOrder` line always lands on a carded stay.
   Signals, browsing, and finish-later stay ungated. Demo stays get the same gates on MOCK.
3. **Charging is operator-triggered, always.** Tab lines sit PENDING with a computed
   `chargeDueAt` that is **display/sort only — never a trigger.** The ops charge surface
   lists PENDING lines ordered by due date with a "Due" badge; the operator taps
   **Charge** → off-session PaymentIntent → synchronous result → line CHARGED, Stripe
   auto-emails the receipt (`receipt_email`). Morning-coffee rhythm, same as the other
   queues. The guest cannot tell a tapped charge from an automated one (POS principle).
4. **`chargeDueAt` — total function, set non-null at line creation** (so nothing silently
   rots): dated + cutoff → `max(now, requestedFor − cancelCutoffHours)`; dated + null
   cutoff → `requestedFor − 24h` (DEFAULT_LOCK_HOURS); everything else (dateless,
   customTitle approvals, ops-priced provisioning) → `now`. Prepay-style services
   (lift tickets, lessons) are an **ops SOP** — charge them as soon as they're due —
   not a schema flag.
5. **Declines are visible instantly** (the operator is the one tapping): the ops result
   shows the failure, persists `chargeFailedAt`/`chargeAttempts`, offers Retry + a
   prewritten `sms:` draft deep-linking the guest to update their card. Idempotency key
   is `<tabLineItemId>:<chargeAttempts>` so a manual retry after the guest fixes the card
   is a FRESH attempt (Stripe replays a key's stored result — including declines — for
   24h; the attempt counter defeats that), while a double-tap of the same attempt still
   can't double-charge. The existing claim-before-charge `updateMany` guard stays.
6. **Cash flow ("no operating money"):** charge when due → Stripe payout hits Mercury
   ~2 business days → vendors bill monthly, paid by ACH after delivery. Float always
   positive. Stripe's ~2.9% + 30¢ stays buried in the spread (no visible processing fee,
   ever).
7. **Curation fee is baked, never a guest-facing line.** Operator quoting SOP: quote =
   vendor cost + markup + 10% curation fee, one clean number. `pmShareCents =
   round(amount × 0.05)` written at line creation when the stay's property resolves to a
   Partner, else 0 (and 0 on `isDemo`); ops-only. Payout mechanism stays unbuilt
   (quarterly manual statement).
8. **Refunds:** Stripe dashboard, no code. **Demo stays never touch Stripe** — provider
   selection is per-stay (`isDemo` → MOCK); `PAYMENTS_PROVIDER=mock` env remains the
   global kill switch for real stays.

## Amendment 2026-07-27 — the launch menu is fixed-price; QUOTE is not the workhorse

Parker's call, correct: **nothing on the winter launch menu is quote-worthy.** Transport
and ski rental price off confirmed vendor rate sheets (fixed-price); grocery is
FEE_STRUCTURE (disclosed cost-plus, ops-priced post-shop). The QUOTE path stays in code
(chef/heli/request-box customTitle use it) but the **`completeRequest` card gate is the
primary gate**, not `approveQuote`.

**PR 3 change — do NOT flip `airport-transfer-slc` to QUOTE.** The audit's
unkeepable-promise risk (10pm booking for an 8am pickup auto-confirming while the
operator sleeps) is closed structurally instead: **the booking floor is UNIVERSAL
(Parker, 2026-07-27).** Every dated request wizard — every service, no exceptions —
refuses a `requestedFor` inside the service's floor. Inside the floor, the wizard's
action becomes the existing quiet concierge escape hatch (`src/lib/concierge.ts`
sms: CTA): "For anything inside {N} hours, text your concierge and we'll see what we
can do." Last-minute fulfillment may well happen — but as a human conversation, never
as an app promise.

**Amended 2026-07-30 — two columns, two jobs (supersedes "floor = cancelCutoffHours"):**
- **Floor = `Service.leadTimeHours`** (non-null, default 24, already rendered on every
  service page as "N h notice"). The promise the guest reads and the constraint the
  wizard enforces come from the SAME column, so they can never disagree.
- **Lock = `cancelCutoffHours ?? DEFAULT_LOCK_HOURS (24)`** — drives `chargeDueAt` and
  the change windows, exactly as already built in PR 2. No change.
- The two are deliberately independent: a booking made inside its lock but outside its
  floor is simply born locked (due immediately, no free changes) — coherent, no special
  case.

**Cutoff/lead values are DATA, not code — the PR 3 data pass (seed + prod SQL):**
- Transport: `leadTimeHours` 12 → **24** (Snow Country's guarantee is 24h; the service
  page's "notice" line updates itself from the column), `cancelCutoffHours` 24.
- Ski rental (Ski Butlers): lead **24**, cancel 24.
- Grocery: lead **48**, cancel 48, **and DELETE the WS2 rush line** ("Same-day … adds a
  $100 rush") from the grocery confirm/fee copy — rush grocery is off the menu by
  Parker's choice (native fulfillment + day job); inside 48h = the concierge hatch,
  a human conversation, maybe a yes, never an app promise.
Grocery remains **Summit-fulfilled (native vertical)**; the FEE_STRUCTURE flow is
unchanged (order gated on card → operator shops → `priceProvisioningOrder` → due now →
operator taps Charge).

## Explicitly CUT from v1 (deferred, not judgment calls)
- ❌ Cron sweep (`/api/charges/due`) + CRON_SECRET — automation of the same seam, later,
  when winter volume proves the rhythm.
- ❌ Stripe webhook endpoint + STRIPE_WEBHOOK_SECRET — charges are synchronous ops taps;
  the result is in the room. Disputes arrive via Stripe's own account emails.
- ❌ Auto-charge-on-approval for inside-cutoff/prepay lines — they're simply *due now* in
  the ops list.
- ❌ `Service.chargeAtApproval` column — prepay is an ops SOP, not schema.
- ❌ Auth holds / capture flows, folio email (fast-follow; Stripe receipts cover the
  record), Stripe Tax, PM payout mechanism, any PMS integration.

---

## Schema changes (one migration, additive-only)

```prisma
model Stay {
  stripeCustomerId String?   // one Stripe Customer per stay; created lazily at first card setup
}

model TabLineItem {
  chargeDueAt    DateTime?   // when the line becomes chargeable — DISPLAY/SORT ONLY, never a trigger
  chargeFailedAt DateTime?   // last decline; cleared on success — ops badge
  chargeAttempts Int @default(0)  // idempotency-key counter: <lineId>:<attempts>
}
```

No enum changes (`PaymentProviderType.STRIPE`, `TabItemStatus.*` already exist).

## Interface reshape (`src/lib/payments/types.ts`)

`saveCard(raw PAN)` cannot survive Stripe — with Elements the number goes browser→Stripe.
Mock implements the same reshaped interface so demo keeps working:

```ts
export interface PaymentProvider {
  readonly type: ProviderType;
  createCardSetup(input: { stayId: string; customerRef: string | null; email?: string | null })
    : Promise<{ clientSecret: string; customerRef: string }>;
  finalizeCardSetup(input: { setupIntentId: string })
    : Promise<SavedCard>; // brand, last4, expMonth, expYear, externalRef (pm_…)
  chargeService(input: ChargeInput & {
    customerRef: string | null;
    idempotencyKey: string;        // `${tabLineItemId}:${chargeAttempts}`
    receiptEmail?: string | null;  // Stripe auto-receipt
  }): Promise<ChargeResult>;
}
```

## Files (build order)

| File | Change |
|---|---|
| `prisma/schema.prisma` + migration | The four columns above. |
| `src/lib/payments/stripe.ts` | NEW — Stripe provider (`stripe` SDK): Customer create/reuse, SetupIntent, off-session PaymentIntent (`off_session: true, confirm: true`, idempotency key, receipt_email). Maps decline errors to a clean typed failure. |
| `src/lib/payments/types.ts` / `mock.ts` / `index.ts` | Interface reshape; mock reimplements it; `getPaymentProvider(stay)` per-stay selection (`isDemo` → MOCK; env default for real stays). |
| `src/app/actions/payments.ts` | `addPaymentMethod` splits into `beginCardSetup` / `completeCardSetup` (persist PaymentMethod + `stay.stripeCustomerId`). `settleTab` (guest post-stay pay-down) rides the new interface with idempotency keys. |
| `src/components/tab/Wallet.tsx` | Real stays: Payment Element (`@stripe/stripe-js` + `@stripe/react-stripe-js`). Demo stays: existing mock form, demo-labeled. Copy: "Your card is held securely by Stripe — charges post as bookings lock." |
| Card-gate component | NEW shared piece used by the three gates (approveQuote sheet · fixed-price wizard confirm · grocery submit). Card on file → one-tap confirm; none → inline Element. |
| `src/app/actions/requests.ts` | Gates wired into `approveQuote` + `completeRequest`; compute `chargeDueAt` + `pmShareCents`/`netCents` at line creation (tz-aware via changePolicy helpers). |
| Provisioning submit + `ops.ts` (`priceProvisioningOrder`) | Grocery gate; ops-priced lines get `chargeDueAt = now`. |
| Ops charge surface | PENDING lines sorted by `chargeDueAt`, "Due"/"Failed" badges, **Charge** tap → `chargeTabLine` through the provider (claim guard + attempt-counter idempotency), decline → Retry + prewritten guest `sms:` draft. `requireOperator()` per page, unchanged. |
| `docs/technical-overview.md` | Money-path section update at the end. |

## Env vars (`.env` locally; Vercel dashboard for prod — paste, don't `vercel env add`)
- `STRIPE_SECRET_KEY` (test now, live at cutover)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `PAYMENTS_PROVIDER=stripe` (real-stay default; `mock` = instant rollback)

## Build order (3 PRs)
1. **PR 1 — plumbing:** migration + interface reshape + mock reimplement + `stripe.ts` +
   per-stay selection + Wallet Payment Element round-trip. Demo regression-checked.
2. **PR 2 — the gates + ops charging:** three card gates, `chargeDueAt`/`pmShareCents` at
   creation, ops charge surface with due-sort, decline handling, `settleTab` rewire.
3. **PR 3 — cutover pre-flight:** booking-floor guard on fixed-price wizards (see
   2026-07-27 amendment — replaces the old FLAT→QUOTE flip); `cancelCutoffHours` set
   from confirmed vendor terms (data pass, Parker supplies numbers; unconfirmed → null);
   live keys in Vercel; **one real $5 live charge + dashboard refund**; rollback note.

## Test checklist (before PR 3)
- [ ] **Nothing charges without an ops tap** — no code path moves money on its own.
- [ ] Demo stay: mock wallet + gates + settle behave exactly as today, `[DEMO]` intact.
- [ ] Real stay, no card: each of the three gates → Element → PaymentMethod row with
      pm_/cus_ refs; no PAN anywhere in logs/DB.
- [ ] Far-future approve → PENDING with correct tz-aware `chargeDueAt`; ops shows it undue.
- [ ] Ops Charge tap on a due line: charged once (double-tap safe), receipt email sent.
- [ ] Decline (test card 4000…9995): claim released, `chargeFailedAt`/`chargeAttempts` set,
      Retry uses a fresh idempotency key and succeeds after card update (4242…).
- [ ] **Non-decline failure (timeout / plumbing error) does NOT bump `chargeAttempts`** —
      the retry replays the SAME idempotency key, so a charge that succeeded at Stripe
      but lost its response resolves to the original PaymentIntent instead of billing
      the guest a second time. Only a definitive decline advances the counter.
- [ ] Grocery: order gated on card; post-shop priced line appears due-now in ops.
- [ ] `settleTab` still settles post-stay PENDING lines.
- [ ] `npm run lint` + `npm run typecheck` clean.

## Rollback
`PAYMENTS_PROVIDER=mock` in Vercel + redeploy → real stays fall back to the mock provider.
Migration is additive-only nullable columns — safe to leave in place.

---

## Kickoff (fresh build session)

Pre-flight (Parker): dev Supabase awake ✅ · Stripe **test** keys in `.env` ✅ (from
dashboard `/test/apikeys`: `sk_test_…` → `STRIPE_SECRET_KEY`, `pk_test_…` →
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`).

Ground rules:
- This doc (v2) is the spec of record — a prior session planned against v1; **ignore any
  cron/webhook/auto-charge notions, they are cut.** If code contradicts the spec, FLAG it.
- Plan mode first: confirm the PR-1 slice against the actual code, wait for approval.
- Feature branches, conventional commits, lint + typecheck before commits, 3 PRs as above.
- Never point `.env` at prod; `db:seed` only on dev. Demo stays keep working on MOCK at
  every step.
