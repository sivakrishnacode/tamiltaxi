-- Didit removed (4 Nov 2026): identities are checked by hand only (licence, Aadhaar and the profile photo).
-- Drops the Didit sessions, the reference selfies, the photo face-match score and the daily selfie check.
DROP TABLE "IdentityVerification";
DROP TYPE "IdentityPurpose";

ALTER TABLE "Driver" DROP COLUMN "selfieFile",
DROP COLUMN "photoMatchScore",
DROP COLUMN "selfieCheckedAt";

-- No rider identity check (no "Verified" badge): only drivers keep an identity status.
UPDATE "User" SET "identityStatus" = 'NOT_STARTED', "identityVerifiedAt" = NULL WHERE "role" <> 'DRIVER';

-- Settings that no longer exist.
DELETE FROM "AppSetting" WHERE "key" IN ('manualIdentityCheck', 'dailySelfieCheckEnabled');
