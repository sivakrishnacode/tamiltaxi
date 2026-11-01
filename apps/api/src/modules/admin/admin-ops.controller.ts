import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseBoolPipe, Patch, Post, Put, Query, Res, StreamableFile, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';

import { Roles } from '../../core/auth/roles.decorator.js';
import { FileStorageService } from '../../core/storage/file-storage.service.js';
import type { Announcement, AuditLog, CancellationDue, Payment } from '../../generated/prisma/client.js';
import { Role } from '../../generated/prisma/enums.js';
import { DemandService, DemandSnapshot } from '../geo/demand.service.js';
import { HexStatsService, type HexStatsSummary } from '../geo/hex-stats.service.js';
import type { Settings } from '../settings/settings.defaults.js';
import { SettingsService } from '../settings/settings.service.js';
import { AdminHeatmapService, Heatmap } from './admin-heatmap.service.js';
import { AdminMissedService, MissedSummary } from './admin-missed.service.js';
import { AdminOpsService, LiveDriver } from './admin-ops.service.js';
import type { Paged } from './admin.types.js';
import { AuditInterceptor } from './audit.interceptor.js';
import { CreateAnnouncementDto } from './dto/announcement.dto.js';
import { HeatmapQueryDto } from './dto/heatmap-query.dto.js';
import { HexStatsQueryDto } from './dto/hex-stats-query.dto.js';
import { ListQueryDto } from './dto/list-query.dto.js';

/** Live map, payments, announcements, settings, audit log and CSV export. */
@Roles(Role.ADMIN)
@UseInterceptors(AuditInterceptor)
@Controller('admin')
export class AdminOpsController {
  constructor(
    private readonly ops: AdminOpsService,
    private readonly settings: SettingsService,
    private readonly files: FileStorageService,
    private readonly heat: AdminHeatmapService,
    private readonly demand: DemandService,
    private readonly hexStats: HexStatsService,
    private readonly missed: AdminMissedService,
  ) {}

  @Get('live')
  live(): Promise<{ drivers: LiveDriver[]; trips: unknown[] }> {
    return this.ops.live();
  }

  /** Trip heatmap per H3 cell: ?metric=pickups|drops|unmet|fares&from&to&kind&vehicleKind&hourFrom&hourTo&resolution */
  @Get('heatmap')
  heatmap(@Query() q: HeatmapQueryDto): Promise<Heatmap> {
    return this.heat.heatmap(q);
  }

  /** Missed trips (no driver found, or the rider gave up while searching): ?from&to (default the last 7 days)&page&pageSize. */
  @Get('missed')
  missedTrips(@Query() q: ListQueryDto): Promise<MissedSummary> {
    return this.missed.summary(q);
  }

  /** Live demand vs free drivers per res-7 hex, with the surge each cell gets. ?refresh=true recomputes now. */
  @Get('demand')
  demandSnapshot(@Query('refresh') refresh?: string): Promise<DemandSnapshot> {
    return refresh === 'true' ? this.demand.refresh(true) : this.demand.snapshot();
  }

  /**
   * Learned hex-pair speeds (for ETAs) at ?res=9|8|7 (default 8): pairs filtered by ?hour=0–23 and ?used=true
   * (≥ historicalEtaMinTrips), sorted by ?sort=busiest|slowest|fastest; speed by hour, slow areas and ETA accuracy.
   */
  @Get('hex-stats')
  async hexStatsSummary(@Query() q: HexStatsQueryDto): Promise<HexStatsSummary> {
    return this.hexStats.summary({
      res: q.res ?? 8,
      hour: q.hour,
      sort: q.sort ?? 'busiest',
      usedOnly: q.used ?? false,
      minTrips: await this.settings.get('historicalEtaMinTrips'),
      limit: q.limit ?? 100,
    });
  }

  @Post('hex-stats/rebuild')
  @HttpCode(200)
  rebuildHexStats(): Promise<{ pairs: number; trips: number }> {
    return this.hexStats.rebuild();
  }

  /** Uploaded KYC documents (admin panel proxies this at /files/:name). */
  @Get('files/:name')
  async file(@Param('name') name: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const f = await this.files.open(name);
    res.setHeader('cache-control', 'private, no-store');
    return new StreamableFile(f.stream, { type: f.type, length: f.size || undefined, disposition: 'inline' });
  }

  @Get('payments')
  payments(@Query() q: ListQueryDto): Promise<Paged<Payment>> {
    return this.ops.payments(q);
  }

  /** Cancellation fees report (who owed whom; the ride that collected it). */
  @Get('cancellation-dues')
  cancellationDues(@Query() q: ListQueryDto): Promise<Paged<CancellationDue> & { totals: { pending: number; applied: number } }> {
    return this.ops.cancellationDues(q);
  }

  @Get('announcements')
  announcements(): Promise<Announcement[]> {
    return this.ops.announcements();
  }

  @Post('announcements')
  createAnnouncement(@Body() body: CreateAnnouncementDto): Promise<Announcement> {
    return this.ops.createAnnouncement(body);
  }

  @Patch('announcements/:id')
  toggleAnnouncement(@Param('id') id: string, @Body('isActive', ParseBoolPipe) isActive: boolean): Promise<Announcement> {
    return this.ops.setAnnouncementActive(id, isActive);
  }

  @Delete('announcements/:id')
  @HttpCode(204)
  removeAnnouncement(@Param('id') id: string): Promise<void> {
    return this.ops.removeAnnouncement(id);
  }

  @Get('settings')
  getSettings(): Promise<Settings> {
    return this.settings.all();
  }

  @Put('settings')
  putSettings(@Body() body: Record<string, unknown>): Promise<Settings> {
    return this.settings.update(body);
  }

  /** ?kind=<entity>&q=<action text> */
  @Get('audit')
  audit(@Query() q: ListQueryDto): Promise<Paged<AuditLog>> {
    return this.ops.audit(q);
  }

  @Get('export/trips.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="tamiltaxi-trips.csv"')
  exportTrips(): Promise<string> {
    return this.ops.exportCsv('trips');
  }

  @Get('export/drivers.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="tamiltaxi-drivers.csv"')
  exportDrivers(): Promise<string> {
    return this.ops.exportCsv('drivers');
  }

  @Get('export/payments.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="tamiltaxi-payments.csv"')
  exportPayments(): Promise<string> {
    return this.ops.exportCsv('payments');
  }
}
