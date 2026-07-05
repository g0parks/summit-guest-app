# Repo ultrareview — 2026-07-05

Full-repo review: every `src/lib` module, every server action, every route
handler, the Prisma schema, seed config, and the main guest/ops pages and
client components. `npm run typecheck` and `npm run lint` are clean.
Findings are ordered by severity; file references are to the state of
`main` at 35c8d6f.

---

## Security

### S1 · HIGH — `/ops` auth lives only in the layout
`src/app/ops/layout.tsx:21` is the sole `requireOperator()` gate for all five
ops pages (`ops/page.tsx`, `ops/stays/[stayId]`, `ops/stays/new`,
`ops/intakes/[intakeId]`, `ops/book`) — none of the pages check themselves.
Next.js explicitly documents that layouts must not be the only auth check:
layouts don't re-render on soft navigation, and page segments can be fetched
via RSC requests without re-running the parent layout. These pages render
guest PII, card metadata, internal per-line economics, **and fully signed
guest access tokens** (`buildToken` in the nudge links on `ops/page.tsx`) —
a bypass here hands over guest sessions, not just data.

**Fix:** add `await requireOperator()` at the top of each ops page (five
one-line changes), or push the gate into the ops data layer
(`getOpsQueues`, `getOpsStayDetail`, …), which is the defense-in-depth the
actions already have.

### S2 · MEDIUM — charge paths have no guarded transition (double-charge race)
`chargeTabLine` (`src/app/actions/ops.ts:267`) and `settleTab`
(`src/app/actions/payments.ts:94`) read a PENDING line, call
`provider.chargeService()`, then update status. Two concurrent submits both
see PENDING and both charge. Harmless with the mock provider — but this is
exactly the seam Stripe drops into, and it's the one money path *missing*
the guarded-`updateMany` idiom the codebase uses everywhere else
(`saveRequestDetails`, `approveQuote`, `priceProvisioningOrder`).

**Fix:** claim the line first (`updateMany({ where: { id, status:
"PENDING" } })`, bail on count 0), then charge, then finalize `externalRef`.

### S3 · MEDIUM — CONFIRMED-without-tab-line crash window
Three money paths do the guarded status flip and then create the
`TabLineItem` / `ItineraryItem` in separate, untransacted writes:
- `saveRequestDetails` fixed-price path (`requests.ts:376–419`)
- `approveQuote` (`requests.ts:509–545`)
- `priceProvisioningOrder` (`ops.ts:169–204`)

A crash/timeout between the flip and the create leaves a CONFIRMED request
with **no tab line**: the guest sees "confirmed", the To-settle queue never
sees money, revenue silently disappears. `changes.ts` already wraps its
claim-then-create in `prisma.$transaction` — apply the same here.

### S4 · MEDIUM — PER_PERSON charge trusts unclamped guest party size
`saveRequestDetails` parses `partySize` from the form with no bounds
(`requests.ts:233–236`) and feeds it to `computeChargeCents`, which only
clamps the floor (`Math.max(1, partySize)`, `catalog.ts:42`). The wizard UI
caps at 8, but a tampered POST can set `partySize=500` and auto-confirm a
500× per-person charge; it's also internally inconsistent — details are
collected for `clampParty(...)` (max 8) people while the charge uses the raw
number, so party=12 bills 12 with fittings for 8.

**Fix:** validate/clamp server-side (1..MAX_PARTY) before storing and
charging; reject out-of-range instead of silently clamping if preferred.

### S5 · LOW — `requestOpsMagicLink` is unauthenticated and unthrottled
`src/app/actions/opsAuth.ts:19` — anyone who discovers the action can spam
sign-in emails to OPERATOR_EMAIL, burying real notifications and burning the
Resend free-tier quota (100/day) so genuine operator emails fail. Borrow the
in-memory throttle from `api/aerie-lead/route.ts`.

### S6 · LOW — one HMAC secret, prefix-based domain separation
Guest access tokens (raw base64url id), unsubscribe tokens (`unsub:<id>`),
and ops magic links (`ops:<expiry>`) all sign with `SUMMIT_TOKEN_SECRET`
and rely on payload prefixes for separation (`tokens.ts`, `consent.ts:85`,
`opsAuth.ts:29`). Safe today only because base64url can't contain `:` —
it's one refactor away from cross-protocol confusion. Consider a purpose
argument baked into the MAC input (e.g. `HMAC(secret, purpose + "|" + id)`)
with verify helpers that require the purpose.

