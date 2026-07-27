-- AlterTable
ALTER TABLE "Stay" ADD COLUMN     "stripeCustomerId" TEXT;

-- AlterTable
ALTER TABLE "TabLineItem" ADD COLUMN     "chargeAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "chargeDueAt" TIMESTAMP(3),
ADD COLUMN     "chargeFailedAt" TIMESTAMP(3);
