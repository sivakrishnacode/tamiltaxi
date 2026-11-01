import { Injectable, Logger, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';

import { JobsService } from '../../core/jobs/jobs.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { KycStatus } from '../../generated/prisma/enums.js';
import { NotifierService } from '../notifications/notifier.service.js';
import { DriverApprovalService } from './driver-approval.service.js';
import {
  daysLeft,
  EXPIRING_WITHIN_DAYS,
  EXPIRY_SCAN_EVERY_MS,
  EXPIRY_SCAN_ID,
  EXPIRY_SCAN_JOB,
  expiredReason,
  expiryReminderText,
  isReminderHour,
  istToday,
  noticeDue,
} from './document-expiry.js';

/**
 * Valid-until dates on verified driver documents (RC, insurance), checked every hour (job `kyc.expiry-scan`):
 * - 30 and 7 days before: a reminder push to the driver (daytime only, once each: `expiryNotifiedDays`);
 * - the day after the date: the document is rejected ("Expired on …, please upload the renewed …"), which takes the
 *   driver offline as any rejected document does, until the new one is uploaded and verified.
 */
@Injectable()
export class DocumentExpiryService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(DocumentExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly approval: DriverApprovalService,
    private readonly notifier: NotifierService,
  ) {}

  onModuleInit(): void {
    this.jobs.register(EXPIRY_SCAN_JOB, () => this.scanJob());
  }

  /** Starts the hourly scan unless it is already scheduled (restarts never pile it up). */
  async onApplicationBootstrap(): Promise<void> {
    if ((await this.jobs.scheduledAt(EXPIRY_SCAN_JOB, EXPIRY_SCAN_ID)) === null) {
      await this.jobs.schedule(EXPIRY_SCAN_JOB, EXPIRY_SCAN_ID, Date.now() + 60_000);
    }
  }

  /** The repeating job: the next run is scheduled first, so a failing scan never stops it. */
  private async scanJob(): Promise<void> {
    await this.jobs.schedule(EXPIRY_SCAN_JOB, EXPIRY_SCAN_ID, Date.now() + EXPIRY_SCAN_EVERY_MS);
    try {
      const done = await this.scan(new Date());
      if (done.expired || done.reminded) this.logger.log(`Documents: ${done.expired} expired, ${done.reminded} reminders`);
    } catch (e) {
      this.logger.warn(`Document expiry scan failed: ${(e as Error).message}`);
    }
  }

  /** Rejects the expired documents and sends the reminders that are due. */
  async scan(now: Date): Promise<{ expired: number; reminded: number }> {
    const today = istToday(now);
    let expired = 0;
    const gone = await this.prisma.kycDocument.findMany({
      where: { status: KycStatus.VERIFIED, expiresOn: { lt: today } },
      select: { id: true, driverId: true, type: true, expiresOn: true },
    });
    for (const doc of gone) {
      const reason = expiredReason(doc.type, doc.expiresOn!);
      // Only while it is still verified with that date (an admin may have just changed it).
      const { count } = await this.prisma.kycDocument.updateMany({
        where: { id: doc.id, status: KycStatus.VERIFIED, expiresOn: doc.expiresOn },
        data: { status: KycStatus.REJECTED, rejectReason: reason },
      });
      if (!count) continue;
      expired++;
      await this.approval.recompute(doc.driverId);
      await this.notifier.kycReviewed({ driverId: doc.driverId, type: doc.type, status: 'REJECTED', reason });
    }

    let reminded = 0;
    if (!isReminderHour(now)) return { expired, reminded };
    const soon = await this.prisma.kycDocument.findMany({
      where: { status: KycStatus.VERIFIED, expiresOn: { gte: today, lte: new Date(today.getTime() + EXPIRING_WITHIN_DAYS * 86_400_000) } },
      select: { id: true, driverId: true, type: true, expiresOn: true, expiryNotifiedDays: true },
    });
    for (const doc of soon) {
      const left = daysLeft(doc.expiresOn!, today);
      const due = noticeDue(left, doc.expiryNotifiedDays);
      if (due === null) continue;
      // Claim it first, so two API processes never send the same reminder.
      const { count } = await this.prisma.kycDocument.updateMany({
        where: { id: doc.id, expiryNotifiedDays: doc.expiryNotifiedDays },
        data: { expiryNotifiedDays: due },
      });
      if (!count) continue;
      reminded++;
      await this.notifier.driverAccount({ driverId: doc.driverId, kind: 'document_expiry', ...expiryReminderText(doc.type, doc.expiresOn!, left) });
    }
    return { expired, reminded };
  }
}
