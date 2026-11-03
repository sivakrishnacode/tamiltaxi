-- Identity check by hand: a selfie document, and the driver app's version (older apps can't upload the three).
ALTER TYPE "KycDocType" ADD VALUE 'SELFIE';
ALTER TABLE "Driver" ADD COLUMN "appVersion" TEXT;
