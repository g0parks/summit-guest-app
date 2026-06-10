# Plan #3: Ops itinerary editing + the Concierge Line (MVP)

> Hand-off plan for the dev agent. Written 2026-06-10. Two branches, in order:
> `feat/ops-itinerary-edit` (Phase A), then `feat/concierge-line` (Phase B).
> Both small and independently mergeable. Read `CLAUDE.md` first; constraints apply.

## Context — why this exists

First-round testers hit two gaps immediately:
1. **No way to change the itinerary** — neither the guest (by design: luxury guests
   don't edit forms, they ask their concierge) nor the OPERATOR (`/ops` itinerary is
   read-only — plan #1 scoped editing out). So "move dinner to 8" currently dead-ends:
   there is no UI anywhere that can apply the change.
2. **No support channel** — `/invalid` literally says "reach your Summit concierge"
   with no way to do so.

**Decided architecture (Parker, 2026-06-10) — build to this, don't re-litigate:**
- **The thread is the interface; the app is the receipt.** Support + change requests
  are ONE feature: the guest texts a human concierge line; the operator applies changes
  in `/ops`; the guest app shows canonical state. The signed-token link stays the
  identity/state layer — texting is a channel INTO it, not a replacement.
- **No in-app chat. No guest-facing chatbot.** The human IS the concierge. (AI later,
  as an operator copilot in /ops — explicitly out of scope here.)
- **The number is config, not code.** `CONCIERGE_PHONE` env (E.164). Parker wires the
  real line later; everything else ships now. Unset phone → text/call CTAs quietly
  absent, email fallback only. Nothing may break or look broken without it.

---

## Phase A — Ops itinerary editing (`feat/ops-itinerary-edit`)

### A1. Schema

Migration adding to `ItineraryItem`:
```prisma
changePending Boolean @default(false) // operator-set: guest sees a quiet "Being rearranged" chip
```

### A2. Timezone-correct date parsing (bug-fix rider — do this first)

`src/app/actions/requests.ts` builds `requestedFor` with a naive
`new Date("YYYY-MM-DDTHH:mm")` ON THE SERVER. Vercel runs UTC, so a guest's "6:00 PM"
is stored as 18:00 UTC and renders as ~11–12 AM Mountain on the itinerary and in
operator emails. Live bug.

- New util in `src/lib/dates.ts`: `zonedDateTime(dateStr, timeStr, timeZone): Date` —
  interpret wall-clock date+time in an IANA timezone WITHOUT adding a dependency.
  Standard `Intl.DateTimeFormat` offset trick: construct the UTC guess, read the
  zone's offset at that instant via `formatToParts`/`timeZoneName: "longOffset"`,
  adjust, re-check once (handles DST edges).
- Use it in `requests.ts` (stay's property timezone) — behavior fix, call sites
  otherwise unchanged.
- Use it for all Phase-A ops date inputs (property timezone of the stay being edited).
- Sanity-test both a winter (MST) and summer (MDT) date in the acceptance pass.

### A3. Ops itinerary CRUD

Server actions in `src/app/actions/ops.ts` (all `requireOperator()`, all
`revalidateSurfaces(stayId)` after — the helper already revalidates `/itinerary`):

- `createItineraryItem(formData)` — stayId, title (required), category (select from
  `ItineraryCategory`), date + optional time (parsed via `zonedDateTime` in the
  property TZ; no time → `allDay: true`, noon anchor like existing patterns), optional
  endsAt time, location, description, sortOrder (default 0).
- `updateItineraryItem(formData)` — same fields by item id; plus the
  `changePending` toggle (checkbox).
- `deleteItineraryItem(formData)` — by id, with a JS `confirm()` on the form button
  (pattern: small client component like `ChargeButton.tsx` if needed). Deleting an
  item linked to a `serviceRequest` is ALLOWED but does NOT touch the request —
  request lifecycle stays `setRequestStatus`'s job. Show a "linked to request" hint
  next to such items so the operator knows.

UI on `/ops/stays/[stayId]` (utilitarian, dense, match existing ops styling):
- Itinerary section gains: an "Add item" form (collapsed/at the end), per-item Edit
  (inline expandable form, `datetime-local` or date+time inputs), Delete, and the
  `changePending` toggle. Times entered/displayed are property-local — label them
  with the TZ (e.g. "6:00 PM MT") to avoid operator confusion.

### A4. Guest-side "Being rearranged" chip

On `src/app/(trip)/itinerary/page.tsx`: when `changePending`, render a quiet chip on
the item — copy exactly: `Being rearranged`. Calm, not alarming; visually akin to the
tab's "Pending" pill, not an error state. Clears when the operator unticks it.

---

## Phase B — The Concierge Line (`feat/concierge-line`)

### B1. Config + message composition — `src/lib/concierge.ts` (server-only)

- Reads `CONCIERGE_PHONE` (E.164, e.g. `+14355550100`) and `CONCIERGE_EMAIL` from env.
  Add both to `.env.example` (commented, with the unset-fallback behavior noted) and
  to the CLAUDE.md env list.
- `getConciergeContact(): { phone: string | null; email: string | null }`.
- Message builders (pure functions — these give the operator stay context with ZERO
  inbound integration, since the text arrives from an unknown number):
  - `changeMessage({ guestFirstName, propertyName, itemTitle, whenLabel })` →
    `Hi — it's <name> at <property>. About "<item>" (<when>): `
  - `generalMessage({ guestFirstName, propertyName })` →
    `Hi — it's <name> at <property>. `
  - `invalidLinkMessage()` → `Hi — my trip link isn't working. `
  - Trailing space intentional: the guest types straight after the context.

### B2. Platform-aware contact component — `src/components/concierge/ConciergeLinks.tsx` (client)

Props: `{ phone, email, message, variant }`. Server components pass contact + prebuilt
message down; the component only decides hrefs.

- Platform detection on the client (`navigator.userAgent`): iOS (`iPhone|iPad|iPod`),
  Android, Mac (`Macintosh`), else desktop/unknown.
- `sms:` href syntax differs — get this exactly right:
  - iOS: `sms:<phone>&body=<encodeURIComponent(message)>`
  - Android: `sms:<phone>?body=<...>`
  - Mac: `sms:<phone>&body=<...>` — opens Messages.app via iMessage; body prefill is
    best-effort there, recipient is what matters.
  - Desktop/unknown: NO sms link — render the number as text with a tap-to-copy
    button (clipboard API + brief "Copied" state) and the `mailto:` link
    (`?subject=Your concierge&body=<message>`).
- **Hydration guard:** UA is unknown at SSR. Render a stable shell and resolve the
  platform-specific href after mount (`useEffect` + state), or build the href in the
  click handler. No hydration mismatch warnings allowed.
- `tel:` link rides along where the variant shows it.
- Null phone → text/call CTAs not rendered; email-only. Null both → component renders
  nothing (surfaces must look intentional, not broken).

### B3. Surfaces (guest app — keep the luxury register, one primary action per card)

1. **Home** (`(trip)/page.tsx`): "Your concierge" card after the tab section —
   eyebrow `Your concierge`, line like "Anything at all — dinner moved, powder-day
   plans, a question. Text us and consider it handled." Primary CTA `Text your
   concierge` (sms, `generalMessage`); quiet secondary call + email links.
2. **Itinerary items** (`(trip)/itinerary/page.tsx`): per-item quiet text link
   `Request a change` → sms with `changeMessage` (item title + formatted when in
   property TZ). Sits with the item meta, not a loud button.
3. **Service detail** (`(trip)/services/[slug]/page.tsx`): under the request form, a
   quiet line: "Prefer to ask first? Text your concierge." (sms, `generalMessage`).
4. **Tab** (`(trip)/tab/page.tsx`): under the reassure line: "A question about a
   charge? Text your concierge." (sms, `generalMessage`).
5. **/invalid** (`app/invalid/page.tsx`): replace the dead-end "Reach your Summit
   concierge" copy with live links (sms `invalidLinkMessage` + email). No stay
   context here — generic Summit voice, no brand guessing.

Note: surfaces 1–4 have stay context (server components — pass guest first name,
property name through). The component is the same everywhere; only variant + message
differ. Works identically in `/demo` sandboxes (PMs WILL tap this in pitches — it's
part of the demo).

### B4. CLAUDE.md updates (same PR)

- Env list: `CONCIERGE_PHONE`, `CONCIERGE_EMAIL` (+ unset behavior).
- Architecture section, one line: "Support = the concierge texting line (sms: deep
  links with stay context prefilled); no in-app chat, no guest-facing bot — decided
  2026-06-10."

---

## Acceptance checklist (run before each PR)

**Phase A:**
1. `npm run lint` + `npm run typecheck` + `npm run build` clean.
2. Ops: add an item (date+time) → appears on guest itinerary at the entered
   wall-clock time in property TZ (verify rendered time string matches input).
3. Ops: edit time/title, toggle `changePending` → guest itinerary updates; chip
   shows "Being rearranged"; untoggle → chip gone.
4. Ops: delete an item (incl. one linked to a request — request status unchanged,
   "linked" hint shown beforehand).
5. TZ regression: guest-side service request for "6:00 PM" renders 6:00 PM on
   itinerary + in the operator email when server TZ is UTC (`$env:TZ`-style check or
   assert via `zonedDateTime` unit comparison in a scratch script). Test a January
   date (MST) and a July date (MDT).
6. Existing flows untouched: seed, request, quote, charge round-trip still pass.

**Phase B:**
7. With `CONCIERGE_PHONE` + `CONCIERGE_EMAIL` set: all five surfaces render; sms
   hrefs match the iOS/Android/Mac syntax matrix above (verify by UA-spoofing in
   devtools, all three); desktop shows number + copy + email instead.
8. Prefilled bodies carry guest + property (and item context on itinerary links),
   URL-encoded correctly (spaces, quotes, em-dashes).
9. `CONCIERGE_PHONE` unset → email-only everywhere, nothing looks broken; both unset
   → surfaces absent without layout holes.
10. No hydration warnings in the console on any touched page.
11. Guardrail greps still clean: economics fields ops-only; no "exclusive" /
    "rev-share" / "vendor-funded" in guest copy.
12. `/demo` sandbox shows the concierge surfaces (it's the pitch).

## Explicitly OUT of this plan (do not start)

- Twilio / inbound SMS logging / message threads on the stay (next phase, after the
  real number exists)
- Apple Messages for Business, WhatsApp, per-partner numbers
- In-app chat UI, any guest-facing AI/chatbot, ops AI copilot
- Guest-added personal itinerary items (fast-follow candidate, not now)
- Editing service REQUESTS in ops beyond what exists (lifecycle actions are enough)

## Conventions reminder

Feature branches as named, Conventional Commits, lint before commit, per-file summary
after edits. This document is the approved plan — build as specced; flag (don't
improvise) on any conflict with reality, especially around the TZ fix.
