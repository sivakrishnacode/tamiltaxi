import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { DriverStateCache } from '../../core/driver-state/driver-state.cache.js';
import { accessKey } from '../../core/auth/user-access.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { RedisService } from '../../core/redis/redis.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { CancelCode, CancelFault, CancelledBy, DriverStatus, IdentityStatus, KycStatus, TripStatus } from '../../generated/prisma/enums.js';
import { DriversService } from '../drivers/drivers.service.js';
import { StoredFileRemover } from './stored-file-remover.js';

/** A trip in one of these isn't finished: the account can't be deleted until it is. */
const UNFINISHED: TripStatus[] = [TripStatus.SEARCHING, TripStatus.DRIVER_ASSIGNED, TripStatus.DRIVER_ARRIVED, TripStatus.IN_PROGRESS, TripStatus.PICKED_UP];
/** Personal details inside a parcel trip's JSON (the sender's and receiver's names, phones and notes). */
const PARCEL_PERSONAL = ['senderName', 'senderPhone', 'receiverName', 'receiverPhone', 'pickupNote', 'dropNote'];

/** The phone a deleted account keeps (unique, never a real number), so the real number can sign up again. */
export function deletedPhone(userId: string): string {
  return `deleted:${userId}`;
}

/** Who asked: the user themselves (DELETE /me) or an admin (DELETE /admin/users/:id, audited by the interceptor). */
export type DeletedBy = { kind: 'self' } | { kind: 'admin'; adminId: string };

