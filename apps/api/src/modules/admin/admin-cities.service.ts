import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service.js';
import { type City, type CityFareRule, Prisma, type Zone } from '../../generated/prisma/client.js';
import { VehicleKind } from '../../generated/prisma/enums.js';
import { FARE_RULES } from '../fares/fare-rules.js';
import { effectivePricing, isPricingSection, type ModePricing, parsePricingSection, type PricingSection } from '../fares/pricing.js';
import { type RentalPackage, RENTAL_PACKAGES } from '../fares/ride-modes.js';
import { GeoService } from '../geo/geo.service.js';
import { cellsForCircle, DEFAULT_H3_RESOLUTION, validateCells } from '../geo/h3.util.js';
import type { CreateCityDto, UpdateCityDto } from './dto/city.dto.js';
import type { FareRuleDto } from './dto/fare-rule.dto.js';
import type { CreateZoneDto, UpdateZoneDto } from './dto/zone.dto.js';

/** A city's up-front prices for the admin editor: each section as it applies, and whether it is the built-in one. */
export interface CityPricing {
  readonly packages: readonly RentalPackage[];
  readonly sections: { readonly [S in PricingSection]: { readonly value: ModePricing[S]; readonly isDefault: boolean } };
}

/** Cities (H3 service areas), their zones and per-city fares. Every change refreshes the geo cache. */
@Injectable()
export class AdminCitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
  ) {}

  cities(): Promise<(City & { _count: { zones: number } })[]> {
    return this.prisma.city.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { zones: true } } } });
  }

  city(id: string): Promise<City & { zones: Zone[]; fareRules: CityFareRule[] }> {
    return this.prisma.city.findUniqueOrThrow({ where: { id }, include: { zones: { orderBy: { name: 'asc' } }, fareRules: true } });
  }

  async create(dto: CreateCityDto): Promise<City> {
    const h3Resolution = dto.h3Resolution ?? DEFAULT_H3_RESOLUTION;
    const serviceCells = cellsForCircle({ lat: dto.centerLat, lng: dto.centerLng, radiusKm: dto.radiusKm ?? 10, resolution: h3Resolution });
    const city = await this.prisma.city.create({
      data: { id: dto.id, name: dto.name, state: dto.state, centerLat: dto.centerLat, centerLng: dto.centerLng, h3Resolution, serviceCells },
    });
    this.geo.invalidate();
    return city;
  }

  async update(id: string, dto: UpdateCityDto): Promise<City> {
    const city = await this.prisma.city.update({ where: { id }, data: dto });
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
    const cells = this.checkedCells(dto.cells, city.h3Resolution);
    const zone = await this.prisma.zone.create({ data: { ...dto, cells, cityId } });
    this.geo.invalidate();
    return zone;
  }

  async updateZone(id: string, dto: UpdateZoneDto): Promise<Zone> {
    const zone = await this.prisma.zone.findUniqueOrThrow({ where: { id }, include: { city: true } });
    const cells = dto.cells ? this.checkedCells(dto.cells, zone.city.h3Resolution) : undefined;
    const updated = await this.prisma.zone.update({ where: { id }, data: { ...dto, cells } });
    this.geo.invalidate();
    return updated;
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

  private checkedCells(cells: string[], resolution: number): string[] {
    const { valid, invalid } = validateCells(cells, resolution);
    if (invalid.length > 0) throw new BadRequestException(`${invalid.length} cells are invalid or not at resolution ${resolution}`);
    return valid;
  }
}
