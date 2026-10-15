import { Injectable, Logger, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';

import type { Job } from '../../core/jobs/job-runner.js';
import { JobsService } from '../../core/jobs/jobs.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AppKind, ReminderKind, TripStatus } from '../../generated/prisma/enums.js';
import { PushService } from '../notifications/push.service.js';
import type { Settings } from '../settings/settings.defaults.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  BOOKED_WITHIN_MIN,
  dedupeBlock,
  findRoutines,
  isQuietHour,
  istDayStart,
  istMinuteOfDay,
  placeKey,
  pointData,
  type ReminderPoint,
  type Routine,
  ROUTINE_LOOKBACK_DAYS,
  ROUTINE_SCAN_EVERY_MS,
  ROUTINE_SCAN_ID,
  ROUTINE_SCAN_JOB,
  ROUTINE_WINDOW_MIN,
  routineReminderText,
  type RoutineTrip,
  SEARCH_REMINDER_JOB,
  searchReminderText,
} from './reminders.js';

/** A rider on one of these has a trip going: no reminders. */
const ONGOING: TripStatus[] = [TripStatus.SEARCHING, TripStatus.DRIVER_ASSIGNED, TripStatus.DRIVER_ARRIVED, TripStatus.IN_PROGRESS, TripStatus.PICKED_UP];

const DAY_MS = 86_400_000;

/** What a fare quote leaves for the search reminder job. */
export interface SearchPayload {
  readonly quotedAt: string;
  readonly mode: 'LOCAL' | 'OUTSTATION';
  readonly pickup: ReminderPoint;
  readonly drop: ReminderPoint;
}

/** A point from a quote (name and address optional). */
type QuotePoint = { lat: number; lng: number; name?: string; address?: string };

/** Admin › Automations. "Booked" = the rider booked a trip within an hour of the reminder. */
export interface AutomationStats {
  search: { sent7d: number; booked7d: number };
  routine: { sent7d: number; booked7d: number };
  recent: {
    id: string;
    kind: ReminderKind;
    userId: string;
    userName: string | null;
    phone: string;
    title: string;
    body: string;
    sentAt: string;
    booked: boolean;
  }[];
}

const point = (p: QuotePoint): ReminderPoint => ({ name: p.name?.trim() ?? '', address: p.address?.trim() ?? '', lat: p.lat, lng: p.lng });

/**
 * Reminder pushes to riders, Ola / Rapido style (settings "Automations"), on the `suggestions` channel:
 * - search: a ride quote with a drop and no booking `searchReminderDelayMin` later → "Siva, Ooty?" (job
 *   `reminder.search`, one per rider: a newer quote replaces it);
 * - usual trip: every 5 minutes (job `reminder.routine-scan`) completed local rides to the same drop at about the
 *   same time of day → "Going to <drop>?" `routineLeadMin` before the usual time.
 * Neither goes out in the quiet hours, past `reminderDailyCap` a day, twice about the same drop (search: 24 h, usual
 * trip: the IST day), to a blocked or deleted rider, or while the rider has a trip going. Each one sent is a
 * `Reminder` row (the cap, the dedupe and the admin stats count them).
 */
