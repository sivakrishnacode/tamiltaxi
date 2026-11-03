import { ConflictException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

import type { AuthUser } from '../../core/auth/auth-user.js';
import type { Env } from '../../core/config/env.js';
import { ENV } from '../../core/config/env.token.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { RedisService } from '../../core/redis/redis.service.js';
import type { IdentityVerification } from '../../generated/prisma/client.js';
import { IdentityPurpose, IdentityStatus, Role } from '../../generated/prisma/enums.js';
import { NotifierService } from '../notifications/notifier.service.js';
import { DiditClient } from './didit.client.js';
import { type DiditDecision, type ScannedDocument, selfieUrl, summarizeDecision, toIdentityStatus } from './didit.js';
import { FileStorageService } from '../../core/storage/file-storage.service.js';
import type { IdentityMode } from './driver-approval.js';
import { DriverApprovalService } from './driver-approval.service.js';

/** New Didit sessions a user may start per day (declines and abandoned attempts), to protect the free quota. */
const MAX_SESSIONS_PER_DAY = 3;
const EVENT_TTL_S = 2 * 24 * 3600;
/** Didit document codes: drivers scan their driving licence and Aadhaar (ID); riders may use any Indian ID. */
const DOC_TYPES: Record<IdentityPurpose, string[]> = { DRIVER: ['DL', 'ID'], RIDER: ['ID', 'DL', 'P'] };
const NO_LICENCE = 'Driving licence not scanned';

/** The user's identity check as the apps show it. */
export interface IdentityView {
  /** Didit's in-app check is offered (apps before 0.1.2 know only this: false = nothing to do). */
  readonly isEnabled: boolean;
  /** Drivers: Didit, or the licence and Aadhaar uploaded for an admin (with the profile photo). Riders: always DIDIT. */
  readonly mode: IdentityMode;
  /** Whether this user must pass the identity step (drivers; riders' check is optional). */
  readonly isRequired: boolean;
  readonly status: IdentityStatus;
  readonly verifiedAt: Date | null;
  readonly fullName: string | null;
  readonly documentType: string | null;
  readonly documentLast4: string | null;
  /** Every scanned ID (type + last 4), e.g. the licence and Aadhaar. */
  readonly documents: ScannedDocument[];
  /** Why the last attempt was declined (short Didit reasons). */
  readonly reasons: string[];
}

/** A started session: the app opens Didit's in-app SDK with [sessionToken]. */
export interface StartedSession {
  readonly sessionId: string;
  readonly sessionToken: string;
}

/** Didit webhook body (session events). */
export interface DiditWebhook {
  readonly event_id?: string;
  readonly webhook_type?: string;
  readonly session_id?: string;
  readonly status?: string;
  readonly vendor_data?: string;
  readonly metadata?: { purpose?: string } | null;
  readonly decision?: DiditDecision;
}

/**
 * Identity checks with Didit: ID document + passive liveness + face match, inside the apps (native SDK).
 * Results arrive by signed webhook, and the apps also ask for a sync when the SDK closes.
 */
@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly didit: DiditClient,
    private readonly approval: DriverApprovalService,
    private readonly notifier: NotifierService,
    private readonly files: FileStorageService,
  ) {}

  /** [appVersion]: the driver app's `x-app-version` header, kept on the driver (null: an older app). */
  async view(userId: string, appVersion?: string): Promise<IdentityView> {
    let latest = await this.latest(userId);
    // Declines stored before reasons existed: read the decision once so the app can say what to fix.
    if (latest?.status === IdentityStatus.DECLINED && latest.reasons === null && this.didit.isEnabled) {
      try {
        const decision = await this.didit.decision(latest.sessionId);
        await this.apply(latest, decision.status ?? latest.providerStatus, decision);
        latest = await this.latest(userId);
      } catch {
        // Didit unreachable: show the decline without reasons.
      }
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { identityStatus: true, identityVerifiedAt: true, driver: { select: { id: true, selfieFile: true, appVersion: true } } },
    });
    if (user.driver && appVersion && user.driver.appVersion !== appVersion) {
      await this.prisma.driver.update({ where: { id: user.driver.id }, data: { appVersion } });
      user.driver.appVersion = appVersion;
    }
    const mode: IdentityMode = user.driver ? await this.approval.identityMode() : 'DIDIT';
    // Approved before selfies were kept (or the download failed): fetch it again, at most every 10 minutes.
    if (user.identityStatus === IdentityStatus.APPROVED && user.driver && !user.driver.selfieFile && this.didit.isEnabled) {
      const approvedRow = await this.prisma.identityVerification.findFirst({ where: { userId, status: IdentityStatus.APPROVED }, orderBy: { decidedAt: 'desc' } });
      const isFirstTry = await this.redis.set(`kyc:photo-retry:${user.driver.id}`, '1', 'EX', 600, 'NX');
      if (approvedRow && isFirstTry) {
        try {
          await this.saveSelfie(user.driver.id, await this.didit.decision(approvedRow.sessionId));
        } catch {
          // Try again on a later read.
        }
      }
    }
    const approved =
      user.identityStatus === IdentityStatus.APPROVED
        ? await this.prisma.identityVerification.findFirst({ where: { userId, status: IdentityStatus.APPROVED }, orderBy: { decidedAt: 'desc' } })
        : null;
    const shown = approved ?? latest;
    return {
      isEnabled: this.didit.isEnabled && mode === 'DIDIT',
      mode,
      isRequired: user.driver ? await this.approval.isIdentityRequired(user.driver) : false,
      status: user.identityStatus,
      verifiedAt: user.identityVerifiedAt,
      fullName: shown?.fullName ?? null,
      documentType: shown?.documentType ?? null,
      documentLast4: shown?.documentLast4 ?? null,
      documents: (shown?.documents as ScannedDocument[] | null) ?? [],
      reasons: latest?.status === IdentityStatus.DECLINED ? ((latest.reasons as string[] | null) ?? []) : [],
    };
  }

  /**
   * Creates (or reuses) a Didit session for the caller. Drivers check their licence; riders any ID. A driver app that
   * can upload the documents (it sends [appVersion]) hears `IDENTITY_MANUAL` when Didit can't be used, and switches to
   * the check by hand, so Didit never stops a sign-up.
   */
  async start(user: AuthUser, appVersion?: string): Promise<StartedSession> {
    if (!this.didit.isEnabled) throw new ServiceUnavailableException('Identity checks are not set up yet');
    const purpose = user.role === Role.DRIVER ? IdentityPurpose.DRIVER : IdentityPurpose.RIDER;
    const manual = new ServiceUnavailableException({
      message: "The automatic check isn't available right now. Upload your licence and Aadhaar instead",
      code: 'IDENTITY_MANUAL',
    });
    // Switched to the check by hand: not an outage, so a 409 with the same code.
    if (purpose === IdentityPurpose.DRIVER && (await this.approval.identityMode()) === 'MANUAL') {
      throw new ConflictException({ message: 'Upload your licence and Aadhaar: an admin checks them with your photo', code: 'IDENTITY_MANUAL' });
    }
    const workflowId = purpose === IdentityPurpose.DRIVER ? this.env.didit.driverWorkflowId : this.env.didit.riderWorkflowId;
    if (!workflowId) throw new ServiceUnavailableException('Identity checks are not set up yet');
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: user.userId }, select: { name: true, identityStatus: true } });
    if (me.identityStatus === IdentityStatus.APPROVED) throw new ConflictException('Your identity is already verified');
    if (me.identityStatus === IdentityStatus.IN_REVIEW) throw new ConflictException('Your verification is being reviewed');
    // Count before asking Didit: every session it creates is billed, even one we then refuse.
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const today = await this.prisma.identityVerification.count({ where: { userId: user.userId, createdAt: { gte: since } } });
    if (today >= MAX_SESSIONS_PER_DAY) {
      throw new HttpException('Too many attempts today. Please try again tomorrow', HttpStatus.TOO_MANY_REQUESTS);
    }
    const [firstName, ...rest] = (me.name ?? '').trim().split(/\s+/).filter(Boolean);
    let session: Awaited<ReturnType<DiditClient['createSession']>>;
    try {
      session = await this.didit.createSession({
        workflowId,
        userId: user.userId,
        metadata: { purpose },
        expected: { firstName, lastName: rest.join(' ') || undefined, documentTypes: DOC_TYPES[purpose] },
      });
    } catch (e) {
      // Out of credits, rate limited or down: a driver app that can upload goes on by hand.
      if (purpose === IdentityPurpose.DRIVER && appVersion && e instanceof ServiceUnavailableException) throw manual;
      throw e;
    }
    const existing = await this.prisma.identityVerification.findUnique({ where: { sessionId: session.sessionId } });
    if (!existing) {
      await this.prisma.identityVerification.create({
        data: { userId: user.userId, purpose, sessionId: session.sessionId, providerStatus: session.status, status: toIdentityStatus(session.status) },
      });
    }
    return { sessionId: session.sessionId, sessionToken: session.sessionToken };
  }

  /** Called by the app when the SDK closes: fetches the decision so the result shows even without a webhook. */
  async sync(userId: string): Promise<IdentityView> {
    const latest = await this.latest(userId);
    if (!latest) throw new NotFoundException('No verification started');
    if (this.didit.isEnabled) {
      const decision = await this.didit.decision(latest.sessionId);
      await this.apply(latest, decision.status ?? latest.providerStatus, decision);
    }
    return this.view(userId);
  }

  /** A verified webhook. Idempotent on `event_id`; unknown sessions (e.g. made in the Didit console) are adopted. */
  async handleWebhook(body: DiditWebhook): Promise<void> {
    if (!body.session_id || !body.status) return;
    if (body.webhook_type !== 'status.updated' && body.webhook_type !== 'data.updated') return;
    if (body.event_id) {
      const isFirst = await this.redis.set(`kyc:event:${body.event_id}`, '1', 'EX', EVENT_TTL_S, 'NX');
      if (!isFirst) return;
    }
    let row = await this.prisma.identityVerification.findUnique({ where: { sessionId: body.session_id } });
    if (!row && body.vendor_data) {
      const user = await this.prisma.user.findUnique({ where: { id: body.vendor_data }, select: { id: true, role: true } });
      if (!user) return;
      const purpose = body.metadata?.purpose === IdentityPurpose.RIDER || user.role !== Role.DRIVER ? IdentityPurpose.RIDER : IdentityPurpose.DRIVER;
      row = await this.prisma.identityVerification.create({ data: { userId: user.id, purpose, sessionId: body.session_id } });
    }
    if (!row) return;
    // `data.updated` (a reviewer's edits) may come without a decision: fetch it.
    const decision = body.decision ?? (body.webhook_type === 'data.updated' ? await this.didit.decision(body.session_id) : undefined);
    await this.apply(row, body.status, decision);
  }

  /** Stores the decision's live selfie as the driver's reference face. A failed download is retried by `/kyc/me`. */
  private async saveSelfie(driverId: string, decision?: DiditDecision): Promise<void> {
    const url = selfieUrl(decision);
    const image = url ? await this.didit.image(url) : null;
    if (!image) {
      this.logger.warn(`No selfie saved for driver ${driverId}`);
      return;
    }
    const ext = image.mimetype.split('/')[1];
    const selfieFile = await this.files.save({ originalname: `selfie.${ext}`, mimetype: image.mimetype, size: image.buffer.length, buffer: image.buffer });
    await this.prisma.driver.update({ where: { id: driverId }, data: { selfieFile } });
  }

  private latest(userId: string): Promise<IdentityVerification | null> {
    return this.prisma.identityVerification.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  /** Stores the result, mirrors it on the user (newest session wins; an approval always does) and re-checks the driver. */
  private async apply(row: IdentityVerification, providerStatus: string, decision?: DiditDecision): Promise<void> {
    let status = toIdentityStatus(providerStatus);
    const summary = decision ? summarizeDecision(decision, row.purpose === IdentityPurpose.DRIVER ? 'Aadhaar' : 'ID card') : null;
    // A driver must have scanned a driving licence: if the workflow let one through without it, a person decides.
    if (row.purpose === IdentityPurpose.DRIVER && status === IdentityStatus.APPROVED && summary && !summary.hasDrivingLicence) {
      status = IdentityStatus.IN_REVIEW;
      summary.warnings.push(NO_LICENCE);
    }
    const isDecided = status === IdentityStatus.APPROVED || status === IdentityStatus.DECLINED || status === IdentityStatus.IN_REVIEW;
    await this.prisma.identityVerification.update({
      where: { id: row.id },
      data: {
        status,
        providerStatus,
        ...(summary
          ? {
              documentType: summary.documentType,
              documentLast4: summary.documentLast4,
              documents: summary.documents.map((d) => ({ type: d.type, last4: d.last4 })),
              fullName: summary.fullName,
              dateOfBirth: summary.dateOfBirth,
              warnings: summary.warnings,
              reasons: summary.reasons,
            }
          : {}),
        decidedAt: isDecided ? (row.decidedAt ?? new Date()) : null,
      },
    });
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: row.userId },
      select: { identityStatus: true, driver: { select: { id: true, selfieFile: true } } },
    });
    // Keep the approved live selfie: the driver's profile photo is matched against it. Didit's link is short-lived.
    if (row.purpose === IdentityPurpose.DRIVER && user.driver && status === IdentityStatus.APPROVED) {
      if (row.status !== IdentityStatus.APPROVED || !user.driver.selfieFile) await this.saveSelfie(user.driver.id, decision);
    }
    const newest = await this.latest(row.userId);
    const isNewest = newest?.id === row.id;
    // Keep an approval unless this session is the newest one (Didit expired or overturned it).
    if (!isNewest && status !== IdentityStatus.APPROVED) return;
    // A newer session that was only started, then expired or abandoned, never undoes an approval: only the
    // approved session itself can (Kyc Expired, or a reviewer overturning it).
    if (user.identityStatus === IdentityStatus.APPROVED && status !== IdentityStatus.APPROVED && row.status !== IdentityStatus.APPROVED) return;
    if (user.identityStatus !== status) {
      await this.prisma.user.update({
        where: { id: row.userId },
        data: { identityStatus: status, identityVerifiedAt: status === IdentityStatus.APPROVED ? new Date() : null },
      });
      this.logger.log(`Identity ${row.sessionId} → ${providerStatus}`);
      void this.notifier.identityChanged({ userId: row.userId, purpose: row.purpose, status });
    }
    if (row.purpose === IdentityPurpose.DRIVER && user.driver) await this.approval.recompute(user.driver.id);
  }
}
