-- Admin levels: OWNER (everything; existing admins) or SUPPORT, and the cities a support admin sets up.
CREATE TYPE "AdminLevel" AS ENUM ('OWNER', 'SUPPORT');

ALTER TABLE "User" ADD COLUMN "adminLevel" "AdminLevel" NOT NULL DEFAULT 'OWNER',
ADD COLUMN "adminCityIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
