-- AlterEnum
ALTER TYPE "PriceUnit" ADD VALUE 'FEE_STRUCTURE';

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "deliveryFeeCents" INTEGER,
ADD COLUMN     "rushFeeCents" INTEGER,
ADD COLUMN     "serviceFeeBps" INTEGER;
