-- Busy-zone nudges: push the city's offline drivers when riders in the zone go unserved.
ALTER TABLE "Zone" ADD COLUMN "nudgeDrivers" BOOLEAN NOT NULL DEFAULT false;
