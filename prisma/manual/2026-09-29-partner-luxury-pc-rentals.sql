-- Partner row: Luxury Park City Rentals (Bo Pitkin) — 2026-09-29
-- Run in the Supabase SQL editor against PRODUCTION.
--
-- WHY: /demo?partner=luxury-park-city-rentals and /plan?partner=... both render
-- the fallback brand on prod because this row only ever existed in DEV
-- (`npm run partner:add` reads local .env, which points at summit-dev).
-- The route code is fine — /plan?partner=alpine-crest-collection co-brands
-- correctly on prod. Same upsert shape as scripts/add-partner.ts.
--
-- accentColor NULL = Summit default accent. Set a hex (e.g. '#335577') if
-- Parker picks one; logoUrl NULL = text wordmark.

BEGIN;

INSERT INTO "Partner" ("id", "slug", "name", "conciergeLabel", "logoUrl", "accentColor", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'luxury-park-city-rentals', 'Luxury Park City Rentals', NULL, NULL, NULL, true, now(), now())
ON CONFLICT ("slug") DO UPDATE
SET "name" = EXCLUDED."name", "isActive" = true, "updatedAt" = now();

SELECT "slug", "name", "accentColor", "isActive" FROM "Partner" ORDER BY "createdAt";

COMMIT;
