-- Reminder messages (9 Nov 2026): admins write several wordings per reminder; each send picks one at random.
-- CreateEnum
CREATE TYPE "ReminderMessageKind" AS ENUM ('SEARCH_LOCAL', 'SEARCH_OUTSTATION', 'ROUTINE');

-- CreateTable
CREATE TABLE "ReminderMessage" (
    "id" TEXT NOT NULL,
    "kind" "ReminderMessageKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReminderMessage_kind_idx" ON "ReminderMessage"("kind");

-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN "messageId" TEXT;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ReminderMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The messages sent so far, so they stay in the rotation (admins may edit or switch them off).
INSERT INTO "ReminderMessage" ("id", "kind", "title", "body", "updatedAt") VALUES
  ('rm_search_local_1', 'SEARCH_LOCAL', '{name}, {drop}?', 'Drivers are nearby. Book now and get there on time.', CURRENT_TIMESTAMP),
  ('rm_search_outstation_1', 'SEARCH_OUTSTATION', '{name}, {drop}?', 'Drivers are available. Confirm now to get an outstation cab right at your doorstep.', CURRENT_TIMESTAMP),
  ('rm_routine_1', 'ROUTINE', 'Going to {drop}?', 'Your usual {time} ride is a tap away. Book {vehicle} now.', CURRENT_TIMESTAMP);
