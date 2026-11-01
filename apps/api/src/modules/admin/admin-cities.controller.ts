import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseEnumPipe, Patch, Post, Put, UseInterceptors } from '@nestjs/common';

import { assertCityAccess, isOwner } from '../../core/auth/admin-access.js';
import type { AuthUser } from '../../core/auth/auth-user.js';
import { CurrentUser } from '../../core/auth/current-user.decorator.js';
import { OwnerOnly, Roles } from '../../core/auth/roles.decorator.js';
import type { City, CityFareRule, Zone } from '../../generated/prisma/client.js';
import { Role, VehicleKind } from '../../generated/prisma/enums.js';
import { AdminCitiesService, type CityPricing } from './admin-cities.service.js';
import { AdminCityStatsService, type CityStats } from './admin-city-stats.service.js';
import { AuditInterceptor } from './audit.interceptor.js';
import { CellsDto } from './dto/cells.dto.js';
import { CreateCityDto, UpdateCityDto } from './dto/city.dto.js';
import { FareRuleDto } from './dto/fare-rule.dto.js';
import { CreateZoneDto, SurgeNowDto, UpdateZoneDto } from './dto/zone.dto.js';

/**
 * Cities, H3 service areas, zones and per-city fares. Reads are open to every admin; owners change any city, a city
 * admin (support with assigned cities) only theirs, and only owners add, delete or switch cities on and off.
 */
@Roles(Role.ADMIN)
@UseInterceptors(AuditInterceptor)
@Controller('admin')
export class AdminCitiesController {
  constructor(
    private readonly cities: AdminCitiesService,
    private readonly cityStats: AdminCityStatsService,
  ) {}

  @Get('cities')
  list(): Promise<City[]> {
    return this.cities.cities();
  }

  @Post('cities')
  @OwnerOnly()
  create(@Body() body: CreateCityDto): Promise<City> {
    return this.cities.create(body);
  }

  @Get('cities/:id')
  get(@Param('id') id: string): Promise<City> {
    return this.cities.city(id);
  }

  /** Trips today and in the last 7 days (booked, completed, missed, wait for a driver) and drivers online now, for the city and each zone. */
  @Get('cities/:id/stats')
  stats(@Param('id') id: string): Promise<CityStats> {
    return this.cityStats.stats(id);
  }

  @Patch('cities/:id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpdateCityDto): Promise<City> {
    assertCityAccess(user, id);
    // The settings form always sends the switch: only a change is an owner's call.
    if (body.isActive !== undefined && !isOwner(user) && body.isActive !== (await this.cities.city(id)).isActive) {
      throw new ForbiddenException('Only an owner admin can switch a city on or off');
    }
    return this.cities.update(id, body);
  }

  @Delete('cities/:id')
  @OwnerOnly()
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.cities.remove(id);
  }

  @Put('cities/:id/service-cells')
  setCells(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: CellsDto): Promise<{ count: number; rejected: string[] }> {
    assertCityAccess(user, id);
    return this.cities.setServiceCells(id, body.cells);
  }

  /** A temporary surge (rain, a rush) over the city or one zone, ending by itself; optionally pushes the city's drivers. */
  @Post('cities/:id/surge-now')
  surgeNow(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: SurgeNowDto): Promise<{ zone: Zone; notified: number }> {
    assertCityAccess(user, id);
    return this.cities.surgeNow(id, body);
  }

  @Post('cities/:id/zones')
  createZone(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: CreateZoneDto): Promise<Zone> {
    assertCityAccess(user, id);
    return this.cities.createZone(id, body);
  }

  @Patch('zones/:id')
  async updateZone(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpdateZoneDto): Promise<Zone> {
    assertCityAccess(user, await this.cities.zoneCityId(id));
    return this.cities.updateZone(id, body);
  }

  @Delete('zones/:id')
  @HttpCode(204)
  async removeZone(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    assertCityAccess(user, await this.cities.zoneCityId(id));
    return this.cities.removeZone(id);
  }

  @Get('cities/:id/fares')
  fares(@Param('id') id: string): ReturnType<AdminCitiesService['fares']> {
    return this.cities.fares(id);
  }

  @Put('cities/:id/fares/:vehicleKind')
  setFare(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('vehicleKind', new ParseEnumPipe(VehicleKind)) kind: VehicleKind,
    @Body() body: FareRuleDto,
  ): Promise<CityFareRule> {
    assertCityAccess(user, id);
    return this.cities.setFare(id, kind, body);
  }

  @Delete('cities/:id/fares/:vehicleKind')
  @HttpCode(204)
  resetFare(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('vehicleKind', new ParseEnumPipe(VehicleKind)) kind: VehicleKind): Promise<void> {
    assertCityAccess(user, id);
    return this.cities.resetFare(id, kind);
  }

  /** Rentals, outstation, goods to another town and house shifting prices (each the city's own or built-in). */
  @Get('cities/:id/pricing')
  pricing(@Param('id') id: string): Promise<CityPricing> {
    return this.cities.pricing(id);
  }

  /** Sets one whole section (`rental`, `outstation`, `goodsOutstation`, `shifting`); checked in fares/pricing.ts. */
  @Put('cities/:id/pricing/:section')
  setPricing(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('section') section: string, @Body() body: unknown): Promise<CityPricing> {
    assertCityAccess(user, id);
    return this.cities.setPricing(id, section, body);
  }

  @Delete('cities/:id/pricing/:section')
  @HttpCode(204)
  resetPricing(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('section') section: string): Promise<void> {
    assertCityAccess(user, id);
    return this.cities.resetPricing(id, section);
  }
}
