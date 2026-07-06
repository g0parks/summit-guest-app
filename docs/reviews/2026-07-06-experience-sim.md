# End-to-end experience simulator — 2026-07-06

Every guest-facing moment of Summit, walked as one continuous journey against
**production**. Two panels per stage: what the guest SHOULD see (the care
points, from the doctrine docs) and what they ACTUALLY see (live capture from
the three eval stays, or code-verified where a live tap would pollute real
state). Companion to `2026-07-06-eval-run.md` (scorecard); this is the
journey-order read.

**Verdict up front: 13 of 16 stages hit every care point.** No stage fails;
three carry gaps worth closing (stages 3, 4, 6 — all small). The two
Parker-ordered polish items from this run (welcome copy + tab service dates)
ship in this PR.

---

## 1 · The welcome email (touchpoint #1)

**Should see:** Their PM's name doing the inviting (credit to the host), one
promise scoped to essentials, ONE action (their private link), unsubscribe +
postal footer, no genie language.
**Actually see:** Sent live ×3 (both pre-arrival variants + in-stay). Copy is
the Parker-approved deck; footer + one-click headers on every send; sender
"Your Concierge". ✓

## 2 · Link tap → the threshold

**Should see:** A full-screen brand moment, PM primary / Summit quiet, greeted
by name, the essentials scope, one button. No usage demanded of them.
**Actually see:** "Alpine Crest Collection Concierge, powered by Summit ·
Welcome, Elena. · This is where the essentials of your upcoming Park City stay
are coordinated." Both phase variants correct. ✓ — with Parker's two notes
fixed in this PR: line two softened ("Ready before you think to ask."), CTA
now "Plan your stay" pre-arrival ("Step inside" stays for in-stay, where
planning language would read wrong).

## 3 · Home, pre-arrival

