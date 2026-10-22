-- Pricing pass — vendor-rate reconciliation (2026-09-03)
-- Run in the Supabase SQL editor against PRODUCTION (the summit project, not dev).
-- Safe: targeted UPDATEs by slug, no wipe. Wrapped in a transaction.
-- Dev gets the same values from prisma/seed.ts on the next `npm run db:seed`.
--
-- WHY: the seeded prices were placeholders that had never been reconciled
-- against the signed vendor rate sheets. Two were losing money on every
-- booking. Sources of truth:
--   Transport — Snow Country tour-operator 2026 Salt Lake sheet
--               (VENDORS/Snow Country Limo.md, pasted rate images)
--   Ski       — Ski Butlers "2027 Rates - Wholesale FINAL.xlsx",
--               Partnership Notes + "Park City & Canyons Village" tabs
--
-- Doctrine: price AT vendor rack. Summit's margin is the net spread, never a
-- markup a guest could discover by calling the vendor.

BEGIN;

-- 1. Airport transfer: $380 placeholder → $275, the exact Snow Country
--    Meet & Greet SUV rack for SLC <-> Park City (net to us: $229.07).
--    Was overcharging every party of 1-5 by $105 (38% over rack) — the one
--    claim the whole "no guest markup" pitch rests on.
--    Curbside SUV ($229 rack / $209.92 net) is deliberately NOT offered:
--    8.3% spread vs 16.7%, and the worse arrival.
--    Parties of 6+ need the Luxury Van ($399 rack / $332.37 net) — a separate
--    service, shipping in a follow-up PR. Until then they route to the
--    concierge hatch.
--    Round trips now bill two fares in code (catalog.ts transferLegs); before
--    this pass a round trip charged ONE $380 fare against $458.14-$664.74 of
--    vendor cost, i.e. a guaranteed loss on the most common booking shape.
UPDATE "Service" SET "priceAmount" = 27500
WHERE "slug" = 'airport-transfer-slc';

-- 2. Airport transfer lead time: 12h → 24h. Snow Country's portal only books
--    24h out; anything shorter is a phone call to their office. The service
--    page renders "N h notice" off this column, so the promise the guest
--    reads and the floor the wizard enforces now come from the same field.
UPDATE "Service" SET "leadTimeHours" = 24
WHERE "slug" = 'airport-transfer-slc';

-- 3. Ski rental cutoffs: 48h → 24h across lead/move/cancel. Ski Butlers has
--    exactly ONE boundary (Partnership Notes): "If order is canceled within
--    24 Hours of their delivery date the order will be charged 25% of order
--    total. If canceled outside 24 Hours there will be no penalty."
--    Matching all three to 24h means the guest's free-change window and our
--    vendor penalty line are the same line — no window where the guest
--    cancels free and Summit eats 25%, and no incoherent state where cancel
--    is allowed but a move isn't.
UPDATE "Service" SET
  "leadTimeHours"     = 24,
  "moveCutoffHours"   = 24,
  "cancelCutoffHours" = 24
WHERE "slug" = 'ski-rental';

-- Sanity check before COMMIT — expect transfer 27500/24/24/24 and ski
-- (priceAmount unchanged, see the ski note in the PR) 24/24/24.
SELECT "slug", "priceAmount", "priceUnit", "leadTimeHours", "moveCutoffHours", "cancelCutoffHours"
FROM "Service"
WHERE "slug" IN ('airport-transfer-slc', 'ski-rental');

COMMIT;
