import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { cellToLatLng, gridDisk } from 'h3-js';

import { PrismaService } from '../../core/prisma/prisma.service.js';
import { RedisService } from '../../core/redis/redis.service.js';
import { TripStatus } from '../../generated/prisma/enums.js';
import { SettingsService } from '../settings/settings.service.js';
import { cellAt } from './h3.util.js';
import { DemandLevel, smoothSurge, surgeFor } from './surge.js';

/** Demand is measured on res-7 hexes (≈5 km²): big enough to have signal, small enough to be local. */
export const DEMAND_RES = 7;
const SNAPSHOT_KEY = 'h3:demand:snapshot';
/** The cells that have an `h3:surge:<cell>` multiplier now. */
export const SURGE_CELLS_KEY = 'h3:surge-cells';
const SURGE_TTL_S = 180;
const TICK_MS = 60_000;
/**
 * Drivers last heard from in each res-7 cell (`driver-location.service.ts` writes it on every fix and keeps it when
 * the driver goes offline): member = driver id, score = when the server last heard from them (epoch ms).
 */
export const seenDriversKey = (cell: string): string => `h3:seen:${cell}`;
/** Longer than the longest demand window the admin can set (120 min). */
export const SEEN_TTL_S = 3 * 3600;
/** A rider who cancels this soon after the search starts, before any driver took the trip, isn't counted as demand. */
export const QUICK_CANCEL_MS = 60_000;

/**
 * The rider cancelled [trip] within [QUICK_CANCEL_MS] of its search starting, while it was still searching and no
 * driver had ever taken it: a booking made only to light up an area. One the rider waited on and gave up is real.
 */
export function isQuickCancel(trip: { status: TripStatus; reassignCount: number; searchFrom: Date }, now = Date.now()): boolean {
  return trip.status === TripStatus.SEARCHING && trip.reassignCount === 0 && now - trip.searchFrom.getTime() < QUICK_CANCEL_MS;
}

/** One hexagon's live demand vs supply. */
export interface DemandCell {
  readonly cell: string;
  readonly lat: number;
  readonly lng: number;
  readonly requests: number;
  readonly freeDrivers: number;
  readonly ratio: number;
  readonly multiplier: number;
  readonly level: DemandLevel;
}

export interface DemandSnapshot {
  readonly at: string;
  readonly windowMin: number;
  readonly cells: DemandCell[];
}

/**
 * Live demand vs supply per H3 cell (owner H3 plan):
 * bookings increment a per-minute counter for their res-7 cell; once a minute the snapshot sums the
 * last `demandWindowMin` minutes, counts free drivers in the cell (heard from there in the window, `h3:seen`), and
 * writes a surge multiplier per cell (`h3:surge:<cell>`) that fares use, plus a snapshot for the
 * driver app's "High demand" areas and the admin panel. A Redis lock keeps it to one instance.
 *
 * Guarded against fake demand (drivers booking from spare phones to make an area surge): only riders with a finished
 * trip count, never a driver's own account, quick cancels are taken back out, and drivers who went offline in the
 * window still count as supply (system-design-notes.md, 5 Nov 2026).
 */
