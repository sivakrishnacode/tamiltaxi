import { BadRequestException, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service.js';
import { RedisService } from '../../core/redis/redis.service.js';
import { type City, type CityFareRule, Prisma, type Zone } from '../../generated/prisma/client.js';
import { DriverStatus, VehicleKind, ZoneKind } from '../../generated/prisma/enums.js';
import { driversNotFar } from '../drivers/last-location.js';
import { FARE_RULES } from '../fares/fare-rules.js';
import { effectivePricing, isPricingSection, type ModePricing, parsePricingSection, type PricingSection } from '../fares/pricing.js';
import { type RentalPackage, RENTAL_PACKAGES } from '../fares/ride-modes.js';
import { GeoService } from '../geo/geo.service.js';
import { MapsService } from '../maps/maps.service.js';
import { NotifierService } from '../notifications/notifier.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { getResolution, isValidCell } from 'h3-js';

import { cellsBounds, cellsForCircle, DEFAULT_H3_RESOLUTION, MAX_ZONE_RESOLUTION, validateCells } from '../geo/h3.util.js';
import type { CreateCityDto, UpdateCityDto } from './dto/city.dto.js';
import type { FareRuleDto } from './dto/fare-rule.dto.js';
import type { CreateZoneDto, SurgeNowDto, UpdateZoneDto } from './dto/zone.dto.js';

/** A city's up-front prices for the admin editor: each section as it applies, and whether it is the built-in one. */
export interface CityPricing {
  readonly packages: readonly RentalPackage[];
  readonly sections: { readonly [S in PricingSection]: { readonly value: ModePricing[S]; readonly isDefault: boolean } };
}

/** Cities (H3 service areas), their zones and per-city fares. Every change refreshes the geo cache. */
/** A zone's rules make sense together: hours as a pair, the end after the start, a no-service zone stopping something. */
export function checkZoneRules(z: {
  kind?: string;
  startMinute?: number | null;
  endMinute?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  blockPickups?: boolean;
  blockDrops?: boolean;
}): void {
  if ((z.startMinute == null) !== (z.endMinute == null)) throw new BadRequestException('Give both the start and the end time, or neither');
  if (z.startsAt && z.endsAt && new Date(z.endsAt) <= new Date(z.startsAt)) throw new BadRequestException('The end must be after the start');
  if (z.kind === ZoneKind.NO_SERVICE && z.blockPickups === false && z.blockDrops === false) {
    throw new BadRequestException('A no-service zone must stop pickups, drops or both');
  }
}

@Injectable()
export class AdminCitiesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminCitiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
    private readonly notifier: NotifierService,
    private readonly maps: MapsService,
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
  ) {}

  /** Cities made before place IDs (or whose lookup failed) get one in the background; start-up doesn't wait. */
  onApplicationBootstrap(): void {
    void this.fillPlaceIds().catch((e: Error) => this.logger.warn(`City place IDs: ${e.message}`));
  }

  private async fillPlaceIds(): Promise<void> {
    const missing = await this.prisma.city.findMany({ where: { placeId: null }, select: { id: true, name: true, state: true } });
    for (const c of missing) {
      const placeId = await this.maps.cityPlaceId(c.name, c.state);
      if (placeId) await this.prisma.city.update({ where: { id: c.id }, data: { placeId } });
    }
  }

  cities(): Promise<(City & { _count: { zones: number } })[]> {
    return this.prisma.city.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { zones: true } } } });
  }

  city(id: string): Promise<City & { zones: Zone[]; fareRules: CityFareRule[] }> {
    return this.prisma.city.findUniqueOrThrow({ where: { id }, include: { zones: { orderBy: { name: 'asc' } }, fareRules: true } });
  }

  async create(dto: CreateCityDto): Promise<City> {
    const h3Resolution = dto.h3Resolution ?? DEFAULT_H3_RESOLUTION;
    const serviceCells = cellsForCircle({ lat: dto.centerLat, lng: dto.centerLng, radiusKm: dto.radiusKm ?? 10, resolution: h3Resolution });
    const placeId = await this.maps.cityPlaceId(dto.name, dto.state);
    const city = await this.prisma.city.create({
      data: { id: dto.id, name: dto.name, state: dto.state, centerLat: dto.centerLat, centerLng: dto.centerLng, h3Resolution, serviceCells, placeId },
    });
    this.geo.invalidate();
    return city;
  }

  async update(id: string, dto: UpdateCityDto): Promise<City> {
    // A new name or state can be another place: look its place ID up again (null when Google has none).
    let placeId: string | null | undefined;
    if (dto.name !== undefined || dto.state !== undefined) {
      const current = await this.prisma.city.findUniqueOrThrow({ where: { id }, select: { name: true, state: true } });
      const name = dto.name ?? current.name;
      const state = dto.state ?? current.state;
      if (name !== current.name || state !== current.state) placeId = await this.maps.cityPlaceId(name, state);
    }
    const city = await this.prisma.city.update({ where: { id }, data: { ...dto, ...(placeId !== undefined && { placeId }) } });
    this.geo.invalidate();
    return city;
  }

  async remove(id: string): Promise<void> {
    await this.prisma.city.delete({ where: { id } });
    this.geo.invalidate();
  }

  /** Replaces the service area with [cells] (validated for the city's resolution). */
  async setServiceCells(id: string, cells: string[]): Promise<{ count: number; rejected: string[] }> {
    const city = await this.prisma.city.findUniqueOrThrow({ where: { id } });
    const { valid, invalid } = validateCells(cells, city.h3Resolution);
    await this.prisma.city.update({ where: { id }, data: { serviceCells: valid } });
    this.geo.invalidate();
    return { count: valid.length, rejected: invalid };
  }

  async createZone(cityId: string, dto: CreateZoneDto): Promise<Zone> {
    const city = await this.prisma.city.findUniqueOrThrow({ where: { id: cityId } });
    checkZoneRules(dto);
    const cells = this.zoneCells(dto.cells, city.h3Resolution);
    const zone = await this.prisma.zone.create({ data: { ...dto, cells, cityId } });
    this.geo.invalidate();
    return zone;
  }

  async updateZone(id: string, dto: UpdateZoneDto): Promise<Zone> {
    const zone = await this.prisma.zone.findUniqueOrThrow({ where: { id }, include: { city: true } });
    checkZoneRules({ ...zone, startsAt: zone.startsAt?.toISOString() ?? null, endsAt: zone.endsAt?.toISOString() ?? null, ...dto });
    const cells = dto.cells ? this.zoneCells(dto.cells, zone.city.h3Resolution) : undefined;
    const updated = await this.prisma.zone.update({ where: { id }, data: { ...dto, cells } });
    this.geo.invalidate();
    return updated;
  }

  /**
   * "Surge now" (rain, a festival rush): a SURGE zone from now for [hours] over the whole service area or one zone's
   * cells, for some vehicles or all; it ends by itself. With [notifyDrivers], the city's approved drivers for those
   * vehicles get a push; over one zone only those who could get there ([driversNotFar] within `maxSearchRadiusKm`),
   * not a big city's drivers across town. Returns the zone and how many drivers were told.
   */
  async surgeNow(cityId: string, dto: SurgeNowDto, now = new Date()): Promise<{ zone: Zone; notified: number }> {
    const city = await this.prisma.city.findUniqueOrThrow({ where: { id: cityId }, select: { name: true, serviceCells: true } });
    const source = dto.zoneId ? await this.prisma.zone.findFirst({ where: { id: dto.zoneId, cityId }, select: { cells: true } }) : null;
    if (dto.zoneId && !source) throw new BadRequestException('That zone is not in this city');
    const cells = source?.cells ?? city.serviceCells;
    if (cells.length === 0) throw new BadRequestException('The city has no service area yet');
    const endsAt = new Date(now.getTime() + dto.hours * 3_600_000);
    const vehicleKinds = [...new Set(dto.vehicleKinds ?? [])];
    const zone = await this.prisma.zone.create({
      data: { cityId, name: dto.name?.trim() || 'Surge now', kind: ZoneKind.SURGE, cells, surgeMultiplier: dto.multiplier, color: '#D84315', startsAt: now, endsAt, vehicleKinds },
    });
    this.geo.invalidate();
    let notified = 0;
    if (dto.notifyDrivers) {
      const drivers = await this.prisma.driver.findMany({
        where: { cityId, status: DriverStatus.APPROVED, user: { isBlocked: false, deletedAt: null }, ...(vehicleKinds.length ? { vehicleKind: { in: vehicleKinds } } : {}) },
        select: { id: true },
      });
      const until = endsAt.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
      const box = source ? cellsBounds(cells, 0) : null;
      const ids = box ? await driversNotFar(this.redis, drivers.map((d) => d.id), box, (await this.settings.all()).maxSearchRadiusKm) : drivers.map((d) => d.id);
      for (const id of ids) {
        void this.notifier.driverAccount({
          driverId: id,
          kind: 'surge_now',
          title: `Fares ×${dto.multiplier.toFixed(2).replace(/0$/, '')} in ${city.name} until ${until}`,
          body: "It's busy and riders are waiting. 0% commission: the whole fare is yours. Go online.",
        });
      }
      notified = ids.length;
    }
    return { zone, notified };
  }

  /** The city a zone belongs to (404 for an unknown zone). */
  async zoneCityId(id: string): Promise<string> {
    return (await this.prisma.zone.findUniqueOrThrow({ where: { id }, select: { cityId: true } })).cityId;
  }

  async removeZone(id: string): Promise<void> {
    await this.prisma.zone.delete({ where: { id } });
    this.geo.invalidate();
  }

  /** Fare rules for every vehicle: the city's override or the built-in default. */
  async fares(cityId: string): Promise<(Omit<CityFareRule, 'id' | 'cityId' | 'updatedAt'> & { isDefault: boolean })[]> {
    const rules = await this.prisma.cityFareRule.findMany({ where: { cityId } });
    return (Object.keys(FARE_RULES) as VehicleKind[]).map((vehicleKind) => {
      const r = rules.find((x) => x.vehicleKind === vehicleKind);
      const d = FARE_RULES[vehicleKind];
      return r
        ? { vehicleKind, base: r.base, perKm: r.perKm, perMin: r.perMin, minFare: r.minFare, waitPerMin: r.waitPerMin ?? d.waitPerMin, isActive: r.isActive, isDefault: false }
        : { vehicleKind, base: d.base, perKm: d.perKm, perMin: d.perMin, minFare: d.minFare, waitPerMin: d.waitPerMin, isActive: true, isDefault: true };
    });
  }

  async setFare(cityId: string, vehicleKind: VehicleKind, dto: FareRuleDto): Promise<CityFareRule> {
    const rule = await this.prisma.cityFareRule.upsert({
      where: { cityId_vehicleKind: { cityId, vehicleKind } },
      create: { cityId, vehicleKind, ...dto },
      update: dto,
    });
    this.geo.invalidate();
    return rule;
  }

  async resetFare(cityId: string, vehicleKind: VehicleKind): Promise<void> {
    await this.prisma.cityFareRule.deleteMany({ where: { cityId, vehicleKind } });
    this.geo.invalidate();
  }

  /**
   * The city's prices for rentals, outstation, goods to another town and house shifting: each section as it applies
   * (the city's own or the built-in one) and whether it is the built-in one, plus the rental packages they price.
   */
  async pricing(cityId: string): Promise<CityPricing> {
    await this.prisma.city.findUniqueOrThrow({ where: { id: cityId }, select: { id: true } });
    const row = await this.prisma.cityModePricing.findUnique({ where: { cityId } });
    const effective = effectivePricing(row);
    const entry = <S extends PricingSection>(s: S): { value: ModePricing[S]; isDefault: boolean } => ({ value: effective[s], isDefault: row?.[s] == null });
    return {
      packages: RENTAL_PACKAGES,
      sections: { rental: entry('rental'), outstation: entry('outstation'), goodsOutstation: entry('goodsOutstation'), shifting: entry('shifting') },
    };
  }

  /** Stores the city's own [section] (checked whole: every tier / vehicle / size, in range). */
  async setPricing(cityId: string, section: string, body: unknown): Promise<CityPricing> {
    if (!isPricingSection(section)) throw new BadRequestException('Unknown pricing section');
    const parsed = parsePricingSection(section, body);
    if ('error' in parsed) throw new BadRequestException(parsed.error);
    await this.prisma.city.findUniqueOrThrow({ where: { id: cityId }, select: { id: true } });
    const value = parsed.value as unknown as Prisma.InputJsonValue;
    await this.prisma.cityModePricing.upsert({ where: { cityId }, create: { cityId, [section]: value }, update: { [section]: value } });
    this.geo.invalidate();
    return this.pricing(cityId);
  }

  /** Back to the built-in [section]. */
  async resetPricing(cityId: string, section: string): Promise<void> {
    if (!isPricingSection(section)) throw new BadRequestException('Unknown pricing section');
    await this.prisma.cityModePricing.updateMany({ where: { cityId }, data: { [section]: Prisma.DbNull } });
    this.geo.invalidate();
  }

  /** A zone's cells: one resolution for all, the city's ([cityRes]) or finer up to [MAX_ZONE_RESOLUTION]. */
  private zoneCells(cells: string[], cityRes: number): string[] {
    const res = cells.length && isValidCell(cells[0]) ? getResolution(cells[0]) : cityRes;
    if (res < cityRes || res > MAX_ZONE_RESOLUTION) {
      throw new BadRequestException(`Zone hexagons must be resolution ${cityRes} to ${MAX_ZONE_RESOLUTION} (the city's or finer)`);
    }
    return this.checkedCells(cells, res);
  }

  private checkedCells(cells: string[], resolution: number): string[] {
    const { valid, invalid } = validateCells(cells, resolution);
    if (invalid.length > 0) throw new BadRequestException(`${invalid.length} cells are invalid or not at resolution ${resolution}`);
    return valid;
  }
}
