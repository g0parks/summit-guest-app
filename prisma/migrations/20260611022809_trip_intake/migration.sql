-- CreateTable
CREATE TABLE "TripIntake" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "tripTiming" TEXT,
    "answersJson" JSONB NOT NULL,
    "note" TEXT,
    "utmJson" JSONB,
    "source" TEXT,
    "stayId" TEXT,
    "guestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripIntake_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TripIntake" ADD CONSTRAINT "TripIntake_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "Stay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripIntake" ADD CONSTRAINT "TripIntake_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
