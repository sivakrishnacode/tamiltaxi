import { Injectable } from '@nestjs/common';
import { cellToParent } from 'h3-js';

import { PrismaService } from '../../core/prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { MISSED_SQL } from './admin-missed.service.js';
import type { HeatmapMetric, HeatmapQueryDto } from './dto/heatmap-query.dto.js';

/** One hexagon of the heatmap. */
export interface HeatCell {
  readonly cell: string;
  /** Trip count (or ₹ total for the fares metric). */
  readonly value: number;
  /** 0–1, relative to the busiest cell (for colour scales). */
  readonly intensity: number;
}

export interface Heatmap {
  readonly metric: HeatmapMetric;
  readonly resolution: number;
  readonly total: number;
  readonly max: number;
  readonly cells: HeatCell[];
  readonly from: string;
  readonly to: string;
}

const STORED_RES = 8;

/** Where things happen, from real trips, aggregated per H3 cell (trips store res-8 cells). */
@Injectable()
export class AdminHeatmapService {
  constructor(private readonly prisma: PrismaService) {}

  async heatmap(q: HeatmapQueryDto): Promise<Heatmap> {
    const metric = q.metric ?? 'pickups';
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * 86_400_000);
    const rows = await this.query({ metric, from, to, q });
    const resolution = q.resolution ?? STORED_RES;
    const merged = new Map<string, number>();
    for (const r of rows) {
      const cell = resolution < STORED_RES ? cellToParent(r.cell, resolution) : r.cell;
      merged.set(cell, (merged.get(cell) ?? 0) + Number(r.value));
    }
    const max = Math.max(0, ...merged.values());
    const cells = [...merged.entries()]
      .map(([cell, value]) => ({ cell, value, intensity: max ? value / max : 0 }))
      .sort((a, b) => b.value - a.value);
    return { metric, resolution, total: cells.reduce((a, c) => a + c.value, 0), max, cells, from: from.toISOString(), to: to.toISOString() };
  }

  private query(p: { metric: HeatmapMetric; from: Date; to: Date; q: HeatmapQueryDto }): Promise<{ cell: string; value: bigint | number }[]> {
    const column = p.metric === 'drops' ? Prisma.raw('"dropCell"') : Prisma.raw('"pickupCell"');
    const value = p.metric === 'fares' ? Prisma.raw('COALESCE(SUM("fareTotal"), 0)') : Prisma.raw('COUNT(*)');
    const filters: Prisma.Sql[] = [Prisma.sql`"createdAt" >= ${p.from}`, Prisma.sql`"createdAt" <= ${p.to}`, Prisma.sql`${column} IS NOT NULL`];
    if (p.metric === 'unmet') filters.push(MISSED_SQL);
    if (p.metric === 'fares' || p.metric === 'drops') filters.push(Prisma.sql`status IN ('COMPLETED', 'DELIVERED')`);
    if (p.q.kind) filters.push(Prisma.sql`kind = ${p.q.kind}::"TripKind"`);
    if (p.q.vehicleKind) filters.push(Prisma.sql`"vehicleKind" = ${p.q.vehicleKind}::"VehicleKind"`);
    if (p.q.hourFrom !== undefined || p.q.hourTo !== undefined) {
      const hour = Prisma.sql`EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'))`;
      filters.push(Prisma.sql`${hour} BETWEEN ${p.q.hourFrom ?? 0} AND ${p.q.hourTo ?? 23}`);
    }
    return this.prisma.$queryRaw<{ cell: string; value: bigint | number }[]>`
      SELECT ${column} AS cell, ${value} AS value
      FROM "Trip"
      WHERE ${Prisma.join(filters, ' AND ')}
      GROUP BY ${column}`;
  }
}
