import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import type { Env } from '../../core/config/env.js';
import { ENV } from '../../core/config/env.token.js';
import { DomainEvents, DriverApprovedEvent, DriverRegisteredEvent, RiderSignedUpEvent } from '../../core/events/domain-events.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { WelcomeTrigger } from '../../generated/prisma/enums.js';
import type { SettingKey } from '../settings/settings.defaults.js';
import { SettingsService } from '../settings/settings.service.js';
import { WatxClient } from './watx.client.js';

/** Each trigger's on / off and template-name settings. */
export const WELCOME_SETTINGS: Record<WelcomeTrigger, { readonly enabled: SettingKey; readonly template: SettingKey }> = {
  [WelcomeTrigger.RIDER_SIGNUP]: { enabled: 'welcomeRiderEnabled', template: 'welcomeRiderTemplate' },
  [WelcomeTrigger.DRIVER_REGISTERED]: { enabled: 'welcomeDriverRegisteredEnabled', template: 'welcomeDriverRegisteredTemplate' },
  [WelcomeTrigger.DRIVER_APPROVED]: { enabled: 'welcomeDriverApprovedEnabled', template: 'welcomeDriverApprovedTemplate' },
};

/** The templates' one variable: the first name, else "friend" (Meta refuses a blank value). */
export function welcomeName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] || 'friend';
}

const DAY_MS = 86_400_000;
const RECENT = 30;

/** GET /admin/welcome-messages: is WATX set up, each trigger's last 7 days, and the newest messages. */
export interface WelcomeOverview {
  isConnected: boolean;
  triggers: Record<WelcomeTrigger, { sent7d: number; failed7d: number }>;
  recent: {
    id: string;
    trigger: WelcomeTrigger;
    template: string;
    userId: string;
    userName: string | null;
    phone: string;
    /** Set for an account with a driver profile (its driver page). */
    driverId: string | null;
    createdAt: string;
    sentAt: string | null;
    error: string | null;
  }[];
}

/**
 * WhatsApp welcome messages through WATX (Admin › Engage › Automations). Listens to the domain events of each
 * trigger (a rider finishing sign-up, a driver registering, a driver approved) and sends its approved template once
 * per account, when switched on. Listener errors are logged by the event emitter and never reach the request.
 */
@Injectable()
export class WelcomeService {
  private readonly logger = new Logger(WelcomeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly watx: WatxClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @OnEvent(DomainEvents.RiderSignedUp, { async: true })
  async onRiderSignedUp(e: RiderSignedUpEvent): Promise<void> {
    await this.deliver(e.userId, WelcomeTrigger.RIDER_SIGNUP);
  }

  @OnEvent(DomainEvents.DriverRegistered, { async: true })
  async onDriverRegistered(e: DriverRegisteredEvent): Promise<void> {
    await this.deliver(e.userId, WelcomeTrigger.DRIVER_REGISTERED);
  }

  @OnEvent(DomainEvents.DriverApproved, { async: true })
  async onDriverApproved(e: DriverApprovedEvent): Promise<void> {
    const driver = await this.prisma.driver.findUnique({ where: { id: e.driverId }, select: { userId: true } });
    if (driver) await this.deliver(driver.userId, WelcomeTrigger.DRIVER_APPROVED);
  }

  /**
   * Sends unless WATX isn't set up, the trigger is off or has no template, the account is blocked, deleted or a
   * store-review number, or it already got this welcome: the row is claimed before the send, so two calls at once
   * send one message. The row keeps the outcome (sent, or WhatsApp's reason). True when it was sent.
   */
  async deliver(userId: string, trigger: WelcomeTrigger): Promise<boolean> {
    if (!this.watx.isEnabled) return false;
    const s = await this.settings.all();
    const keys = WELCOME_SETTINGS[trigger];
    const template = String(s[keys.template]).trim();
    if (s[keys.enabled] !== true || !template) return false;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { phone: true, name: true, isBlocked: true, deletedAt: true } });
    if (!user || user.isBlocked || user.deletedAt || this.env.reviewPhones.includes(user.phone)) return false;
    let id: string;
    try {
      ({ id } = await this.prisma.welcomeMessage.create({ data: { userId, trigger, template }, select: { id: true } }));
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') return false;
      throw e;
    }
    const error = await this.watx.send(user.phone, template, [welcomeName(user.name)]);
    await this.prisma.welcomeMessage.update({ where: { id }, data: error === null ? { sentAt: new Date() } : { error } });
    if (error === null) this.logger.log(`Welcome ${trigger} sent to ${userId}`);
    return error === null;
  }

  /**
   * Admin › Send test: [trigger]'s template ([template], else the saved one) to the admin's own WhatsApp, with their
   * first name. Null when WATX took it, else why not. Not recorded. 409 when WATX isn't set up.
   */
  async test(adminId: string, trigger: WelcomeTrigger, template?: string): Promise<string | null> {
    if (!this.watx.isEnabled) throw new ConflictException("WhatsApp isn't set up on this server (WATX_API_KEY is empty)");
    const name = template?.trim() || String(await this.settings.get(WELCOME_SETTINGS[trigger].template)).trim();
    if (!name) throw new ConflictException('Add the template name first');
    const admin = await this.prisma.user.findUniqueOrThrow({ where: { id: adminId }, select: { phone: true, name: true } });
    return this.watx.send(admin.phone, name, [welcomeName(admin.name)]);
  }

  /** Is WATX set up; per trigger, messages sent and failed in the last 7 days; the newest [RECENT]. */
  async overview(now = new Date()): Promise<WelcomeOverview> {
    const since = new Date(now.getTime() - 7 * DAY_MS);
    const [counts, recent] = await Promise.all([
      this.prisma.welcomeMessage.groupBy({ by: ['trigger'], where: { createdAt: { gte: since } }, _count: { sentAt: true, error: true } }),
      this.prisma.welcomeMessage.findMany({
        orderBy: { createdAt: 'desc' },
        take: RECENT,
        include: { user: { select: { name: true, phone: true, driver: { select: { id: true } } } } },
      }),
    ]);
    const of = (trigger: WelcomeTrigger) => {
      const row = counts.find((c) => c.trigger === trigger);
      return { sent7d: row?._count.sentAt ?? 0, failed7d: row?._count.error ?? 0 };
    };
    return {
      isConnected: this.watx.isEnabled,
      triggers: {
        [WelcomeTrigger.RIDER_SIGNUP]: of(WelcomeTrigger.RIDER_SIGNUP),
        [WelcomeTrigger.DRIVER_REGISTERED]: of(WelcomeTrigger.DRIVER_REGISTERED),
        [WelcomeTrigger.DRIVER_APPROVED]: of(WelcomeTrigger.DRIVER_APPROVED),
      },
      recent: recent.map((m) => ({
        id: m.id,
        trigger: m.trigger,
        template: m.template,
        userId: m.userId,
        userName: m.user.name,
        phone: m.user.phone,
        driverId: m.user.driver?.id ?? null,
        createdAt: m.createdAt.toISOString(),
        sentAt: m.sentAt?.toISOString() ?? null,
        error: m.error,
      })),
    };
  }
}