@Injectable()
export class DemandService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DemandService.name);
  private ticker: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit(): void {
    this.ticker = setInterval(() => void this.refresh().catch((e: Error) => this.logger.warn(e.message)), TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.ticker) clearInterval(this.ticker);
  }

  private static bucket(ms: number): number {
    return Math.floor(ms / 60_000);
  }

  /**
   * Counts a booking at [point] in the current minute, **once per passenger**: someone re-booking or retrying
   * another vehicle is still one rider, so a single person can't create surge on their own. Only a rider with a
   * finished trip counts, and never a driver's own account: a spare-phone account must pay for a real trip first.
   */
  async recordRequest(point: { lat: number; lng: number }, passengerId: string): Promise<void> {
    if (!(await this.countsAsDemand(passengerId))) return;
    const cell = cellAt(point.lat, point.lng, DEMAND_RES);
    const b = DemandService.bucket(Date.now());
    const ttl = ((await this.settings.get('demandWindowMin')) + 5) * 60;
    const riders = `h3:riders:${b}:${cell}`;
    await this.redis.multi().sadd(riders, passengerId).expire(riders, ttl).sadd(`h3:req:${b}`, cell).expire(`h3:req:${b}`, ttl).exec();
  }

  /** Takes a quick cancel ([isQuickCancel]) back out of demand: the rider's count since [searchFrom] at [point]. */
  async forgetRequest(point: { lat: number; lng: number }, passengerId: string, searchFrom: Date): Promise<void> {
    const cell = cellAt(point.lat, point.lng, DEMAND_RES);
    const tx = this.redis.multi();
    for (let b = DemandService.bucket(searchFrom.getTime()); b <= DemandService.bucket(Date.now()); b++) tx.srem(`h3:riders:${b}:${cell}`, passengerId);
    await tx.exec();
  }

  /** A rider with at least one finished ride or delivery, who isn't a driver. */
  private async countsAsDemand(passengerId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: passengerId },
      select: { driver: { select: { id: true } }, trips: { where: { status: { in: [TripStatus.COMPLETED, TripStatus.DELIVERED] } }, select: { id: true }, take: 1 } },
    });
    return !!user && !user.driver && user.trips.length > 0;
  }

  /** Live surge multiplier at [point] (1 when none or disabled). */
  async surgeAt(point: { lat: number; lng: number }): Promise<number> {
    if (!(await this.settings.get('dynamicSurgeEnabled'))) return 1;
    const v = await this.redis.get(`h3:surge:${cellAt(point.lat, point.lng, DEMAND_RES)}`);
    return v ? Number(v) : 1;
  }

  async snapshot(): Promise<DemandSnapshot> {
    const raw = await this.redis.get(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as DemandSnapshot) : this.refresh(true);
  }

  /** Recomputes demand, supply and surge for every cell with recent bookings. */
  async refresh(force = false): Promise<DemandSnapshot> {
    const s = await this.settings.all();
    if (!force && !(await this.redis.set('h3:demand:lock', '1', 'PX', TICK_MS - 5_000, 'NX'))) return this.snapshot();
    const now = DemandService.bucket(Date.now());
    const buckets = Array.from({ length: s.demandWindowMin }, (_, i) => now - i);
    const cells = buckets.length ? await this.redis.sunion(...buckets.map((b) => `h3:req:${b}`)) : [];
    const result: DemandCell[] = [];
    for (const cell of cells) {
      // Distinct passengers who booked here in the window (sets of passenger ids per minute).
      const requests = (await this.redis.sunion(...buckets.map((b) => `h3:riders:${b}:${cell}`))).length;
      const freeDrivers = await this.freeDriversIn(cell, s.demandWindowMin);
      const { ratio, multiplier, level } = surgeFor({ requests, freeDrivers, sensitivity: s.surgeSensitivity, minRequests: s.surgeMinRequests, maxMultiplier: s.maxMultiplier });
      const [lat, lng] = cellToLatLng(cell);
      result.push({ cell, lat, lng, requests, freeDrivers, ratio: Math.round(ratio * 100) / 100, multiplier, level });
    }
    // Smooth across ring-1 neighbours so prices don't jump at hex edges, then publish per cell.
    const raw = new Map(result.map((c) => [c.cell, c.multiplier]));
    const smoothed = smoothSurge(raw, (c) => gridDisk(c, 1));
    // The cells surging last time are a set (not a KEYS scan of the whole keyspace every minute).
    const previous = await this.redis.smembers(SURGE_CELLS_KEY);
    const tx = this.redis.multi();
    for (const cell of previous) if (!smoothed.has(cell)) tx.del(`h3:surge:${cell}`);
    tx.del(SURGE_CELLS_KEY);
    for (const [cell, m] of smoothed) tx.set(`h3:surge:${cell}`, String(m), 'EX', SURGE_TTL_S);
    if (smoothed.size > 0) tx.sadd(SURGE_CELLS_KEY, ...smoothed.keys()).expire(SURGE_CELLS_KEY, SURGE_TTL_S);
    await tx.exec();
    for (const c of result) (c as { multiplier: number }).multiplier = smoothed.get(c.cell) ?? 1;
    const snap: DemandSnapshot = { at: new Date().toISOString(), windowMin: s.demandWindowMin, cells: result.sort((a, b) => b.ratio - a.ratio) };
    await this.redis.set(SNAPSHOT_KEY, JSON.stringify(snap), 'EX', 180);
    return snap;
  }

  /**
   * Drivers of any vehicle kind last heard from inside a res-7 cell in the last [windowMin] minutes and not on a trip,
   * **including those who went offline meanwhile** (like demand, supply counts the whole window): drivers going
   * offline together can't make an area surge.
   */
  private async freeDriversIn(cell: string, windowMin: number): Promise<number> {
    const key = seenDriversKey(cell);
    await this.redis.zremrangebyscore(key, '-inf', `(${Date.now() - windowMin * 60_000}`);
    let free = 0;
    for (const id of await this.redis.zrange(key, '0', '-1')) if (!(await this.redis.exists(`driver:busy:${id}`))) free++;
    return free;
  }
}
