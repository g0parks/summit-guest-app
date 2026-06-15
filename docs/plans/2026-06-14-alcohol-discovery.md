# Alcohol as discovery — buildable spec

**Status:** **BUILDABLE — approved 2026-06-15 (Parker, "with prejudice").** Build in a fresh session off `main`, reusing the Phase-2 grocery machinery (`showIf` + `AttachOffer`). Supersedes the "Alcohol = QUOTE / packages" idea in [`2026-06-14-grocery-transport-alcohol.md`](./2026-06-14-grocery-transport-alcohol.md). Compliance is Parker's operational concern, **not a software blocker.** Self-contained — don't assume chat context.

## The reframe — alcohol is desire-evocation, not order-taking
For grocery, the guest has a known need we provision. For experiences (chef, heli), they book a known thing. **Alcohol is different: the luxury is _"I get exactly what I want"_ — and most guests don't know precisely what they want until it's put in front of them.** So the primitive isn't order-taking or tier-picking, it's **discovery / desire-evocation.**

**Rejected, with why:**
- **Packages / tiers** (House / Elevated / Celebration) — picking a tier is the opposite of "I get what I want"; it's a menu, not a concierge.
- **QUOTE-gating** — the quote-wait kills the effortless feel. Out.
- **A blank configurator / "type your list"** — abandons the guest who wants to be led. (Dual-mode still applies — a "just tell us" escape always exists — but the *lead* surface is discovery.)

