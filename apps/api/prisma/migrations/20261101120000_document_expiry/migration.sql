-- Driver documents: valid-until date (entered when verifying) and the last expiry reminder sent.
ALTER TABLE "KycDocument" ADD COLUMN "expiresOn" DATE,
ADD COLUMN "expiryNotifiedDays" INTEGER;

-- CreateIndex
CREATE INDEX "KycDocument_status_expiresOn_idx" ON "KycDocument"("status", "expiresOn");
