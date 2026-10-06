-- One ride OTP per rider (Rapido style): made at the first booking, changed by admins when it was overheard.
ALTER TABLE "User" ADD COLUMN "rideOtp" TEXT;
