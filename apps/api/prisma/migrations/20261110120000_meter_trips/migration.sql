-- Meter trips (10 Nov 2026): trips drivers measure with the app's meter for passengers picked up off the app.
-- CreateTable
CREATE TABLE "MeterTrip" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "vehicleKind" "VehicleKind" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "fare" INTEGER NOT NULL,
    "night" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "startLat" DOUBLE PRECISION NOT NULL,
    "startLng" DOUBLE PRECISION NOT NULL,
    "startName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeterTrip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeterTrip_driverId_endedAt_idx" ON "MeterTrip"("driverId", "endedAt");

-- CreateIndex
CREATE INDEX "MeterTrip_endedAt_idx" ON "MeterTrip"("endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MeterTrip_driverId_clientId_key" ON "MeterTrip"("driverId", "clientId");

-- AddForeignKey
ALTER TABLE "MeterTrip" ADD CONSTRAINT "MeterTrip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
