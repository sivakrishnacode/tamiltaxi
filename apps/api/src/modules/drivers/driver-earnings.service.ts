import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service.js';
import { RedisService } from '../../core/redis/redis.service.js';
import { TripStatus } from '../../generated/prisma/enums.js';

export const EARNINGS_PERIODS = ['today', 'week', 'month'] as const;
export type EarningsPeriod = (typeof EARNINGS_PERIODS)[number];

const DAY_MS = 86_400_000;
const IST_MS = 5.5 * 3600_000;
/** Commission apps take about 30% of fares; Tamil Taxi takes none (drivers pay a flat plan). */
const COMMISSION_RATE = 0.3;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** `driver:online_since:<id>`: when the open online session started (epoch ms). */
export const onlineSessionKey = (driverId: string): string => `driver:online_since:${driverId}`;
/** An open session with no go-online and no GPS fix for this long is dropped (the app died without going offline). */
export const ONLINE_SESSION_TTL_S = 6 * 3600;
const HOUR_BUCKETS = [6, 8, 10, 12, 14, 16, 18, 20, 22];

export interface Earnings {
  period: EarningsPeriod;
  total: number;
  rides: number;
  onlineHours: number;
  rating: number;
  commissionSaved: number;
  bars: { label: string; amount: number; rides: number }[];
  trips: {
    id: string;
    at: string;
    from: string;
    to: string;
    fare: number;
    /** Part of [fare] paid for waiting at the pickup (0 = none). */
    waitingCharge: number;
    /** Part of [fare] that was the passenger's earlier cancellation fee (collected by this driver, owed to another). */
    previousCancellationFee: number;
    /** Part of [fare] the rider added while nobody had taken the trip ("+₹20"). */
    extra: number;
    paymentMode: string;
    distanceKm: number;
    durationMin: number;
    passengerName: string;
    isDelivery: boolean;
    /** A meter trip (D-42): a passenger picked up off the app; [from] is where it started, no [to] or passenger. */
    isMeter: boolean;
  }[];
}

