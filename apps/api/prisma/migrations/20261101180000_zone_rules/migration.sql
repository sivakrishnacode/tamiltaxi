-- Zone rules: time windows, a date range (temporary "Surge now" zones), surge for some vehicles only, and no-service
-- zones that stop only pickups or only drops.
ALTER TABLE "Zone" ADD COLUMN "days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "startMinute" INTEGER,
ADD COLUMN "endMinute" INTEGER,
ADD COLUMN "startsAt" TIMESTAMP(3),
ADD COLUMN "endsAt" TIMESTAMP(3),
ADD COLUMN "vehicleKinds" "VehicleKind"[] DEFAULT ARRAY[]::"VehicleKind"[],
ADD COLUMN "blockPickups" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "blockDrops" BOOLEAN NOT NULL DEFAULT true;