/**
 * Account deletion (Play Store / DPDP): wipes the person, keeps the records. Refused (409) while the user has an
 * unfinished trip, as rider or driver; their trips booked for later are cancelled first (free). Then, in one
 * transaction:
 * - the user: name, email, gender null, phone → `deleted:<id>` (the number can sign up again as a new account),
 *   identity status reset, `deletedAt` set; saved places, emergency contacts, push devices, identity-check records
 *   (name, date of birth, last 4 digits) and admin notes about them deleted;
 * - their trips as rider stay (fares, safety, the drivers' records) without who-is-riding names / phones, the parcel's
 *   sender / receiver names, phones and notes, and the parcel and delivery photos;
 * - their support tickets stay (the text, for the records) without the photo;
 * - a driver: offline (out of dispatch), REJECTED, UPI ID and booking preferences cleared, the plate replaced by a
 *   tombstone (the vehicle can be registered again), KYC documents, profile / pending photos and the verified selfie
 *   gone. Ratings, earnings, cancellations, subscriptions and SOS records stay.
 * Sessions end at once (the `user:blocked:<id>` flag the auth guard checks). Stored files are deleted after the
 * transaction (best effort).
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly drivers: DriversService,
    private readonly driverState: DriverStateCache,
    private readonly fileRemover: StoredFileRemover,
  ) {}

  async delete(userId: string, by: DeletedBy): Promise<void> {
    if (by.kind === 'admin' && by.adminId === userId) throw new BadRequestException("You can't delete your own account here");
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        deletedAt: true,
        driver: { select: { id: true, photoFile: true, pendingPhotoFile: true, selfieFile: true, documents: { select: { fileUrl: true } } } },
      },
    });
    if (!user || user.deletedAt) throw new NotFoundException('Account not found');
    const driverId = user.driver?.id;
    const unfinished = await this.prisma.trip.count({
      where: { status: { in: UNFINISHED }, OR: [{ passengerId: userId }, ...(driverId ? [{ driverId }] : [])] },
    });
    if (unfinished) throw new ConflictException('Finish or cancel your current trip first, then delete the account');

    const now = new Date();
    // Files to delete once the rows no longer point at them.
    const [tripPhotos, ticketPhotos] = await Promise.all([
      this.prisma.trip.findMany({ where: { passengerId: userId }, select: { parcelPhotoFile: true, deliveryPhotoFile: true } }),
      this.prisma.supportTicket.findMany({ where: { userId, attachmentFile: { not: null } }, select: { attachmentFile: true } }),
    ]);
    const files = [
      ...tripPhotos.flatMap((t) => [t.parcelPhotoFile, t.deliveryPhotoFile]),
      ...ticketPhotos.map((t) => t.attachmentFile),
      user.driver?.photoFile,
      user.driver?.pendingPhotoFile,
      user.driver?.selfieFile,
      ...(user.driver?.documents.map((d) => d.fileUrl) ?? []),
    ];

    await this.prisma.$transaction(async (tx) => {
      // Trips booked for later: cancelled, free (nobody was on the way).
      const scheduled = await tx.trip.findMany({ where: { passengerId: userId, status: TripStatus.SCHEDULED }, select: { id: true } });
      if (scheduled.length) {
        const cancel = { by: CancelledBy.PASSENGER, code: CancelCode.CHANGED_MIND, note: 'Account deleted' };
        await tx.trip.updateMany({
          where: { id: { in: scheduled.map((t) => t.id) }, status: TripStatus.SCHEDULED },
          data: { status: TripStatus.CANCELLED, cancelledBy: cancel.by, cancelCode: cancel.code, cancelReason: cancel.note, cancelledAt: now },
        });
        await tx.tripCancellation.createMany({
          data: scheduled.map((t) => ({ tripId: t.id, passengerId: userId, ...cancel, fromStatus: TripStatus.SCHEDULED, fault: CancelFault.NONE, faultRule: 'account_deleted' })),
        });
      }
      await tx.$executeRaw`
        UPDATE "Trip"
        SET "riderName" = NULL, "riderPhone" = NULL, "parcelPhotoFile" = NULL, "deliveryPhotoFile" = NULL,
            "parcel" = CASE WHEN "parcel" IS NULL THEN NULL ELSE "parcel" - ${PARCEL_PERSONAL}::text[] END
        WHERE "passengerId" = ${userId}`;
      await tx.supportTicket.updateMany({ where: { userId }, data: { attachmentFile: null } });
      await tx.savedPlace.deleteMany({ where: { userId } });
      await tx.emergencyContact.deleteMany({ where: { userId } });
      await tx.deviceToken.deleteMany({ where: { userId } });
      await tx.identityVerification.deleteMany({ where: { userId } });
      await tx.adminNote.deleteMany({ where: { userId } });
      if (driverId) {
        await tx.kycDocument.updateMany({ where: { driverId }, data: { status: KycStatus.NOT_UPLOADED, fileUrl: null, rejectReason: null } });
        await tx.driver.update({
          where: { id: driverId },
          data: {
            status: DriverStatus.REJECTED,
            isOnline: false,
            plate: `DELETED-${driverId}`,
            upiId: '',
            bookingPrefs: Prisma.DbNull,
            photoFile: null,
            pendingPhotoFile: null,
            selfieFile: null,
            photoMatchScore: null,
            photoRejectReason: null,
            selfieCheckedAt: null,
          },
        });
      }
      await tx.user.update({
        where: { id: userId },
        data: {
          name: null,
          email: null,
          gender: null,
          phone: deletedPhone(userId),
          preferWomenDriver: false,
          rideOtp: null,
          identityStatus: IdentityStatus.NOT_STARTED,
          identityVerifiedAt: null,
          blockedReason: null,
          deletedAt: now,
        },
      });
      if (by.kind === 'self') {
        await tx.auditLog.create({ data: { actorId: userId, action: 'DELETE /v1/me', entity: 'users', entityId: userId, data: { scheduledCancelled: scheduled.length } } });
      }
    });

    // Every session ends now (JwtAuthGuard checks this flag on each call).
    await this.redis.del(accessKey(userId));
    await this.redis.set(`user:blocked:${userId}`, '1');
    if (driverId) {
      await this.drivers.goOffline(driverId);
      await this.driverState.invalidate(driverId);
    }
    const removed = await this.fileRemover.remove(files);
    this.logger.log(`Account ${userId} deleted (${by.kind}); ${removed} stored files removed`);
  }
}
