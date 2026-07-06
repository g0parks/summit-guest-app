# Adding a service — onboarding checklist

High-touch, operator-run. A new service touches **four** places. The catalog
row alone makes it show up; the rest shapes how it behaves. Terse on purpose.

## 1. The catalog row — `prisma/seed.ts` (model `Service`)

| Field | Notes |
|---|---|
| `slug` | unique; the key everything else joins on |
| `name`, `category`, `shortDesc`, `longDesc?`, `heroImage?` | `category` ∈ `ServiceCategory` — picks the catalog section + itinerary category |
| `priceAmount` (cents) · `priceUnit` · `priceNote?` | `QUOTE` (amount null) = ops prices it, guest approves; `FEE_STRUCTURE` (amount null) = the disclosed cost-plus path (see below); any other unit **with** an amount = fixed-price, auto-confirms on completion |
| `deliveryFeeCents?` · `serviceFeeBps?` · `rushFeeCents?` | `FEE_STRUCTURE` only — the tunable fee schedule; null falls back to `PROVISIONING_FEE_DEFAULTS` |
| `leadTimeHours` | rendered as "N days notice" |
| `season` | `WINTER` / `SUMMER` / `ALL_YEAR` — stay dates pick the menu |
| `moveCutoffHours` · `cancelCutoffHours` | in-app Move/Cancel offered until N hours before start; **null = concierge-only (no in-app option), by doctrine** |
| `requiresDate` · `requiresTime` · `requiresPartySize` | wizard prompts. **Set `requiresPartySize: true` if the execution schema uses a per-person repeater** — or it won't know how many to render. |
| `sortOrder` · `isActive` | order within section / visibility |

**A third pricing path — fee-structure (provisioning).** Some services have
neither a fixed price nor a quotable total: the guest consents to a disclosed
fee *schedule* on the confirm screen (pass-through cost + flat delivery +
service % + derived same-day rush), and a human prices the order after
shopping it. These carry **`priceUnit: FEE_STRUCTURE`** (amount null) — the
discriminator everywhere the behavior diverges — so they complete to **READY**
without auto-billing; the operator action is `ProvisioningPriceForm` (order
cost → computed charge → CONFIRMED), never `QuoteForm`, and there's no QUOTED
re-approval (the schedule consent was the wizard completion). The three fee
knobs are the per-service columns above; cadence/cutoff/closed-day logic and
the charge math live in `src/lib/provisioningPricing.ts`. Rush is **derived**
(phase + 2pm cutoff + supplier closed days), stamped on the order as a
`rush` detail so ops prices against order-time state. Today this is
`grocery-pre-stock` (and the deactivated `bar-stocking`); a new provisioning
service just takes the `FEE_STRUCTURE` unit + fee columns.

## 2. Execution schema — `src/lib/serviceForm.ts` (`FLOWS`, slug-keyed)

Optional. No entry = "scheduling + a notes box." Add steps/fields (incl.
per-rider repeaters) for structured asks. Completeness (`isFlowComplete`) is
what advances `SIGNALED → READY`/auto-confirm — config-driven, not bespoke.

## 3. `/plan` question — `src/lib/intakeFlow.ts`

Optional. Only if it should be a pre-arrival `/plan` question. Add an
`IntakeQuestion` (with `serviceSlug`) into the right season set **and**
`INTAKE_QUESTIONS`.

## 4. Itinerary category — `src/lib/catalog.ts` `serviceToItineraryCategory`

`DINING/TRANSPORT/ACTIVITY/WELLNESS` map through; `HOUSEHOLD/PROVISIONING/OTHER`
land as a generic "NOTE" on the itinerary. Add a case if a new category needs
its own treatment.

## Change rules — decide per service (the point of the cutoff fields)

For each service, answer: can it be **moved** in-app, until how close to start?
Can it be **cancelled** in-app, until how close? ("Something else"/Modify rides
whichever of move/cancel is open — no independent knob today.) Blank cutoffs =
concierge-only — safe, but a deliberate, silent default. In-app change also
requires the booking to be **pre-delivery** (`isChangeableStatus`): delivered or
past-time → quiet escape hatch only.

## Coming (refund model — direction decided 2026-06-13, NOT built)

A refundable **deposit** will hold each booking, with **Summit's refund deadline
set inside the vendor's** (the gap is our buffer, and it pushes guests to
solidify plans early): auto-refund before Summit's deadline,
discretionary/goodwill between Summit's and the vendor's, vendor-locked after.
This needs **new per-service fields that don't exist yet** — deposit amount,
Summit refund deadline, vendor refund deadline, modify fee/deadline — plus the
Stripe hold/capture seam. The policy *shape* (refundable-until · deposit) is
disclosed at the **deposit/accept consent tap** and in the **bundled folio
email**; fee *amounts* stay human-handled, never rendered.
