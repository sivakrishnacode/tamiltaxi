import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { TripStatus } from '../../generated/prisma/enums.js';
import type { Paged } from './admin.types.js';

/**
 * A missed trip: the rider asked and got no driver. Either no driver was found (the search timed out, or the system
 * gave up after drivers kept dropping it), or it was cancelled while still searching (the rider gave up waiting).
 * "Booked by mistake" cancels are not misses. Columns of "Trip"; used by the counts, the heatmap's unmet metric and
 * the dashboard.
 */
export const NO_DRIVER_SQL = Prisma.sql`(status = 'NO_DRIVERS' OR (status = 'CANCELLED' AND "cancelCode" = 'NO_DRIVERS'))`;
export const GAVE_UP_SQL = Prisma.sql`(status = 'CANCELLED' AND "assignedAt" IS NULL AND "cancelledAt" >= "searchFrom"
  AND "cancelCode" IS DISTINCT FROM 'NO_DRIVERS' AND "cancelCode" IS DISTINCT FROM 'BOOKED_BY_MISTAKE')`;
export const MISSED_SQL = Prisma.sql`(${NO_DRIVER_SQL} OR ${GAVE_UP_SQL})`;

/** Hour of day in IST of a trip's booking (createdAt is stored in UTC). */
const HOUR_IST = Prisma.sql`EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'))::int`;

/** A finished or ongoing trip within this long after a miss means the rider got a ride after all. */
const RIDE_LATER_WINDOW_MS = 3 * 3_600_000;
const GOT_A_RIDE: TripStatus[] = [
  TripStatus.COMPLETED,
  TripStatus.DELIVERED,
  TripStatus.DRIVER_ASSIGNED,
  TripStatus.DRIVER_ARRIVED,
  TripStatus.IN_PROGRESS,
  TripStatus.PICKED_UP,
];

/** One missed trip in the list: who to call back. */
export interface MissedTrip {
  readonly id: string;
  readonly kind: string;
  readonly vehicleKind: string;
  readonly status: string;
  readonly cancelCode: string | null;
  readonly pickupName: string;
  readonly dropName: string;
  readonly fareTotal: number;
  readonly createdAt: Date;
  /** Minutes from the start of the search to the end (timeout or cancel). */
  readonly waitedMin: number | null;
  readonly reason: 'NO_DRIVER' | 'GAVE_UP';
  /** The rider booked again within 3 hours and got a driver. */
  readonly gotRideLater: boolean;
  readonly riderName: string | null;
  readonly riderPhone: string | null;
  readonly passenger: { id: string; name: string | null; phone: string };
}

export interface MissedSummary {
  readonly from: string;
  readonly to: string;
  /** Trips that searched for a driver (all bookings except those still scheduled for later). */
  readonly booked: number;
  readonly missed: number;
  readonly noDriver: number;
  readonly gaveUp: number;
  /** Median minutes riders waited before giving up (null with none). */
  readonly gaveUpAfterMin: number | null;
  /** 24 rows, hour of day in IST. */
  readonly byHour: { hour: number; booked: number; missed: number }[];
  /** Vehicles with at least one miss, most missed first. */
  readonly byVehicle: { vehicleKind: string; booked: number; missed: number }[];
  /** Pickup hexagons (H3 res 8) with the most misses, top 8. */
  readonly areas: { cell: string; booked: number; missed: number }[];
  readonly items: Paged<MissedTrip>;
}

type Count = bigint | number;

/** Missed trips: how many, when, where, for which vehicles, and the riders to call back. */
@Injectable()
export class AdminMissedService {
  constructor(private readonly prisma: PrismaService) {}

