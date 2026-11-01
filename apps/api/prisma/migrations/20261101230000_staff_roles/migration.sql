-- Team: staff roles with permissions (admin Team › Roles) and the last sign-in of each account.
CREATE TABLE "StaffRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "isCityScoped" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffRole_name_key" ON "StaffRole"("name");

ALTER TABLE "User" ADD COLUMN "staffRoleId" TEXT,
ADD COLUMN "lastSignInAt" TIMESTAMP(3);

ALTER TABLE "User" ADD CONSTRAINT "User_staffRoleId_fkey" FOREIGN KEY ("staffRoleId") REFERENCES "StaffRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The two levels that existed before roles become roles, so support and city admins keep their access.
INSERT INTO "StaffRole" ("id", "name", "description", "permissions", "isCityScoped", "updatedAt") VALUES
  ('support', 'Support', 'Day-to-day work: trips, drivers and documents, riders, tickets and SOS; sees the rest',
   ARRAY['trips.manage', 'drivers.manage', 'riders.manage', 'support.manage', 'cities.view', 'engage.view', 'finance.view', 'settings.view', 'system.view'], false, CURRENT_TIMESTAMP),
  ('city-admin', 'City admin', 'Support, plus setting up the cities assigned to them',
   ARRAY['trips.manage', 'drivers.manage', 'riders.manage', 'support.manage', 'cities.manage', 'engage.view', 'finance.view', 'settings.view', 'system.view'], true, CURRENT_TIMESTAMP);

UPDATE "User" SET "staffRoleId" = CASE WHEN cardinality("adminCityIds") > 0 THEN 'city-admin' ELSE 'support' END
WHERE "role" = 'ADMIN' AND "adminLevel" = 'SUPPORT';
