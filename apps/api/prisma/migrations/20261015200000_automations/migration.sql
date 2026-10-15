-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('SEARCH', 'ROUTINE');

-- CreateEnum
CREATE TYPE "CampaignTarget" AS ENUM ('HOME', 'OUTSTATION', 'RENTAL', 'PARCEL');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('SCHEDULED', 'SENT', 'CANCELLED');

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "place" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "target" "CampaignTarget" NOT NULL DEFAULT 'HOME',
    "sendAt" TIMESTAMP(3) NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'SCHEDULED',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reminder_userId_sentAt_idx" ON "Reminder"("userId", "sentAt");

-- CreateIndex
CREATE INDEX "Reminder_sentAt_idx" ON "Reminder"("sentAt");

-- CreateIndex
CREATE INDEX "Campaign_status_sendAt_idx" ON "Campaign"("status", "sendAt");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

