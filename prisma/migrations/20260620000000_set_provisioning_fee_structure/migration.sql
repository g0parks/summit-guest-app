-- Flip the existing grocery + bar rows onto the fee-structure path.
-- The prior migration (add_fee_structure_pricing) only added the PriceUnit
-- value + the nullable fee columns; it did NOT change any rows. Prod is never
-- seeded (seed is a full wipe), so without this its grocery/bar rows would stay
-- priceUnit = 'QUOTE' and bypass every bit of WS2 (ProvisioningPriceForm, the
-- fee math, the QUOTED guards). Kept as a SEPARATE migration so the new enum
-- value is committed before it's used here (Postgres won't use a just-added
-- enum value in the same transaction). Fee values mirror PROVISIONING_FEE_DEFAULTS.
UPDATE "Service"
SET "priceUnit" = 'FEE_STRUCTURE',
    "deliveryFeeCents" = 5000,
    "serviceFeeBps" = 2500,
    "rushFeeCents" = 10000
WHERE "slug" IN ('grocery-pre-stock', 'bar-stocking');
