# Plan — The Two Heroes: Transport + Grocery (+ Alcohol) provisioning intake

**Status:** approved 2026-06-14 (advisor session). Build in fresh sessions, branched off `main`. Spec is self-contained — do not assume chat context.

## Why (the doctrine this serves)
- **Two heroes.** Transport + grocery are the universal front doors (Abode reach: grocery 54%, transport 39%) — the only two that carry both PC seasons. They get top billing; the seasonal hero (ski winter / bike summer) is #3; everything else is the warm-attach tail. They are *not* the whale-minters (chef/ski-lessons are) — so the heroes' job is universal adoption + opening the tab, and the attach hooks (chef, bar) ride off them.
- **Grocery is an INTAKE, not a catalog.** Never out-catalog a funded competitor. Store/brand-agnostic front + curated package spine + freeform particulars; a human (centaur-assisted later) fulfills. No SKU API. See `memory/grocery-transport-mvp-shape.md`.
- **The waiter doctrine + parameters-not-solutions** (`memory/menu-doctrine.md`): crafted offerings + mild substitution, never configurators. Ask the parameters; Summit picks the operational answer.
- **The ethical charter** (`vault/Ethical Charter.md`, secular form in `CLAUDE.md`): every line passes **milk-not-meat** (renewable, leaves the guest better off, survives daylight); every nudge/upsell passes the **crook test** (pulls toward the guest's own good, never traps); **graceful exit always**; the **prime directive** (turn already-happening spend into a remembered stay; give the host the credit).
- **Channel doctrine:** the app is the interface; demand moments are structured taps, never composed messages. No prices in `/plan`. Confirmation = "by end of day" expectation.

## Scope

### In (v1)
1. **Catalog + `/plan` reorder** to the two-heroes shape; season-gate the seasonal question.
2. **Grocery provisioning intake** — rebuild `grocery-pre-stock` from package-picker → dual-mode provisioning intake (mode fork · packages · kit box · cook-in fork · particulars).
3. **Alcohol/bar intake** — NEW service, dual-mode, presupposing demand-gen prompts; QUOTE-priced. Built as a **full first-class service** like the others (intake → QUOTE → ops → tab → manual fulfillment). Parker owns alcohol operationally, compliance included — his concern, handled later, and **never a reason to stub or half-build the service** (decided 2026-06-15: "own the alcohol, don't defer").
4. **`Stay.hasRentalCar`** — capture cleanly (stored), surface nothing yet.
5. **Cross-attach hooks:** cook-in → chef; grocery → bar; chef → wine pairings.
6. A reusable **`showIf` conditional-step capability** in `serviceForm.ts` (the forks need it).

### v2 / deferred (design the seam, build nothing)
- Shuttle nudge + menu re-pricing off `hasRentalCar` (distance-activity upsell).
- Substitution-confirm SMS loop (needs outbound SMS infra + a scoped cadence plan).
- Mid-stay restock; fridge photo (ops/manual); the intelligence/auto-plan centaur layer.
- Real Stripe. Vendor-automation wiring for ALL services (alcohol included) — the POS principle keeps fulfillment manual until routing data exists. (Alcohol's licensed-retailer/courier compliance is Parker's operational concern, handled later — not a software deferral.)

## Data model

- **New column:** `Stay.hasRentalCar Boolean?` (+ migration). Captured, not acted on in v1.
- **Reuse `ServiceRequest.detailsJson`** (`[{name,label,value}]`) for ALL grocery/alcohol answers — guided and freeform land in the same shape so ops/fulfillment read one format. No new model.
- **`source`** on the upsell-spawned requests: `"grocery-upsell"` (chef), `"grocery-attach"` / `"chef-attach"` (bar) — so the Broker's Book (`opsBook.ts`) can see where demand originated.
- **Alcohol = QUOTE** (`priceUnit QUOTE`, `priceAmount null`): runs the existing `SIGNALED → READY → QUOTED → CONFIRMED` path (price depends on the bottles + facilitation fee). Grocery stays as it is today re: pricing (QUOTE/concierge-priced).
- No change to the lifecycle enums; everything fits the existing `RequestStatus`.

## New capability — `showIf` (conditional steps/fields) in `src/lib/serviceForm.ts`
The cook-in fork and the dual-mode branch both need "show this step only if a prior answer == X." Add a small, reusable predicate — keep it config-driven (the file's existing ethos):

- Add optional `showIf?: { field: string; equals: string }` to `WizardStep` (and optionally `ServiceField`).
- A step/field is rendered + counted toward completeness **only when its `showIf` matches a prior answer** (by `name`). Steps with no `showIf` always show.
- `isFlowComplete` / `missingSummary` must skip hidden steps (don't require answers the guest never saw).
- Add a new field kind for the dual-mode fork if cleaner than a select: `kind: "mode"` is optional — a plain `select` with `showIf` on downstream steps is sufficient. Prefer reusing `select` to keep the type surface small.

## Flow 1 — Grocery provisioning intake (`grocery-pre-stock`, rewrite)
Register: presupposing, warm, sensory (the `/plan` voice). No prices. Graceful exit every step.

**Step 0 — mode fork** (`select`, name `mode`): *"Shall we build it with you, or would you rather just send a list?"* options `Build it with us` | `I'll send a list`.

**Guided** (`showIf mode == "Build it with us"`):
1. **Packages** (`select`, required): Essentials · Family Table · Après · Local Utah · Tailored. (Contents are placeholders — Sam finalizes; not a build dependency.)
2. **Kit box** (`select` or boolean, default **on**): *"The basics — salt, pepper, oil, foil, coffee filters. On us to think of it."* Toggle off allowed.
3. **Cook-in fork** (`select`, name `cookIn`): *"Cooking in, or just provisions + the basics?"* → `Cooking in` | `Just provisions`.
   - **`showIf cookIn == "Cooking in"`** → freeform `text`: *"What are you thinking of making?"* + a quiet line auto-suggesting the kit + the **chef upsell** (see attach hooks). NO recipe engine.
4. **Particulars** (`textarea`): *"The handful of things that must be there — brands you love, the wine, allergies."*

**Freeform** (`showIf mode == "I'll send a list"`):
- One rich `textarea`: *"Tell us what you need — we'll handle the rest."* + dietary `text` + kit-box default toggle + particulars. Same `detailsJson` shape.

**Completeness:** guided requires `package`; freeform requires the list text. Kit box + cook-in + particulars optional.

## Flow 2 — Alcohol / bar intake (NEW service `bar-stocking`, PROVISIONING, season ALL_YEAR, QUOTE)
Dual-mode, same `showIf` machinery. The guided prompts are **demand generation** (surface wants the guest didn't arrive with), in a register they can't reproduce on a marketplace.

**Step 0 — mode fork** (same pattern).

**Guided:**
1. **The bar** (`checkboxes`, name `categories`): Wine · Spirits · Beer · Non-alc / mixers.
2. **Celebrating?** (`select`): *"A bottle of champagne to mark the first night?"* options `Yes — champagne` | `A special bottle` | `Not this trip`.
3. **A taste of local?** (`select`): *"A local distillery pour — High West, or a local brewery?"* `Local spirits` | `Local beer` | `Surprise us` | `Pass`.
4. **Wine for the table** (`select`, `showIf` chef night present or always): *"Pairings for your dinners?"* — links to chef attach if a chef request exists.
5. **Particulars** (`textarea`): *"Exact bottles, brands, vintages — or leave it to us."* (parameters-not-solutions: light quantities, Summit sizes it.)

**Freeform:** *"Tell us exactly what you'd like."* + particulars.

**Fulfillment = manual, like every service** (the POS principle — no vendor automation is wired anywhere in the app yet; clean seam only). Build the **full service**: intake → QUOTE (operator prices at quote time) → ops → tab → a human fulfills. **Do NOT treat alcohol as a deferred stub — it's first-class.** Compliance is Parker's operational concern; internal context for when he tackles it: Utah is a control state, so facilitation-not-resale (mark up the service fee, not the bottle), and he owns the licensed-retailer/courier structure. The legal gate is operational, never a software blocker.

## Flow 3 — Transport (small)
- `catalog.ts` `CATEGORY_ORDER`: `["TRANSPORT","PROVISIONING","ACTIVITY","WELLNESS","DINING","HOUSEHOLD","OTHER"]` (swap PROVISIONING above ACTIVITY → two heroes at #1/#2, seasonal #3).
- Keep `airport-transfer-slc` intake as-is (direction / flight / luggage).
- **`/plan`** (`intakeFlow.ts` + `src/app/plan/page.tsx`): keep transport→kitchen lead; **season-gate the seasonal question** (ski in winter, bike in summer) via `Service.season` + `staySeason()`. Add a **`hasRentalCar` capture** question; in-app fallback for guests who skipped `/plan`. **No shuttle nudge** (v2).

## Cross-attach hooks (the crook, not a trap — offers with graceful decline)
- **Cook-in → chef:** "Cooking in" surfaces *"Want a chef to take one night?"* → on yes, create a sibling `private-chef-dinner` `SIGNALED` request, `source="grocery-upsell"`.
- **Grocery → bar:** end of grocery, *"Stock the bar too?"* → links to `bar-stocking`.
- **Chef → pairings:** chef night surfaces *"Wine pairings?"* → links to `bar-stocking`, `source="chef-attach"`.

## Rendering — `src/components/requests/RequestWizard.tsx`
- Honor `showIf` (skip hidden steps in render + progress + completeness).
- Kit-box default-on toggle.
- The freeform-mode branch (mode fork → one rich capture).
- The attach prompts as quiet end-of-flow offers, one tap, skippable.
- `src/app/(trip)/requests/[requestId]/page.tsx` is the host — minimal change.
- `src/app/actions/requests.ts`: persist `hasRentalCar`; create attach siblings; handle freeform path; alcohol → QUOTE lifecycle.

## Ops
- Surface the richer grocery/alcohol `detailsJson` (mode, package, kit on/off, cook-in + what-cooking, particulars) in the stay/request ops views.
- Show the attach origin (`source`) so the Book attributes demand.
- Alcohol QUOTE flows through the existing ops quote action.
- `hasRentalCar` shown as a quiet stay attribute (no action yet).

## Seed (`prisma/seed.ts`)
- Ensure grocery (`grocery-pre-stock`), transport (`airport-transfer-slc`), seasonal (ski-rental WINTER / bike-rental SUMMER), and the new `bar-stocking` services exist with correct `category` + `season`.
- Package + kit-box contents = **placeholder copy** (Sam finalizes).
- Confirm `CATEGORY_ORDER` + season gating render correctly across a winter and a summer demo stay.

## Build phases (one PR each, off `main`)
1. **Elevation + schema** (small): `CATEGORY_ORDER` swap; `/plan` season-gate + `hasRentalCar` capture (+ in-app fallback); `Stay.hasRentalCar` migration. Ships the visible two-heroes shape.
2. **`showIf` + grocery intake** (the big one): conditional-step capability; grocery flow rewrite (mode fork → packages → kit box → cook-in fork → particulars); wizard rendering; freeform path; chef-attach sibling.
3. **Alcohol intake + cross-attach + ops + seed**: `bar-stocking` service + dual-mode flow (QUOTE); grocery→bar and chef→pairings attach; ops surfacing; seed placeholders; full copy pass in Parker's register.

## Guardrails (every phase)
- **Milk-not-meat** on every line; **crook test** on every nudge/attach (offer, never trap); **graceful exit** at every step; dual-mode never forces a lane.
- No prices anywhere in `/plan` or the intake (interest capture only).
- Co-brand quiet; never surface rev-share / vendor-funded / `costCents` to guest or PM.
- Strict TS, no `any`. `npm run lint` + `npm run typecheck` before each commit. Conventional commits, feature branch, per-file change summaries.
- Alcohol: a **full first-class service** (intake → QUOTE → ops → tab → manual fulfillment), not a stub. Like every service, no vendor automation is wired (manual fulfillment, clean seam). Compliance is Parker's operational concern — don't assert a compliant delivery path in code, but don't half-build the service either.

## Open (non-blocking) follow-ups
- Package + kit-box contents (Sam).
- Whether alcohol earns its own `/plan` question (v1: catalog + grocery attach only; revisit).
- Which operator executes grocery at launch (Grocery Girls) — business, not build.
