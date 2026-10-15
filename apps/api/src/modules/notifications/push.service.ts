import { Inject, Injectable, Logger } from '@nestjs/common';
import { cert, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging, type Message, type Messaging } from 'firebase-admin/messaging';

import type { Env } from '../../core/config/env.js';
import { ENV } from '../../core/config/env.token.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { AppKind } from '../../generated/prisma/enums.js';

/** Android notification channels, created by the apps with the same ids. */
export type PushChannel = 'ride_requests' | 'trip_updates' | 'chat' | 'account' | 'announcements' | 'safety' | 'suggestions';

export interface PushMessage {
  title: string;
  body: string;
  channel: PushChannel;
  /** Strings only (FCM data). `type` + ids let the app open the right screen on tap. */
  data?: Record<string, string>;
  /** Ride requests: wake the phone and drop the message once the offer has expired. */
  isUrgent?: boolean;
  ttlSeconds?: number;
}

/** Topics the apps subscribe to (admin announcements). */
export const PUSH_TOPICS = { ALL: 'all', PASSENGER: 'passengers', DRIVER: 'drivers' } as const;

const DEAD_TOKEN_CODES = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument']);

/**
 * Firebase Cloud Messaging (HTTP v1 via firebase-admin; free). Device tokens live in `DeviceToken`; tokens FCM reports
 * as dead are deleted. Without FIREBASE_SERVICE_ACCOUNT_B64 every send is a logged no-op, so dev and tests need no key.
 * Pushes never block or fail the request that triggered them.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly messaging: Messaging | null;

  constructor(
    @Inject(ENV) env: Env,
    private readonly prisma: PrismaService,
  ) {
    this.messaging = PushService.init(env.firebaseServiceAccount, this.logger);
  }

  private static init(json: string, logger: Logger): Messaging | null {
    if (!json) {
      logger.log('Push disabled (no FIREBASE_SERVICE_ACCOUNT_B64)');
      return null;
    }
    try {
      const app: App = initializeApp({ credential: cert(JSON.parse(json) as object) }, 'tamiltaxi');
      logger.log('Push enabled (FCM)');
      return getMessaging(app);
    } catch (e) {
      logger.error(`Push disabled: bad service account (${(e as Error).message})`);
      return null;
    }
  }

  get isEnabled(): boolean {
    return this.messaging !== null;
  }

  /** Saves (or moves) a device token to this user and app. */
  async register(params: { userId: string; token: string; app: AppKind; platform?: string }): Promise<void> {
    const data = { userId: params.userId, app: params.app, platform: params.platform ?? 'android' };
    await this.prisma.deviceToken.upsert({ where: { token: params.token }, create: { token: params.token, ...data }, update: data });
  }

  /** Sign-out: the phone stops getting this user's pushes. */
  async unregister(userId: string, token: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({ where: { token, userId } });
  }

  /** Every signed-in phone of [userId] in [app]. */
  toUser(userId: string, app: AppKind, msg: PushMessage): void {
    void this.sendToUser(userId, app, msg).catch((e: Error) => this.logger.warn(`Push to ${userId} failed: ${e.message}`));
  }

  toTopic(topic: string, msg: PushMessage): void {
    if (!this.messaging) return;
    void this.messaging.send({ topic, ...PushService.payload(msg) }).catch((e: Error) => this.logger.warn(`Push to /topics/${topic} failed: ${e.message}`));
  }

  private async sendToUser(userId: string, app: AppKind, msg: PushMessage): Promise<void> {
    if (!this.messaging) return;
    const devices = await this.prisma.deviceToken.findMany({ where: { userId, app }, select: { token: true } });
    if (devices.length === 0) return;
    const tokens = devices.map((d) => d.token);
    const res = await this.messaging.sendEachForMulticast({ tokens, ...PushService.payload(msg) });
    const dead = res.responses.flatMap((r, i) => (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code) ? [tokens[i]] : []));
    if (dead.length) await this.prisma.deviceToken.deleteMany({ where: { token: { in: dead } } });
  }

  static payload(msg: PushMessage): Omit<Message, 'token' | 'topic' | 'condition'> {
    return {
      notification: { title: msg.title, body: msg.body },
      data: { ...msg.data, channel: msg.channel },
      android: {
        priority: msg.isUrgent ? 'high' : 'normal',
        ttl: msg.ttlSeconds ? msg.ttlSeconds * 1000 : undefined,
        notification: {
          channelId: msg.channel,
          ...(msg.isUrgent ? { sound: 'default', defaultVibrateTimings: true, visibility: 'public' as const } : {}),
          ...(msg.data?.tripId ? { tag: `trip-${msg.data.tripId}` } : {}),
        },
      },
    };
  }
}
