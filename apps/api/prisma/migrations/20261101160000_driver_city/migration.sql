-- Drivers' home city (set when they first go online inside a city, or by an admin).
ALTER TABLE "Driver" ADD COLUMN "cityId" TEXT;

CREATE INDEX "Driver_cityId_idx" ON "Driver"("cityId");

ALTER TABLE "Driver" ADD CONSTRAINT "Driver_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing drivers: the city of their latest trip's pickup (cities at the trips' H3 resolution 8; others are set when
-- the driver next goes online).
UPDATE "Driver" d SET "cityId" = c.id
FROM "City" c
WHERE d."cityId" IS NULL
  AND c."h3Resolution" = 8
  AND (SELECT t."pickupCell" FROM "Trip" t WHERE t."driverId" = d.id AND t."pickupCell" IS NOT NULL ORDER BY t."createdAt" DESC LIMIT 1) = ANY (c."serviceCells");
