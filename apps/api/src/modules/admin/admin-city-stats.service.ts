import { Injectable } from '@nestjs/common';
import { cellToParent, latLngToCell } from 'h3-js';

import { PrismaService } from '../../core/prisma/prisma.service.js';
import { MISSED_SQL } from './admin-missed.service.js';
import { AdminOpsService } from './admin-ops.service.js';

const TRIP_RES = 8;
const IST_OFFSET_MS = 330 * 60_000;

/** Trips of one area: today and the last 7 days. Wait = minutes from the search to a driver accepting. */
export interface AreaStats {
  readonly bookedToday: number;
  readonly missedToday: number;
  readonly booked7d: number;
  readonly completed7d: number;
  readonly missed7d: number;
  /** Average minutes riders waited for a driver (accepted trips, 7 days); null with none. */
  readonly avgWaitMin: number | null;
  /** Drivers online inside the area now (busy or free). */
  readonly onlineNow: number;
}

export interface CityStats extends AreaStats {
  readonly zones: (AreaStats & { readonly zoneId: string })[];
}

type Row = { cell: string; booked: bigint; today: bigint; missedtoday: bigint; completed: bigint; missed: bigint; waited: bigint; waitsec: number | null };

/** The city's and each zone's trips (by pickup hexagon) and the drivers online in them, for the city Overview and Zones. */
@Injectable()
export class AdminCityStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ops: AdminOpsService,
  ) {}

  async stats(cityId: string, now = new Date()): Promise<CityStats> {
    const city = await this.prisma.city.findUniqueOrThrow({ where: { id: cityId }, select: { serviceCells: true, h3Resolution: true, zones: { select: { id: true, cells: true } } } });
    const ist = new Date(now.getTime() + IST_OFFSET_MS);
    const todayStart = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS);
    const weekStart = new Date(now.getTime() - 7 * 86_400_000);
    const [rows, live] = await Promise.all([
      this.prisma.$queryRaw<Row[]>`
        SELECT "pickupCell" AS cell, COUNT(*) AS booked,
          COUNT(*) FILTER (WHERE "createdAt" >= ${todayStart}) AS today,
          COUNT(*) FILTER (WHERE "createdAt" >= ${todayStart} AND ${MISSED_SQL}) AS missedtoday,
          COUNT(*) FILTER (WHERE status IN ('COMPLETED', 'DELIVERED')) AS completed,
          COUNT(*) FILTER (WHERE ${MISSED_SQL}) AS missed,
          COUNT("assignedAt") AS waited,
          SUM(EXTRACT(EPOCH FROM ("assignedAt" - "searchFrom"))) FILTER (WHERE "assignedAt" >= "searchFrom") AS waitsec
        FROM "Trip"
        WHERE "createdAt" >= ${weekStart} AND status <> 'SCHEDULED' AND "pickupCell" IS NOT NULL
        GROUP BY 1`,
      this.ops.live(),
    ]);
    // Trips and drivers in the city's own resolution (trips store res 8).
    const toCity = (cell: string) => (city.h3Resolution < TRIP_RES ? cellToParent(cell, city.h3Resolution) : cell);
    const byCell = new Map<string, Row[]>();
    for (const r of rows) {
      const c = toCity(r.cell);
      byCell.set(c, [...(byCell.get(c) ?? []), r]);
    }
    const driverCells = live.drivers.map((d) => latLngToCell(d.lat, d.lng, city.h3Resolution));
    const area = (cells: readonly string[]): AreaStats => {
      const set = new Set(cells);
      const mine = [...set].flatMap((c) => byCell.get(c) ?? []);
      const sum = (pick: (r: Row) => bigint | number | null) => mine.reduce((a, r) => a + Number(pick(r) ?? 0), 0);
      const waited = sum((r) => r.waited);
      return {
        bookedToday: sum((r) => r.today),
        missedToday: sum((r) => r.missedtoday),
        booked7d: sum((r) => r.booked),
        completed7d: sum((r) => r.completed),
        missed7d: sum((r) => r.missed),
        avgWaitMin: waited ? Math.round((sum((r) => r.waitsec) / waited / 60) * 10) / 10 : null,
        onlineNow: driverCells.filter((c) => set.has(c)).length,
      };
    };
    return { ...area(city.serviceCells), zones: city.zones.map((z) => ({ zoneId: z.id, ...area(z.cells) })) };
  }
}
