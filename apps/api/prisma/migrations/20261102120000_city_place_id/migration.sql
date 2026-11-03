-- Google place ID of the city, for the admin maps' city boundary (Google boundaries, LOCALITY layer).
ALTER TABLE "City" ADD COLUMN "placeId" TEXT;
