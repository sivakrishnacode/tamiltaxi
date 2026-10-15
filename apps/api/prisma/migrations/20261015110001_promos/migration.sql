-- CreateEnum
CREATE TYPE "PromoPlacement" AS ENUM ('SPLASH', 'BANNER');

-- CreateTable
CREATE TABLE "Promo" (
    "id" TEXT NOT NULL,
    "placement" "PromoPlacement" NOT NULL,
    "title" TEXT NOT NULL,
    "image" BYTEA NOT NULL,
    "imageType" TEXT NOT NULL,
    "linkUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Promo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Promo_placement_isActive_idx" ON "Promo"("placement", "isActive");
