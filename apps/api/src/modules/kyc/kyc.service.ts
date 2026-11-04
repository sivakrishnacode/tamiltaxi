import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { IdentityStatus } from '../../generated/prisma/enums.js';
import { DriverApprovalService } from './driver-approval.service.js';

/** The user's identity check as the apps show it. */
export interface IdentityView {
  /** Always false: no automatic check (apps up to 0.1.1 read false as "nothing to start"). */
  readonly isEnabled: false;
  /** Whether this driver must pass the check by hand (apps from 0.1.2); riders never. */
  readonly isRequired: boolean;
  readonly status: IdentityStatus;
  readonly verifiedAt: Date | null;
  /** Kept empty for apps up to 0.1.1, which read them. */
  readonly fullName: null;
  readonly documentType: null;
  readonly documentLast4: null;
  readonly documents: [];
  readonly reasons: [];
}

/**
 * The identity check by hand: drivers upload their licence and Aadhaar (Account › Documents), an admin verifies them
 * and approves the profile photo as the matching face ([DriverApprovalService.syncManualIdentity]). Riders have none.
 */
@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approval: DriverApprovalService,
  ) {}

  /** [appVersion]: the driver app's `x-app-version` header, kept on the driver (null: an older app). */
  async view(userId: string, appVersion?: string): Promise<IdentityView> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { identityStatus: true, identityVerifiedAt: true, driver: { select: { id: true, appVersion: true } } },
    });
    if (user.driver && appVersion && user.driver.appVersion !== appVersion) {
      await this.prisma.driver.update({ where: { id: user.driver.id }, data: { appVersion } });
      user.driver.appVersion = appVersion;
    }
    return {
      isEnabled: false,
      isRequired: user.driver ? this.approval.isIdentityRequired(user.driver) : false,
      status: user.identityStatus,
      verifiedAt: user.identityVerifiedAt,
      fullName: null,
      documentType: null,
      documentLast4: null,
      documents: [],
      reasons: [],
    };
  }
}