  /** Missed trips booked since [from] (dashboard tile). */
  async countSince(from: Date): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ n: Count }[]>`SELECT COUNT(*) AS n FROM "Trip" WHERE "createdAt" >= ${from} AND ${MISSED_SQL}`;
    return Number(row?.n ?? 0);
  }

  async summary(q: { from?: string; to?: string; page?: number; pageSize?: number }): Promise<MissedSummary> {
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 7 * 86_400_000);
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const range = Prisma.sql`"createdAt" >= ${from} AND "createdAt" <= ${to} AND status <> 'SCHEDULED'`;
    const missedFlag = Prisma.sql`COUNT(*) FILTER (WHERE ${MISSED_SQL})`;

    const [totals, hours, vehicles, areas, ids] = await Promise.all([
      this.prisma.$queryRaw<{ booked: Count; missed: Count; nodriver: Count; gaveup: Count; gaveupmin: number | null }[]>`
        SELECT COUNT(*) AS booked, ${missedFlag} AS missed,
          COUNT(*) FILTER (WHERE ${NO_DRIVER_SQL}) AS nodriver,
          COUNT(*) FILTER (WHERE ${GAVE_UP_SQL}) AS gaveup,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("cancelledAt" - "searchFrom")) / 60)
            FILTER (WHERE ${GAVE_UP_SQL}) AS gaveupmin
        FROM "Trip" WHERE ${range}`,
      this.prisma.$queryRaw<{ hour: number; booked: Count; missed: Count }[]>`
        SELECT ${HOUR_IST} AS hour, COUNT(*) AS booked, ${missedFlag} AS missed
        FROM "Trip" WHERE ${range} GROUP BY 1`,
      this.prisma.$queryRaw<{ vehicleKind: string; booked: Count; missed: Count }[]>`
        SELECT "vehicleKind"::text AS "vehicleKind", COUNT(*) AS booked, ${missedFlag} AS missed
        FROM "Trip" WHERE ${range} GROUP BY 1 HAVING ${missedFlag} > 0 ORDER BY 3 DESC, 2 DESC`,
      this.prisma.$queryRaw<{ cell: string; booked: Count; missed: Count }[]>`
        SELECT "pickupCell" AS cell, COUNT(*) AS booked, ${missedFlag} AS missed
        FROM "Trip" WHERE ${range} AND "pickupCell" IS NOT NULL GROUP BY 1 HAVING ${missedFlag} > 0 ORDER BY 3 DESC, 2 DESC LIMIT 8`,
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Trip" WHERE ${range} AND ${MISSED_SQL}
        ORDER BY "createdAt" DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    ]);
    const t = totals[0];
    const missed = Number(t?.missed ?? 0);
    const byHourMap = new Map(hours.map((h) => [Number(h.hour), h]));

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      booked: Number(t?.booked ?? 0),
      missed,
      noDriver: Number(t?.nodriver ?? 0),
      gaveUp: Number(t?.gaveup ?? 0),
      gaveUpAfterMin: t?.gaveupmin == null ? null : Math.round(Number(t.gaveupmin) * 10) / 10,
      byHour: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        booked: Number(byHourMap.get(hour)?.booked ?? 0),
        missed: Number(byHourMap.get(hour)?.missed ?? 0),
      })),
      byVehicle: vehicles.map((v) => ({ vehicleKind: v.vehicleKind, booked: Number(v.booked), missed: Number(v.missed) })),
      areas: areas.map((a) => ({ cell: a.cell, booked: Number(a.booked), missed: Number(a.missed) })),
      items: { items: await this.items(ids.map((r) => r.id)), total: missed, page, pageSize },
    };
  }

  /** The listed trips, newest first, with whether each rider got a ride soon after. */
  private async items(ids: string[]): Promise<MissedTrip[]> {
    if (ids.length === 0) return [];
    const trips = await this.prisma.trip.findMany({
      where: { id: { in: ids } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        kind: true,
        vehicleKind: true,
        status: true,
        cancelCode: true,
        pickupName: true,
        dropName: true,
        fareTotal: true,
        createdAt: true,
        searchFrom: true,
        cancelledAt: true,
        riderName: true,
        riderPhone: true,
        passenger: { select: { id: true, name: true, phone: true } },
      },
    });
    const oldest = trips[trips.length - 1]!.createdAt;
    const later = await this.prisma.trip.findMany({
      where: { passengerId: { in: [...new Set(trips.map((t) => t.passenger.id))] }, createdAt: { gt: oldest }, status: { in: GOT_A_RIDE } },
      select: { passengerId: true, createdAt: true },
    });
    return trips.map(({ searchFrom, cancelledAt, ...t }) => {
      const at = t.createdAt.getTime();
      return {
        ...t,
        reason: t.status === TripStatus.NO_DRIVERS || t.cancelCode === 'NO_DRIVERS' ? 'NO_DRIVER' : 'GAVE_UP',
        waitedMin: cancelledAt ? Math.max(0, Math.round((cancelledAt.getTime() - searchFrom.getTime()) / 6_000) / 10) : null,
        gotRideLater: later.some(
          (l) => l.passengerId === t.passenger.id && l.createdAt.getTime() > at && l.createdAt.getTime() - at <= RIDE_LATER_WINDOW_MS,
        ),
      };
    });
  }
}
