import { Injectable, Logger, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';
import { cellToParent } from 'h3-js';

import { JobsService } from '../../core/jobs/jobs.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { RedisService } from '../../core/redis/redis.service.js';
import { DriverStatus, ZoneKind } from '../../generated/prisma/enums.js';
import { MISSED_SQL } from '../admin/admin-missed.service.js';
import { cellAt } from '../geo/h3.util.js';
import { isZoneLive } from '../geo/zone-schedule.js';
import { NotifierService } from '../notifications/notifier.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { isQuietHour } from './reminders.js';

export const ZONE_NUDGE_JOB = 'nudge.zone-scan';
const ZONE_NUDGE_ID = 'all';
const SCAN_EVERY_MS = 5 * 60_000;
/** The window a zone's unserved riders are counted over. */
const WINDOW_MS = 15 * 60_000;
/** Busy: at least this many riders unserved or still searching... */
export const MIN_WAITING = 2;
/** ...and at most this many free drivers inside. */
export const MAX_FREE = 1;
const ZONE_COOLDOWN_S = 30 * 60;
const DRIVER_COOLDOWN_S = 60 * 60;
const TRIP_RES = 8;

/** A busy zone: riders went unserved (or still search) and hardly any driver is free inside. */
export function isBusy(waiting: number, freeDrivers: number): boolean {
  return waiting >= MIN_WAITING && freeDrivers <= MAX_FREE;
}

/** The push to an offline driver about a busy zone. */
export function nudgeText(zoneName: string, waiting: number): { title: string; body: string } {
  return {
    title: `Riders are waiting: ${zoneName}`,
    body: `${waiting} ${waiting === 1 ? 'rider' : 'riders'} there couldn't get a driver in the last 15 minutes. Go online to take the next one.`,
  };
}

/**
 * Busy-zone nudges: every 5 minutes (job `nudge.zone-scan`), each live DEMAND or SURGE zone with `nudgeDrivers` on
 * that is busy ([isBusy]: unserved or searching riders picked up there in the last 15 minutes, free drivers inside
 * now) pushes the city's approved offline drivers. Never in the reminders' quiet hours, a zone at most every 30 minutes,
 * a driver at most once an hour (Redis `nudge:zone:<id>`, `nudge:driver:<id>`).
 */
@Injectable()
export class ZoneNudgesService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(ZoneNudgesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jobs: JobsService,
    private readonly notifier: NotifierService,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit(): void {
    this.jobs.register(ZONE_NUDGE_JOB, () => this.scanJob());
  }

  async onApplicationBootstrap(): Promise<void> {
    if ((await this.jobs.scheduledAt(ZONE_NUDGE_JOB, ZONE_NUDGE_ID)) === null) {
      await this.jobs.schedule(ZONE_NUDGE_JOB, ZONE_NUDGE_ID, Date.now() + SCAN_EVERY_MS);
    }
  }

  private async scanJob(): Promise<void> {
    await this.jobs.schedule(ZONE_NUDGE_JOB, ZONE_NUDGE_ID, Date.now() + SCAN_EVERY_MS);
    try {
      const sent = await this.scan(new Date());
      if (sent) this.logger.log(`Busy-zone nudges: ${sent} sent`);
    } catch (e) {
      this.logger.warn(`Busy-zone scan failed: ${(e as Error).message}`);
    }
  }

  /** Nudges drivers about the busy zones now. Returns how many pushes went out. */
  async scan(now: Date): Promise<number> {
    if (isQuietHour(now, await this.settings.all())) return 0;
    const zones = (
      await this.prisma.zone.findMany({
        where: { nudgeDrivers: true, isActive: true, kind: { in: [ZoneKind.DEMAND, ZoneKind.SURGE] }, city: { isActive: true } },
        include: { city: { select: { h3Resolution: true } } },
      })
    ).filter((z) => isZoneLive(z, now));
    if (zones.length === 0) return 0;

    const since = new Date(now.getTime() - WINDOW_MS);
    const [rows, online] = await Promise.all([
      this.prisma.$queryRaw<{ cell: string; waiting: bigint }[]>`
        SELECT "pickupCell" AS cell, COUNT(*) FILTER (WHERE status = 'SEARCHING' OR ${MISSED_SQL}) AS waiting
        FROM "Trip" WHERE "createdAt" >= ${since} AND "createdAt" <= ${now} AND "pickupCell" IS NOT NULL GROUP BY 1`,
      this.prisma.driver.findMany({ where: { isOnline: true }, select: { id: true } }),
    ]);
    // Free drivers' positions (busy = on a trip).
    const free: { lat: number; lng: number }[] = [];
    for (const d of online) {
      const [pos, busy] = await Promise.all([this.redis.get(`driver:alive:${d.id}`), this.redis.get(`driver:busy:${d.id}`)]);
      if (!pos || busy) continue;
      const [lat, lng] = pos.split(',').map(Number);
      free.push({ lat, lng });
    }

    let sent = 0;
    for (const zone of zones) {
      const res = zone.city.h3Resolution;
      const cells = new Set(zone.cells);
      const toZone = (cell: string) => (res < TRIP_RES ? cellToParent(cell, res) : cell);
      const waiting = rows.filter((r) => cells.has(toZone(r.cell))).reduce((a, r) => a + Number(r.waiting), 0);
      const freeInside = free.filter((p) => cells.has(cellAt(p.lat, p.lng, res))).length;
      if (!isBusy(waiting, freeInside)) continue;
      if ((await this.redis.set(`nudge:zone:${zone.id}`, '1', 'EX', ZONE_COOLDOWN_S, 'NX')) !== 'OK') continue;
      const drivers = await this.prisma.driver.findMany({
        where: { cityId: zone.cityId, status: DriverStatus.APPROVED, isOnline: false, user: { isBlocked: false, deletedAt: null } },
        select: { id: true },
      });
      const text = nudgeText(zone.name, waiting);
      for (const d of drivers) {
        if ((await this.redis.set(`nudge:driver:${d.id}`, '1', 'EX', DRIVER_COOLDOWN_S, 'NX')) !== 'OK') continue;
        void this.notifier.driverAccount({ driverId: d.id, kind: 'zone_busy', ...text });
        sent++;
      }
    }
    return sent;
  }
}