Related, acceptable-for-now: the ops magic link is replayable for its full
15-minute TTL and mints a 90-day cookie; there's no single-use nonce.

### S7 · INFO
- `Wallet` posts the full (mock) PAN to a server action. Fine for the stub;
  the Stripe swap must move to client-side tokenization (already implied by
  the seam design) — never let a real PAN transit the server.
- `npm audit`: moderate advisory in `postcss` via `next@15.1.x`
  (build-time stringifier XSS; low real-world exposure). Clears with a
  routine Next patch bump.
- `/demo` overwrites the session cookie of a *real* guest who wanders onto
  it (`demo/route.ts:65–71` — the isDemo continue-guard only protects demo
  sessions). The guest must re-open their link. Consider bouncing non-demo
  sessions to `/` instead of minting a sandbox over them.

## Correctness

### C1 · MEDIUM — `setRequestStatus` transition is unguarded (TOCTOU)
`ops.ts:228–261` validates the transition against a **stale read**, then
updates unconditionally. Two operator tabs racing (e.g. Mark completed vs
Cancel from a CONFIRMED read) can both pass the allowlist; the loser
overwrites the winner — a delivered request can end CANCELLED with its
PENDING line voided (an owed bill erased), which `applyChangeCancel`
explicitly refuses to do. Guard the write:
`updateMany({ where: { id, status: request.status } })` and bail on 0.

### C2 · LOW — `decodeURIComponent` can 500 the unsubscribe page
`src/app/unsubscribe/[token]/page.tsx:22` decodes the param without a
try/catch — `/unsubscribe/%zz` throws `URIError` and renders the error page
instead of the calm "This link isn't active" state. `ops-magic/[token]` and
`ops-key/[key]` already wrap their decodes; mirror that.

### C3 · LOW — no length caps on wizard input
`saveRequestDetails` stores `notes` and every `detail_*` value uncapped
(`requests.ts:221, 262–297`), unlike `changes.ts` (2000) and `intake.ts`
(4000). A hostile guest can persist megabytes into `detailsJson` per save.
Cap fields (e.g. 2000) at parse time.

### C4 · LOW — phone numbers stored as typed, never normalized
`optInTexts`, the wizard `coordPhone` gate, and perk claims all store the
raw string. The `sms:` deep links strip formatting at render, so nothing is
broken today, but SMS consent records are bound to unnormalized values and
Track B (Twilio) will need E.164. `concierge.ts` already has the normalize
logic — extract and reuse it at capture time.

### C5 · LOW — operator email shows unit price for PER_PERSON confirms
`notify.ts:317–319` prints `Price: $X (per_person)` while the tab line is
`X × party`. Honest but easy to misread when reconciling; print the computed
charge (party is already fetched).

## Cruft / doctrine notes

- **Alcohol**: correctly deactivated in data (`prisma/seed.ts` sets
  `bar-stocking` + `sommelier-wine-pairing` `isActive: false`;
  `getServiceBySlug` guards direct URLs). But the full bar discovery flow,
  `BAR_STOCKING_SLUG` branches in `requests.ts`, DABS closed-day logic, and
  the sommelier flow all remain live code, and `intakeFlow.ts`'s
  `showWhenDeclined` mechanism has no remaining user. If retention is
  deliberate (counsel-gated revisit), say so in a comment; otherwise prune.
- `(trip)/page.tsx:19` `ATTACH_SOURCES` lists `"grocery-attach"` and
  `"chef-attach"`, which no active flow emits (only `"grocery-upsell"`
  exists). Harmless labels-in-waiting or cruft.
- **CLAUDE.md is stale on its own gate**: "Consent spine — OPEN" under
  Pre-launch gates, but the spine shipped 2026-07-04 (PRs #58/#59: consent
  fields, send-gates, tokened unsubscribe, capture surfaces). Update the
  gate to DONE so the launch line reads true.
- Verified holding: internal economics never cross to guest surfaces
  (`queries.ts` vs `opsQueries.ts` split is clean), rev-share language
  absent from guest/PM copy, every guest email routes through
  `guestEmail.ts` with `canEmail()` + unsubscribe + postal address, catalog
  order and register match doctrine.

## What's notably good

Token model (HMAC-signed, constant-time verify, cookie carries the full
signed token), the guarded-updateMany idiom on guest-facing money
transitions, claim-before-send on touchpoints, consent gates consulted at
every sender, `zonedDateTime` DST handling, demo GC with FK-safe ordering,
and the `?next=` open-redirect validation are all careful, consistent work.
