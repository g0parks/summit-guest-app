-- Pre-arrival cadence touchpoints (operator-triggered, never automated):
-- one recorded send per stay per kind. Purely additive.

-- CreateEnum
CREATE TYPE "TouchKind" AS ENUM ('WELCOME', 'PLAN_AHEAD', 'PRE_ARRIVAL');

-- CreateTable
CREATE TABLE "GuestTouch" (
    "id" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "kind" "TouchKind" NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "sentTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestTouch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuestTouch_stayId_kind_key" ON "GuestTouch"("stayId", "kind");

-- AddForeignKey
ALTER TABLE "GuestTouch" ADD CONSTRAINT "GuestTouch_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "Stay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
