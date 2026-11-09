-- WhatsApp welcome messages (9 Nov 2026): one per account and trigger, sent through WATX when its trigger is on.
-- CreateEnum
CREATE TYPE "WelcomeTrigger" AS ENUM ('RIDER_SIGNUP', 'DRIVER_REGISTERED', 'DRIVER_APPROVED');

-- CreateTable
CREATE TABLE "WelcomeMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trigger" "WelcomeTrigger" NOT NULL,
    "template" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WelcomeMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WelcomeMessage_createdAt_idx" ON "WelcomeMessage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WelcomeMessage_userId_trigger_key" ON "WelcomeMessage"("userId", "trigger");

-- AddForeignKey
ALTER TABLE "WelcomeMessage" ADD CONSTRAINT "WelcomeMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