## The discovery shape — moments, not categories
Don't ask "Wine? Spirits? Beer?" (categories = a form). Evoke **moments of the stay** — each pulls a want into focus; the guest taps the ones that land:
- **The arrival** — a bottle chilling when you walk in (a toast / a special red breathing).
- **How the nights end** — fireside après, a nightcap, **cocktails in the hot tub** (the delight beat they'd never have thought to ask for).
- **Dinner in** — the wine for the table (ties to cook-in / a chef night).
- **A taste of Utah** — High West, a local brewery — the pour they talk about at home.
- **The ones not drinking** — something special for them too (no one left out — milk).

Each "yes, that" composes the order; **a human curates the actual bottles** (centaur-backend, parameters-not-solutions applied to *desire*). No SKU catalog, no recipe/cocktail engine in the critical path.

## Seed from trip context — and never pre-fill
Seed **which moments surface** from what we already know — party size, dates/season, cook-in or chef present, a captured occasion (celebration trip → champagne arrival; cook-in → table wine; big group → the hot-tub cocktail kit). This personalized evocation is the moat (un-reproducible on Instacart/Comestibles). **Resolution: "reads the room" lives in ordering/filtering which moments show — NEVER in pre-filling an order.** Present moments as taps, nothing pre-selected (crook test: offer, never assume). Build conservative; get bolder once real selections show what's safe.

## The build model — two axes: psychology × cadence
The two psychologies and the same-day rush are **two independent axes.** Pulling them apart tells the build exactly when the premium applies:

| | **Pre-arrival / planned** | **In-stay / same-day** |
|---|---|---|
| **Bundled** ("and the bar?" inside grocery) | rides the grocery run · base economics · put away before arrival | — (bundled is a pre-arrival thing) |
| **Standalone** ("the bar") | full discovery · premium *tone* · base economics · planned delivery | full discovery · **+ rush + same-day floor** |

- **Axis A — entry / psychology** (bundled vs standalone): drives *tone + how much discovery.* Bundled = a compressed 1–2-moment attach inside grocery ("and the table wine?"). Standalone "the bar" = the full moments experience, a deliberate premium entrance ("I'm treating us"). Recorded as request `source`: **`grocery-attach`** vs **`bar-direct`** (Broker's Book attribution).
- **Axis B — cadence / horizon** (planned vs same-day): drives *the rush economics.* **Rush is tied to same-day, not to standalone** — a standalone bar order placed pre-arrival is premium in *feel* but carries no rush fee (there was lead time). The rush/floor fire only on the scarce thing: "it's 5pm, we want margaritas by the hot tub *tonight*." Cadence is derived from lead time vs the same-day cutoff.

This slots alcohol into the menu doctrine's **planning-horizon attribute** (pre-arrival vs in-stay-spontaneous) — alcohol is the clearest same-day-spontaneous service.

## Pricing — a disclosed fee structure on the running tab
Not QUOTE (no wait), not fixed-upfront (bottles are human-curated). **The guest approves the fee _structure_, not a fixed total** — and the curated bottles (pass-through cost) + fees land on the **running tab** like every other service. No quote-wait, no surprise (structure disclosed up front), honest *because the discovery guarantees they get what they wanted.* That's the "never pull out your wallet" model doing the work.

- **Configurable defaults (NOT hardcoded — Parker tunes later):** base markup **20%** · same-day rush **+50%** of order · same-day **floor $350 pre-fees** (below it, app says "same-day minimum is $X — add a little, or we'll have it first thing"; graceful).
- **No prices in `/plan`** (interest only). The fee structure shows on the **bar order / confirm surface**, not the discovery taps.
- **Integrity test (this whole line):** the premium is milk, not meat, *only if discovery delivers exactly what they wanted.* Discovery quality is what keeps the premium honest.

## Delivery & fulfillment — Summit owns; grocery is the fallback
**Correction (2026-06-15): alcohol is Summit-owned, like grocery — NOT Sam.**
- **Primary:** Summit owns alcohol fulfillment (manual op, no vendor automation — POS principle, clean seam only).
- **Fallback:** if Summit can't run the alcohol leg, **reroute to grocery fulfillment.** In software this is an **ops routing choice** (the order is routable, with a documented fallback route), not auto-wired.
- **Timing:** pre-arrival alcohol **rides the grocery put-away** (the arrival bottle chilling when they walk in). **Same-day is a separate run** → a configurable **same-day cutoff** + **graceful degrade** ("can't make tonight, but first thing tomorrow" / concierge escape hatch). Never promise a same-day you can't fulfill — that's where the premium would turn from milk to meat.
- **Compliance** (licensed retailer-of-record + DABS courier; facilitation-not-resale, mark up the service/delivery fee not the bottle) sits *under* either route as Parker's operational layer — handled later, never a software blocker.

## Build notes (what to reuse / touch)
- **Reuse Phase-2** `showIf` (moments seeded/gated by trip signals) + `AttachOffer` (grocery → bar; chef → pairings). Dual-mode is the existing pattern (full discovery OR "just tell us").
- **New service `bar-stocking`** (PROVISIONING, `ALL_YEAR`). **NOT QUOTE** — uses the fee-structure-on-tab path (markup + conditional rush, applied to pass-through bottle cost). Confirm this needs a small new pricing path vs. the existing fixed/QUOTE paths.
- **`source`:** `grocery-attach` (bundled) vs `bar-direct` (standalone) — extend the existing `REQUEST_SOURCE_LABEL` ops map.
- **Cadence:** derive same-day from lead time vs the configurable cutoff; rush/floor apply only then.
- **Ops:** surface the discovery selections + the fee structure + the fulfillment route (primary Summit / fallback grocery) on the stay/request views.
- **Pricing + cutoff = config**, not hardcoded.

## Guardrails (bind every part)
- **Milk-not-meat** + the **crook test** (offer, never trap) + **graceful exit always**; dual-mode never forces a lane.
- **No prices in `/plan`**; prices/fee-structure only on the order/confirm surface.
- Co-brand quiet; never surface rev-share / vendor-funded / `costCents` to guest or PM.
- Compliance is operational (Parker's) — don't assert a compliant delivery path in code; build the service fully regardless.
- Strict TS, no `any`; `npm run lint` + `typecheck` before commit; conventional commits; per-file summaries.

## Still tunable (build as config / conservative defaults — not blockers)
- The numbers (floor $350 / rush 50% / markup 20%).
- The same-day cutoff time + exact graceful-degrade copy.
- How aggressive the trip-signal personalization gets before it feels presumptuous.

Related: [`2026-06-14-grocery-transport-alcohol.md`](./2026-06-14-grocery-transport-alcohol.md), `memory/grocery-transport-mvp-shape.md`, `memory/menu-doctrine.md`, `memory/channel-doctrine.md`.
