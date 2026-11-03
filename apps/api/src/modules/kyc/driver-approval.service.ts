import { Injectable, Logger } from '@nestjs/common';

import { DriverStateCache } from '../../core/driver-state/driver-state.cache.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { DriverStatus, IdentityPurpose, IdentityStatus } from '../../generated/prisma/enums.js';
import { NotifierService } from '../notifications/notifier.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { DiditClient } from './didit.client.js';
import { type IdentityMode, isIdentityRequiredFor, manualIdentityStatus, nextDriverStatus } from './driver-approval.js';

/** Told after [DriverApprovalService.recompute] changed a driver's status (the row is already written). */
export type DriverStatusListener = (driverId: string, status: DriverStatus) => Promise<unknown>;

/**
 * Re-evaluates a driver's status after a document review or an identity result, and tells them when approved. With
 * `driverAutoApprove` off, a driver who passes every check stays PENDING for an admin to approve. Modules that can't
 * be imported here (realtime, dispatch) hear about every change through [onStatusChange].
 */
@Injectable()
export class DriverApprovalService {
  private readonly logger = new Logger(DriverApprovalService.name);
  private readonly listeners: DriverStatusListener[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly didit: DiditClient,
    private readonly notifier: NotifierService,
    private readonly driverState: DriverStateCache,
    private readonly settings: SettingsService,
  ) {}

  /** Calls [listener] after each status change made here (e.g. a rejected document → REJECTED). */
  onStatusChange(listener: DriverStatusListener): void {
    this.listeners.push(listener);
  }

  /** Didit when it is set up and the manual check isn't switched on; otherwise an admin checks the documents. */
  async identityMode(): Promise<IdentityMode> {
    return this.didit.isEnabled && !(await this.settings.get('manualIdentityCheck')) ? 'DIDIT' : 'MANUAL';
  }

  /** Whether [driver] must pass the identity step (and so have a profile photo before going online). */
  async isIdentityRequired(driver: { appVersion: string | null }): Promise<boolean> {
    return isIdentityRequiredFor(await this.identityMode(), driver.appVersion);
  }

  /**
   * Mirrors the manual identity documents on the user's identity status (approved, declined, in review), so the
   * approval, the queue and going online treat both checks alike. An identity Didit approved is left alone.
   */
  async syncManualIdentity(driverId: string): Promise<void> {
    const driver = await this.prisma.driver.findUniqueOrThrow({
      where: { id: driverId },
      select: { userId: true, documents: { select: { type: true, status: true } }, user: { select: { identityStatus: true } } },
    });
    const status = manualIdentityStatus(driver.documents);
    if (!status || status === driver.user.identityStatus) return;
    const byDidit = await this.prisma.identityVerification.count({ where: { userId: driver.userId, status: IdentityStatus.APPROVED } });
    if (byDidit > 0) return;
    await this.prisma.user.update({
      where: { id: driver.userId },
      data: { identityStatus: status, identityVerifiedAt: status === IdentityStatus.APPROVED ? new Date() : null },
    });
    if (status !== IdentityStatus.IN_REVIEW) void this.notifier.identityChanged({ userId: driver.userId, purpose: IdentityPurpose.DRIVER, status });
  }

  async recompute(driverId: string): Promise<DriverStatus> {
    const driver = await this.prisma.driver.findUniqueOrThrow({
      where: { id: driverId },
      include: { documents: true, user: { select: { identityStatus: true } } },
    });
    const next = nextDriverStatus({
      current: driver.status,
      docs: driver.documents,
      identity: driver.user.identityStatus,
      isIdentityRequired: await this.isIdentityRequired(driver),
      isAutoApprove: await this.settings.get('driverAutoApprove'),
    });
    if (next === driver.status) return next;
    await this.prisma.driver.update({ where: { id: driverId }, data: { status: next, isOnline: next === DriverStatus.APPROVED ? undefined : false } });
    await this.driverState.invalidate(driverId);
    if (next === DriverStatus.APPROVED) void this.notifier.kycReviewed({ driverId, status: 'APPROVED' });
    for (const listener of this.listeners) {
      await listener(driverId, next).catch((e: Error) => this.logger.warn(`Status listener failed for ${driverId}: ${e.message}`));
    }
    return next;
  }
}
