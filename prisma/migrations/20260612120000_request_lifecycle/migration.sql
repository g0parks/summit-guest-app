-- Request lifecycle (Product Doctrine 2026-06-12): SIGNALED → READY → QUOTED
-- → CONFIRMED → SCHEDULED → COMPLETED, with EXPIRED for signals the stay
-- departed on. REQUESTED is retired; existing rows map to READY (same
-- semantic: awaiting operator action).

-- CreateEnum
CREATE TYPE "Season" AS ENUM ('WINTER', 'SUMMER', 'ALL_YEAR');

-- CreateEnum
CREATE TYPE "ChangeKind" AS ENUM ('MOVE', 'CANCEL', 'MODIFY');

-- CreateEnum
CREATE TYPE "ChangeStatus" AS ENUM ('OPEN', 'APPLIED', 'DECLINED');

-- AlterEnum
BEGIN;
CREATE TYPE "RequestStatus_new" AS ENUM ('SIGNALED', 'READY', 'QUOTED', 'CONFIRMED', 'SCHEDULED', 'COMPLETED', 'DECLINED', 'CANCELLED', 'EXPIRED');
ALTER TABLE "public"."ServiceRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ServiceRequest" ALTER COLUMN "status" TYPE "RequestStatus_new" USING (CASE WHEN "status"::text = 'REQUESTED' THEN 'READY' ELSE "status"::text END::"RequestStatus_new");
ALTER TYPE "RequestStatus" RENAME TO "RequestStatus_old";
ALTER TYPE "RequestStatus_new" RENAME TO "RequestStatus";
DROP TYPE "public"."RequestStatus_old";
ALTER TABLE "ServiceRequest" ALTER COLUMN "status" SET DEFAULT 'SIGNALED';
COMMIT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "cancelCutoffHours" INTEGER,
ADD COLUMN     "moveCutoffHours" INTEGER,
ADD COLUMN     "season" "Season" NOT NULL DEFAULT 'ALL_YEAR';

-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'catalog',
ALTER COLUMN "status" SET DEFAULT 'SIGNALED';

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "itineraryItemId" TEXT NOT NULL,
    "serviceRequestId" TEXT,
    "kind" "ChangeKind" NOT NULL,
    "requestedDate" TEXT,
    "requestedTime" TEXT,
    "note" TEXT,
    "status" "ChangeStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "Stay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_itineraryItemId_fkey" FOREIGN KEY ("itineraryItemId") REFERENCES "ItineraryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