/** A whole-rupee line of a stored fare JSON (0 when missing). */
export function fareLine(fare: unknown, key: string): number {
  const v = fare && typeof fare === 'object' ? (fare as Record<string, unknown>)[key] : undefined;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** IST calendar day (yyyy-mm-dd) of [d]. */
export function istDay(d: Date): string {
  return new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
}

/** Start of the IST day containing [d], as a UTC instant. */
function istMidnight(d: Date): Date {
  const shifted = new Date(d.getTime() + IST_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - IST_MS);
}

function hourLabel(h: number): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * Driver earnings (D-23): today in 2-hour buckets, the last 7 days, or the last 4 weeks. Booked trips and meter trips
 * (D-42, passengers picked up off the app) both count; commission saved is on booked trips only. Online time is
 * tracked per IST day in Redis when the driver goes online / offline (no Google calls, no extra tables).
 */
@Injectable()
export class DriverEarningsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async summary(driverId: string, period: EarningsPeriod, now = new Date()): Promise<Earnings> {
    const today = istMidnight(now);
    const days = period === 'today' ? 1 : period === 'week' ? 7 : 28;
    const from = new Date(today.getTime() - (days - 1) * DAY_MS);
    const [driver, trips, meterTrips] = await Promise.all([
      this.prisma.driver.findUniqueOrThrow({ where: { id: driverId }, select: { rating: true } }),
      this.prisma.trip.findMany({
        where: { driverId, status: { in: [TripStatus.COMPLETED, TripStatus.DELIVERED] }, endedAt: { gte: from } },
        orderBy: { endedAt: 'desc' },
        include: { passenger: { select: { name: true } } },
      }),
      this.prisma.meterTrip.findMany({ where: { driverId, endedAt: { gte: from } }, orderBy: { endedAt: 'desc' } }),
    ]);

    const bars =
      period === 'today'
        ? HOUR_BUCKETS.map((h) => ({ label: hourLabel(h), start: today.getTime() + h * 3600_000, end: today.getTime() + (h + 2) * 3600_000 }))
        : period === 'week'
          ? Array.from({ length: 7 }, (_, i) => {
              const start = from.getTime() + i * DAY_MS;
              return { label: WEEKDAYS[new Date(start + IST_MS).getUTCDay()], start, end: start + DAY_MS };
            })
          : Array.from({ length: 4 }, (_, i) => ({ label: `W${i + 1}`, start: from.getTime() + i * 7 * DAY_MS, end: from.getTime() + (i + 1) * 7 * DAY_MS }));
    const out = bars.map((b) => ({ label: b.label, amount: 0, rides: 0 }));
    const paid = [
      ...trips.map((t) => ({ at: t.endedAt!.getTime(), fare: t.fareTotal })),
      ...meterTrips.map((m) => ({ at: m.endedAt.getTime(), fare: m.fare })),
    ];
    for (const { at, fare } of paid) {
      // Trips before the first / after the last "today" bucket count in the nearest one.
      let i = bars.findIndex((b) => at >= b.start && at < b.end);
      if (i < 0) i = at < bars[0].start ? 0 : bars.length - 1;
      out[i].amount += fare;
      out[i].rides++;
    }

    const booked = trips.reduce((a, t) => a + t.fareTotal, 0);
    const list: Earnings['trips'] = [
      ...trips.slice(0, 50).map((t) => ({
        id: t.id,
        at: t.endedAt!.toISOString(),
        from: t.pickupName,
        to: t.dropName,
        fare: t.fareTotal,
        waitingCharge: fareLine(t.fare, 'waitingCharge'),
        previousCancellationFee: fareLine(t.fare, 'previousCancellationFee'),
        extra: fareLine(t.fare, 'extra'),
        paymentMode: t.paymentMode,
        distanceKm: t.distanceKm,
        durationMin: t.startedAt && t.endedAt ? Math.max(1, Math.round((t.endedAt.getTime() - t.startedAt.getTime()) / 60_000)) : t.durationMin,
        passengerName: t.passenger.name ?? 'Tamil Taxi customer',
        isDelivery: t.kind === 'PARCEL',
        isMeter: false,
      })),
      ...meterTrips.slice(0, 50).map((m) => ({
        id: m.id,
        at: m.endedAt.toISOString(),
        from: m.startName ?? 'Meter trip',
        to: '',
        fare: m.fare,
        waitingCharge: 0,
        previousCancellationFee: 0,
        extra: 0,
        // Not asked: the meter's Done covers cash and UPI.
        paymentMode: 'CASH',
        distanceKm: m.distanceKm,
        durationMin: m.durationMin,
        passengerName: '',
        isDelivery: false,
        isMeter: true,
      })),
    ];
    list.sort((a, b) => b.at.localeCompare(a.at));
    return {
      period,
      total: booked + meterTrips.reduce((a, m) => a + m.fare, 0),
      rides: trips.length + meterTrips.length,
      onlineHours: Math.round((await this.onlineSeconds(driverId, from, days, now)) / 360) / 10,
      rating: driver.rating,
      // Street pickups pay no app a commission anyway.
      commissionSaved: Math.round((booked * COMMISSION_RATE) / 10) * 10,
      bars: out,
      trips: list.slice(0, 50),
    };
  }

  /**
   * Called when the driver goes online (also again on every app resume: the session keeps its start). The key lives
   * [ONLINE_SESSION_TTL_S] from the last go-online or GPS fix ([DriverLocationService.update] refreshes it), so an
   * app that died without going offline doesn't count as online for ever.
   */
  async sessionStarted(driverId: string, now = new Date()): Promise<void> {
    const key = onlineSessionKey(driverId);
    await this.redis.multi().set(key, String(now.getTime()), 'EX', ONLINE_SESSION_TTL_S, 'NX').expire(key, ONLINE_SESSION_TTL_S).exec();
  }

  /** Called when the driver goes offline: adds the session to its IST day. */
  async sessionEnded(driverId: string, now = new Date()): Promise<void> {
    const since = Number(await this.redis.getdel(onlineSessionKey(driverId)));
    if (!since) return;
    const key = `driver:online_secs:${driverId}:${istDay(new Date(since))}`;
    await this.redis.incrby(key, Math.max(0, Math.round((now.getTime() - since) / 1000)));
    await this.redis.expire(key, 40 * 86_400);
  }

  private async onlineSeconds(driverId: string, from: Date, days: number, now: Date): Promise<number> {
    const keys = Array.from({ length: days }, (_, i) => `driver:online_secs:${driverId}:${istDay(new Date(from.getTime() + i * DAY_MS + DAY_MS / 2))}`);
    const [values, since] = await Promise.all([this.redis.mget(...keys), this.redis.get(onlineSessionKey(driverId))]);
    const open = since ? Math.max(0, (now.getTime() - Math.max(Number(since), from.getTime())) / 1000) : 0;
    return values.reduce((a, v) => a + Number(v ?? 0), 0) + open;
  }
}
