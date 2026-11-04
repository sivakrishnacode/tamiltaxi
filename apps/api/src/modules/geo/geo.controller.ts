import { Controller, Get, Headers, NotFoundException, Param, ParseFloatPipe, Query } from '@nestjs/common';
import { compactCells } from 'h3-js';

import { Public } from '../../core/auth/public.decorator.js';
import type { City } from '../../generated/prisma/client.js';
import { DemandService } from './demand.service.js';
import { GeoService, PointInfo } from './geo.service.js';
import { DriverMapService, type DriverMap } from './driver-map.service.js';

/** Service areas for the apps: cities, their H3 cells and zones, and point checks. */
@Public()
@Controller()
export class GeoController {
  constructor(
    private readonly geo: GeoService,
    private readonly demand: DemandService,
    private readonly driverMap: DriverMapService,
  ) {}

  @Get('cities')
  cities(): Promise<Pick<City, 'id' | 'name' | 'state' | 'centerLat' | 'centerLng' | 'h3Resolution'>[]> {
    return this.geo.activeCities();
  }

  /** Service cells + zones. `?compact=true` returns H3-compacted cells (mixed resolutions; expand with uncompactCells). */
  @Get('cities/:id/service-area')
  async serviceArea(
    @Param('id') id: string,
    @Query('compact') compact?: string,
  ): Promise<NonNullable<Awaited<ReturnType<GeoService['serviceArea']>>> & { compacted: boolean }> {
    const area = await this.geo.serviceArea(id);
    if (!area) throw new NotFoundException('City not found');
    if (compact !== 'true') return { ...area, compacted: false };
    return { ...area, cells: compactCells(area.cells), compacted: true };
  }

  /** Live "High demand" hexes for the driver app (no rider counts exposed). */
  @Get('demand')
  async demandCells(): Promise<{ at: string; cells: { cell: string; level: string; multiplier: number }[] }> {
    const snap = await this.demand.snapshot();
    return { at: snap.at, cells: snap.cells.filter((c) => c.level !== 'normal').map(({ cell, level, multiplier }) => ({ cell, level, multiplier })) };
  }

  /**
   * Driver app map: demand hotspots (res-7 hexes with outlines, no counts), the admin zones live now and the service
   * area outline, for the calling driver's home city (from their Bearer token; `cityId` overrides it), else for all.
   */
  @Get('demand/hotspots')
  async hotspots(@Headers('authorization') authorization?: string, @Query('cityId') cityId?: string): Promise<DriverMap> {
    return this.driverMap.map(cityId?.trim() || (await this.driverMap.driverCity(authorization)));
  }

  @Get('geo/check')
  check(@Query('lat', ParseFloatPipe) lat: number, @Query('lng', ParseFloatPipe) lng: number): Promise<PointInfo> {
    return this.geo.locate({ lat, lng });
  }
}
