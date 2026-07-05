-- Hand-authored 2026-07-04 (dev Supabase project was paused; SQL follows
-- prisma migrate dev's generated style exactly). Applies via migrate deploy
-- on the next build, or migrate dev once the dev DB wakes.

-- AlterEnum
ALTER TYPE "TouchKind" ADD VALUE 'RESUME';

-- AlterTable
ALTER TABLE "Guest" ADD COLUMN "emailOptOutAt" TIMESTAMP(3),
ADD COLUMN "smsConsentAt" TIMESTAMP(3),
ADD COLUMN "smsConsentSource" TEXT,
ADD COLUMN "smsConsentVersion" TEXT,
ADD COLUMN "smsOptOutAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TripIntake" ADD COLUMN "smsConsent" BOOLEAN NOT NULL DEFAULT false;
