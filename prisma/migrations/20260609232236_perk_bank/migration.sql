-- CreateEnum
CREATE TYPE "PerkClaimStatus" AS ENUM ('CLAIMED', 'FULFILLED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Perk" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendorName" TEXT,
    "shortDesc" TEXT NOT NULL,
    "longDesc" TEXT,
    "valueLabel" TEXT,
    "heroImage" TEXT,
    "costCents" INTEGER,
    "partnerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Perk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerkClaim" (
    "id" TEXT NOT NULL,
    "perkId" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "status" "PerkClaimStatus" NOT NULL DEFAULT 'CLAIMED',
    "operatorNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerkClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Perk_slug_key" ON "Perk"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PerkClaim_stayId_perkId_key" ON "PerkClaim"("stayId", "perkId");

-- AddForeignKey
ALTER TABLE "Perk" ADD CONSTRAINT "Perk_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerkClaim" ADD CONSTRAINT "PerkClaim_perkId_fkey" FOREIGN KEY ("perkId") REFERENCES "Perk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerkClaim" ADD CONSTRAINT "PerkClaim_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "Stay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
