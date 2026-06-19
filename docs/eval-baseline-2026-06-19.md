# Summit Eval — Baseline (main @ 7127acd · 2026-06-19)

Run of `docs/summit-eval.md` against clean `main` (read from a throwaway git
worktree — the WS2 build was occupying the main working dir at the time). Five
surfaces × eight dimensions, doctrine scorecard, high-spend lens.
**Hold the WS2 build against this.**

## Scorecard

| Surface | Milk/meat | Register | Menu | Channel | Co-brand | Prime-dir | Effort | Crook |
|---|---|---|---|---|---|---|---|---|
| Home (3 phases) | PASS | SOFT | PASS | SOFT | PASS | PASS | SOFT | PASS |
| /plan | PASS | SOFT | PASS | SOFT | PASS | PASS | SOFT | PASS |
| Catalog + wizard | PASS | SOFT | SOFT | PASS | PASS | PASS | SOFT | PASS\* |
| Request box | PASS | SOFT | PASS | PASS | PASS | SOFT | PASS | PASS |
| Tab + change | PASS | PASS | PASS | SOFT | PASS | PASS | SOFT | PASS |

**Totals: 0 FAIL · 13 SOFT · 27 PASS.** \*kit-box default-on is a soft crook flag.

## Headline

**No FAILs — the app is doctrine-sound at the bones.** Every SOFT is either copy
polish or one of the two flows already slated for rework (WS3 bar, WS5 roster).
Nothing here is launch-blocking. The eval *validates the feature-freeze*: the
remaining work is operating + a PM, not rebuilding.

## Cross-surface patterns (where the SOFTs cluster)

1. **Register slips (copy)** — the recurring one, nearly every surface:
   - "Browse the concierge" / "A little planning now means a seamless arrival" (home)
   - `Q_CHEF` "Most guests do at least one dinner in-residence…" reads as social-proof upsell (/plan)
   - "Your request" label + "Send to your concierge" button (request box)
   - "N days notice · billed to your tab" reads booking-SaaS (service detail)
   → the joint copy pass. Low effort, high register impact.
2. **Concierge card too prominent (channel)** — home + /plan + tab surface the
   concierge as a full card / above-the-fold line in multiple places. Doctrine =
   quiet escape, not a recurring CTA. Collapse to one quiet line; reserve the
   full card for post-stay.
3. **Effortlessness open-loops** — "Being arranged" items carry no "by end of
   day" SLA; some status/empty screens dead-end (post-stay, the QUOTED wait);
   the ski/bike repeater + bar 5-screen tap-through are heavy.
4. **Menu doctrine — the two known heavy flows** — bar "moments" = 5
   decline-screens (configurator-ish → WS3); ski/bike repeater = a full fitting
   per rider (→ WS5).
5. **Crook (soft)** — grocery kit-box defaults to "Yes — include it." Earn the
   yes; default to "Choose…".

## Punch list before a PM demo (in-bounds per the freeze)

- **Copy pass** — the register slips above (esp. `Q_CHEF`, "Browse the
  concierge", the request-box button/label, the service-detail lead-time line).
- **Channel** — quiet the concierge card (one line, not a card) on home/plan/tab.
- **Effort** — add the "by end of day" SLA to "Being arranged" items; give the
  post-stay + QUOTED-wait screens a next step.
- Already queued (don't hand-fix now): WS3 bar menu, WS5 roster.

## Genuinely strong (don't touch)

- The first-landing trust line ("you ask, we arrange — one bill, no checkout").
- The tab reassurance copy ("no checkout, no wallet…").
- The fee disclosure — milk-not-meat (shape not total, "nothing to pay now").
- The conditional bar `/plan` question (demand caught precisely when grocery is declined).
- Cross-attach discipline (opt-in, never pre-checked).
- Co-brand quiet + zero economics leaks, everywhere.

## Heads-up for the WS2 comparison

A peek at the WS2-in-progress tree (it was checked out in the main dir) showed
its new fee disclosure rendering a **4-bullet schedule wall right above the
submit button** (delivery $ · service % · rush $ · tab rider) — that risks
*worsening* the catalog/wizard Register + Effort SOFTs. When WS2 lands, re-run
catalog/wizard + tab against this baseline and watch the fee-disclosure density.