**Should see:** Countdown, the gift first (host's credit), one quiet prompt at
a time, a planning door, concierge line present but never primary — and their
arrangements visible at a glance.
**Actually see:** Countdown ✓, perk gift ✓, one-card-at-a-time confirmed live
(rental car first, text opt-in only after it's answered) ✓, Plan ahead ✓,
concierge quiet ✓.
**GAP (the reassurance gap):** after confirming a $380 transfer, home looks
IDENTICAL to before — no "Your arrival is set · SLC pickup Jul 16." The
itinerary has it, but the surface the guest returns to doesn't acknowledge
progress. An "arranged so far" line under the countdown closes the loop AND
invites the next essential (see conversion notes below).
**Note:** concierge card says "powder-day plans" in July (seasonal copy, also
stage 6).

## 4 · /plan

**Should see:** Presupposing one-tap questions over the L1s, season-keyed, no
prices, typed capstone, contact only at the end (skipped for known guests),
close that promises "by end of day."
**Actually see:** Summer questions live and excellent ("First cast by nine"),
no prices ✓, capstone ✓, World-A contact skip ✓, close copy code-verified. Two
gaps from the eval run stand: **not signal-aware** (asked about a car the guest
had already confirmed) and **bare SUMMIT wordmark** instead of the stay's
co-brand.

## 5 · The catalog

**Should see:** L1 essentials leading, seasonal dishes, Elevated below the
fold, honest prices, zero alcohol, an "ask us" door at the bottom.
**Actually see:** Transport → Provisioning → On the mountain (all summer
dishes) → Wellness → Dining → Household; "Need something else?" closes. ✓

## 6 · Service page → wizard → confirmed

**Should see:** Price + notice + "billed to your tab" BEFORE the tap; "Nothing
is booked or billed yet" under the button; parameters-not-solutions; graceful
exit on every screen; the text gate shown once, disclosure visible, nothing
pre-checked, number typed = consent; fixed-price close says CONFIRMED and
where it landed.
**Actually see:** All present, live. Gate prefilled the known number, consent
recorded (source `request-wizard`), and the very next wizard (grocery)
correctly SKIPPED the gate. Close: "Confirmed. …on your itinerary." ✓
**GAP:** "Ski or snowboard bags" as a July luggage option — wizard configs
aren't season-keyed the way the catalog is.

## 7 · Grocery (provisioning)

**Should see:** Fee structure disclosed BEFORE ordering (cost-plus: $50
delivery · 25% service · rush rule), the build-with-us / send-a-list fork,
close that says nothing needs approving.
**Actually see:** All disclosed pre-order, fork works, "You're all set…
nothing to approve, nothing to pay now." ✓ (The three alcohol strays found
here were fixed in PR #62.)

## 8 · The request box

**Should see:** Anything-goes invitation, the discretion promise, quote-to-
approve ("nothing's booked until you say yes"), EOD follow-up SLA, in-app
close (no contact CTA as primary).
**Actually see:** All present; close = "Consider it in motion… by end of day.
Look for it on your trip page." ✓

## 9 · The itinerary

**Should see:** Confirmed + scheduled things on a day timeline, notes carried,
a change door inside the cutoff.
**Actually see:** Transfer on Jul 16 with notes and "Request a change" ✓.
**Cosmetic:** transfer tagged "In-residence" (location default by category).

## 10 · The change flow

**Should see:** Move / Cancel / Something-else inside cutoff; property-time
hints; cancel that promises the unwinding; past cutoff or delivered → only the
quiet text escape hatch.
**Actually see (in-cutoff, live):** all three paths, "(MDT)" hint, "We'll
handle the unwinding. No calls to make." ✓ Past-cutoff branch code-verified
(`isChangeableStatus` + null-cutoff doctrine, PR #17-era guards).

## 11 · The tab

**Should see:** One total, pending vs settled, card on file once, "never pull
out your wallet" reassurance, a quiet question door — and dates that don't
alarm.
**Actually see:** All present live. ✓ Service-date fix ships in this PR (a
Jul 6 entry date next to a Jul 16 transfer read like a mischarge — Parker
call, "could cause some panic").

## 12 · Perks

**Should see:** Gift register ("with our compliments," never "FREE!"),
claiming never touches the tab, claim asks contact with an UN-prechecked text
opt-in.
**Actually see (page live, form code-verified):** "A gift from Alpine Crest
Collection… Claim whichever suit you… Claiming a perk never touches your tab."
✓ ClaimForm: consent checkbox default-off, needs a number to mean anything.

## 13 · Ops-driven guest moments (quote → approve)

**Should see:** Quote arrives in-app on the trip page; approving is ONE tap
and the only thing that creates the tab line (the future card-consent seam);
nudge SMS is a human-sent draft with a deep link.
**Actually see:** The custom ask sits in ops "Send quote" ready to run
end-to-end (left live for Parker); approve-creates-line verified in the eval
transaction path; nudge drafts render with `?next=` links. ✓ (by construction
+ prior PR verification; not tapped today to leave Parker the full loop)

## 14 · Post-stay

**Should see:** Passive, sentiment-first ("how was it — any friction?"),
re-stay capture guest-initiated only, tab read-only, no push.
**Actually see:** Code-verified (post-stay guards + passive capture, PRs
#12/#23); not live-captured — no departed non-demo stay exists yet, and that's
the correct state of the world. Flag for the first real post-stay: walk it
then.

## 15 · Unsubscribe

**Should see:** GET never mutates (scanner-safe), calm confirm tap, idempotent
"already done," malformed tokens land calm.
**Actually see:** Code-verified + malformed-decode hardening landed in #61;
the RFC 8058 one-click POST route live since #58. Live GET not re-run today
(token lives in the email footer — check one in the inbox sends). ✓

## 16 · The invalid link

**Should see:** Calm, blame-free, a path back (text the concierge for a fresh
link), no login-wall feel.
**Actually see (live):** "This link isn't active. Your personal trip link may
have expired… Text your Summit concierge and we'll send a fresh link." ✓

---

## Improvements surfaced (not built — Parker's queue, roughly in value order)

1. **Close the reassurance gap (stage 3)** — pre-arrival home gets an
   "arranged so far" strip once anything is confirmed. Doubles as the
   strongest conversion surface (see below).
2. **Transfer → grocery attach** — the AttachOffer machinery exists (grocery →
   chef); the transfer wizard, the most-ordered L1, offers nothing. "A stocked
   kitchen when you walk in?" at the transfer close is the Abode-data play
   (58% of guests never left one category; grocery attach was the 4–5x lever).
3. **Season-key the wizard configs** (stage 6) or go season-neutral on the
   three winter-flavored strings.
4. **/plan signal-awareness + co-brand** (stage 4).
5. Itinerary location tag by category (stage 9, cosmetic).

## Conversion read (what's on the table, without pre-optimizing)

The funnel, measured end to end today: email sent → link tap
(`lastAccessedAt`) → threshold cross (`welcomeSeenAt`) → first signal →
completed order (textable guest) → attach → post-stay. Every stage already has
a timestamp — no analytics build needed for the pilot; the Broker's Book reads
it.

Where conversion actually leaks, in order:

- **After the first yes.** The app converts the FIRST order well (gift-first
  home, presupposing /plan, one-tap wizard). What it under-works is the
  SECOND: no acknowledgment-of-progress on home (item 1) and no attach on the
  entry service (item 2). The Abode data says attach is the whole margin
  story.
- **The quiet middle.** Between booking and arrival the cadence exists
  (WELCOME → PLAN_AHEAD → PRE_ARRIVAL, suppression-aware, deep-linked to
  /plan) but is operator-tapped. Fine for the pilot — the discipline of
  tapping it per stay IS the Sam-Rubin-but-quieter play. The lever is using
  it, not building more.
- **Not leaks:** no urgency banners, no discounts, no exit popups, no
  pre-checked anything — by doctrine (milk, not meat). The conversion story
  Summit sells the PM is retention, and retention converts on the second stay,
  which is bought with restraint on the first.