@Injectable()
export class AutomationsService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(AutomationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly push: PushService,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit(): void {
    this.jobs.register(SEARCH_REMINDER_JOB, (j: Job<SearchPayload>) => this.searchReminder(j.id, j.payload));
    this.jobs.register(ROUTINE_SCAN_JOB, () => this.routineScan());
  }

  /** Starts the usual-trip scan unless it is already scheduled (one entry per job key: restarts never pile it up). */
  async onApplicationBootstrap(): Promise<void> {
    if ((await this.jobs.scheduledAt(ROUTINE_SCAN_JOB, ROUTINE_SCAN_ID)) === null) {
      await this.jobs.schedule(ROUTINE_SCAN_JOB, ROUTINE_SCAN_ID, Date.now() + ROUTINE_SCAN_EVERY_MS);
    }
  }

  /** A rider got a ride quote with a drop (fares controller): remind them later unless they book. Never throws. */
  searched(p: { userId: string; mode: 'LOCAL' | 'OUTSTATION'; pickup: QuotePoint; drop: QuotePoint }): void {
    void this.scheduleSearch(p).catch((e: Error) => this.logger.warn(`Search reminder for ${p.userId} not scheduled: ${e.message}`));
  }

  private async scheduleSearch(p: { userId: string; mode: 'LOCAL' | 'OUTSTATION'; pickup: QuotePoint; drop: QuotePoint }): Promise<void> {
    const s = await this.settings.all();
    if (!s.searchReminderEnabled) return;
    const payload: SearchPayload = { quotedAt: new Date().toISOString(), mode: p.mode, pickup: point(p.pickup), drop: point(p.drop) };
    await this.jobs.schedule(SEARCH_REMINDER_JOB, p.userId, Date.now() + s.searchReminderDelayMin * 60_000, payload);
  }

  /** The search job: "Siva, Ooty?" unless the rider booked since the quote (or anything else stops it). */
  async searchReminder(userId: string, p: SearchPayload, now = new Date()): Promise<void> {
    const s = await this.settings.all();
    if (!s.searchReminderEnabled || isQuietHour(now, s)) return;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, isBlocked: true, deletedAt: true } });
    if (!user || user.isBlocked || user.deletedAt) return;
    const trip = await this.prisma.trip.findFirst({
      where: { passengerId: userId, OR: [{ createdAt: { gte: new Date(p.quotedAt) } }, { status: { in: ONGOING } }] },
      select: { id: true },
    });
    if (trip) return;
    const place = placeKey(p.drop);
    if (await this.isDeduped(userId, place, new Date(now.getTime() - DAY_MS), now, s)) return;
    await this.send(userId, ReminderKind.SEARCH, place, searchReminderText({ userName: user.name, dropName: p.drop.name, mode: p.mode }), {
      type: 'suggest',
      kind: 'search',
      mode: p.mode,
      ...pointData('drop', p.drop),
      ...pointData('pickup', p.pickup),
    });
  }

  /** The repeating scan job: the next run is scheduled first, so a failing scan never stops it. */
  async routineScan(): Promise<void> {
    await this.jobs.schedule(ROUTINE_SCAN_JOB, ROUTINE_SCAN_ID, Date.now() + ROUTINE_SCAN_EVERY_MS);
    try {
      await this.scanRoutines(new Date());
    } catch (e) {
      this.logger.warn(`Usual-trip scan failed: ${(e as Error).message}`);
    }
  }

  /** Reminds every rider whose usual trip is `routineLeadMin` away. Returns how many were sent. */
  async scanRoutines(now: Date): Promise<number> {
    const s = await this.settings.all();
    if (!s.routineReminderEnabled || isQuietHour(now, s)) return 0;
    const target = new Date(now.getTime() + s.routineLeadMin * 60_000);
    const targetMin = istMinuteOfDay(target);
    const trips = await this.routineTrips(target, targetMin, now);
    let sent = 0;
    for (const r of findRoutines(trips, { now, targetMin, leadMin: s.routineLeadMin, minDays: s.routineMinTrips })) {
      if (await this.remindRoutine(r, now, s)) sent++;
    }
    return sent;
  }

  /**
   * Completed local rides of the last 28 days by riders who aren't blocked or deleted, booked (IST) within
   * ±[ROUTINE_WINDOW_MIN] of [targetMin] on the same day type as [target] (Mon–Fri or Sat–Sun).
   */
  private routineTrips(target: Date, targetMin: number, now: Date): Promise<RoutineTrip[]> {
    const ist = Prisma.sql`(t."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')`;
    const gap = Prisma.sql`ABS(EXTRACT(HOUR FROM ${ist}) * 60 + EXTRACT(MINUTE FROM ${ist}) - ${targetMin})`;
    const weekday = new Date(target.getTime() + 330 * 60_000).getUTCDay();
    return this.prisma.$queryRaw<RoutineTrip[]>`
      SELECT t."passengerId", t."createdAt", t."vehicleKind", t."pickupName", t."pickupAddr", t."pickupLat", t."pickupLng",
             t."dropName", t."dropAddr", t."dropLat", t."dropLng"
      FROM "Trip" t JOIN "User" u ON u.id = t."passengerId"
      WHERE t.status = 'COMPLETED' AND t.kind = 'RIDE' AND t."rideMode" = 'LOCAL'
        AND t."createdAt" >= ${new Date(now.getTime() - ROUTINE_LOOKBACK_DAYS * DAY_MS)}
        AND NOT u."isBlocked" AND u."deletedAt" IS NULL
        AND (EXTRACT(ISODOW FROM ${ist}) >= 6) = ${weekday === 0 || weekday === 6}
        AND LEAST(${gap}, 1440 - ${gap}) <= ${ROUTINE_WINDOW_MIN}`;
  }

  /** Sends one usual-trip reminder unless the rider has a trip going, booked in the last hour, or is capped / deduped. */
  private async remindRoutine(r: Routine, now: Date, s: Settings): Promise<boolean> {
    const trip = await this.prisma.trip.findFirst({
      where: { passengerId: r.passengerId, OR: [{ status: { in: ONGOING } }, { createdAt: { gte: new Date(now.getTime() - BOOKED_WITHIN_MIN * 60_000) } }] },
      select: { id: true },
    });
    if (trip || (await this.isDeduped(r.passengerId, r.place, istDayStart(now), now, s))) return false;
    await this.send(r.passengerId, ReminderKind.ROUTINE, r.place, routineReminderText({ dropName: r.drop.name, usualMin: r.usualMin, vehicle: r.vehicle }), {
      type: 'suggest',
      kind: 'routine',
      mode: 'LOCAL',
      vehicle: r.vehicle,
      ...pointData('drop', r.drop),
      ...pointData('pickup', r.pickup),
    });
    return true;
  }

  /** The daily cap is reached, or [place] was reminded since [placeSince]. */
  private async isDeduped(userId: string, place: string, placeSince: Date, now: Date, s: Settings): Promise<boolean> {
    const dayStart = istDayStart(now);
    const sent = await this.prisma.reminder.findMany({
      where: { userId, sentAt: { gte: placeSince < dayStart ? placeSince : dayStart } },
      select: { place: true, sentAt: true },
    });
    return dedupeBlock({ now, sent, place, placeSince, dailyCap: s.reminderDailyCap }) !== null;
  }

  private async send(userId: string, kind: ReminderKind, place: string, text: { title: string; body: string }, data: Record<string, string>): Promise<void> {
    await this.prisma.reminder.create({ data: { userId, kind, place, ...text } });
    this.push.toUser(userId, AppKind.PASSENGER, { ...text, channel: 'suggestions', data });
    this.logger.log(`Reminder ${kind} to ${userId}: ${text.title}`);
  }

  /** Last 7 days' reminders sent and booked by kind, and the newest 20. */
  async stats(now = new Date()): Promise<AutomationStats> {
    const booked = Prisma.sql`EXISTS (SELECT 1 FROM "Trip" t WHERE t."passengerId" = r."userId" AND t."createdAt" >= r."sentAt"
      AND t."createdAt" < r."sentAt" + ${BOOKED_WITHIN_MIN} * INTERVAL '1 minute')`;
    const [totals, recent] = await Promise.all([
      this.prisma.$queryRaw<{ kind: ReminderKind; sent: number; booked: number }[]>`
        SELECT r.kind, COUNT(*)::int AS sent, (COUNT(*) FILTER (WHERE ${booked}))::int AS booked
        FROM "Reminder" r WHERE r."sentAt" >= ${new Date(now.getTime() - 7 * DAY_MS)} GROUP BY r.kind`,
      this.prisma.$queryRaw<(Omit<AutomationStats['recent'][number], 'sentAt'> & { sentAt: Date })[]>`
        SELECT r.id, r.kind, r."userId", u.name AS "userName", u.phone, r.title, r.body, r."sentAt", ${booked} AS booked
        FROM "Reminder" r JOIN "User" u ON u.id = r."userId"
        ORDER BY r."sentAt" DESC LIMIT 20`,
    ]);
    const of = (kind: ReminderKind) => {
      const row = totals.find((t) => t.kind === kind);
      return { sent7d: row?.sent ?? 0, booked7d: row?.booked ?? 0 };
    };
    return { search: of(ReminderKind.SEARCH), routine: of(ReminderKind.ROUTINE), recent: recent.map((r) => ({ ...r, sentAt: r.sentAt.toISOString() })) };
  }
}
