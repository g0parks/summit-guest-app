-- Catalog copy pass + alcohol pull (2026-06-25)
-- Run in the Supabase SQL editor against PRODUCTION (the summit project, not dev).
-- Safe: targeted UPDATEs by slug, no wipe. Wrapped in a transaction.
-- Dev gets the same copy from prisma/seed.ts on the next `npm run db:seed`.

BEGIN;

-- 1. Pull alcohol: Utah law — Summit can't supply alcohol. Deactivate so they
--    drop out of the catalog (the query already filters isActive) and can't be
--    booked by direct URL (getServiceBySlug now guards isActive). Data is kept.
UPDATE "Service" SET "isActive" = false
WHERE "slug" IN ('bar-stocking', 'sommelier-wine-pairing');

-- 2. Service copy (the laundering pass: rewrites + removed em-dash "breaks").
UPDATE "Service" SET
  "shortDesc" = 'Premium skis or boards, fitted at the residence and waiting in the mudroom.',
  "longDesc"  = 'A few details per rider and our technicians fit premium gear and deliver it to the residence before you arrive. Swap skis for a board, or anything that isn''t working, anytime during your stay, no shop visit.'
WHERE "slug" = 'ski-rental';

UPDATE "Service" SET
  "shortDesc" = 'Mountain, road, or e-bikes, sized and delivered to the residence.',
  "longDesc"  = 'Tell us who''s riding and our technicians size the right bikes and have them waiting at the residence, trail maps included, swaps anytime.'
WHERE "slug" = 'bike-rental';

UPDATE "Service" SET
  "shortDesc" = 'A half-day on a blue-ribbon river with a local guide, all gear included.'
WHERE "slug" = 'guided-fly-fishing';

UPDATE "Service" SET
  "shortDesc" = 'A certified guide for the day. First tracks, hidden stashes, no lift lines.'
WHERE "slug" = 'private-ski-guide';

UPDATE "Service" SET
  "shortDesc" = 'Arrive to a stocked kitchen, your list shopped and put away before you walk in.',
  "longDesc"  = 'Pick a stocking style, tell us about the table, and we''ll have the kitchen and pantry put away before you walk in. You pay for the groceries, plus a delivery and service fee.'
WHERE "slug" = 'grocery-pre-stock';

UPDATE "Service" SET
  "shortDesc" = 'A licensed therapist brings the spa to you, table and oils included.'
WHERE "slug" = 'in-residence-massage';

UPDATE "Service" SET
  "longDesc"  = 'One of our private chefs designs a menu around your tastes, sources locally, and handles everything from mise en place to the final plate, and the cleanup. You simply sit down to dinner.'
WHERE "slug" = 'private-chef-dinner';

UPDATE "Service" SET
  "shortDesc" = 'A discreet midday refresh. Beds, towels, tidied and reset.'
WHERE "slug" = 'daily-housekeeping';

-- 3. Perk copy (same pass).
UPDATE "Perk" SET
  "shortDesc" = 'A private sauna hour for your group, cedar heat and a cold plunge, any evening of your stay.',
  "longDesc"  = 'An hour of private sauna for your whole group at Avanto: cedar heat, cold plunge, towels and cold rinse included, any evening during your stay. Claim it and we''ll hold the slot until you pick a night.'
WHERE "slug" = 'private-sauna-hour';

UPDATE "Perk" SET
  "shortDesc" = 'A full day at Park City''s club in Prospector. Lap pools, hot tubs, weight room, classes, steam, and sauna.',
  "longDesc"  = 'A day to yourselves at Silver Mountain Sports Club & Spa, minutes away in Prospector: heated lap pools, indoor and outdoor hot tubs, a 5,000-square-foot weight room, yoga, Pilates, and spin classes, steam rooms and a dry sauna, plus a waterslide and lazy river if the kids are along. Your passes are with our compliments; claim them and we''ll have the front desk expecting you.'
WHERE "slug" = 'silver-mountain-day-pass';

UPDATE "Perk" SET
  "shortDesc" = 'One session at Park City''s performance-recovery lab. Whole-body cryotherapy, red light, or compression, your pick.',
  "longDesc"  = 'Upgrade Labs in Kimball Junction puts professional-grade recovery in one room: three-minute whole-body cryotherapy, the REDcharger red-light bed, PEMF, and lymphatic compression. The fastest way we know to undo a ski day. Your first session is with our compliments; claim it, tell us which one sounds right, and we''ll set the appointment.'
WHERE "slug" = 'upgrade-labs-recovery';

COMMIT;
