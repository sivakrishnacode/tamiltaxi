import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { City, CityFareRule, CityModePricing, Zone } from '../../generated/prisma/client.js';
import { VehicleKind, ZoneKind } from '../../generated/prisma/enums.js';
import { haversineMeters } from '../fares/fare-engine.js';
import { DEFAULT_PRICING, effectivePricing, type ModePricing } from '../fares/pricing.js';
import { SettingsService } from '../settings/settings.service.js';
import { DemandService } from './demand.service.js';
import { cellAt, cellsBounds, type LatLngBounds, zoneHolds } from './h3.util.js';
import { isZoneLive } from './zone-schedule.js';

interface CityIndex {
  readonly city: City & { zones: Zone[]; fareRules: CityFareRule[]; modePricing: CityModePricing | null };
  readonly service: ReadonlySet<string>;
  /** Rentals, outstation, goods to another town and shifting prices: the city's own over the built-in ones. */
  readonly pricing: ModePricing;
}

/** Where a point is: its city, H3 cell, the zones live there now and whether Tamil Taxi picks up and drops there. */
export interface PointInfo {
  readonly cityId: string | null;
  readonly cell: string | null;
  /** Pickups allowed: inside an active city's service area and no live no-service zone stopping pickups. */
  readonly isServiceable: boolean;
  /** Drops allowed (the same for drops; a no-service zone may stop only pickups, e.g. next to a taxi stand). */
  readonly canDrop: boolean;
  /** The zones covering the point that are live now (zone-schedule.ts). */
  readonly zones: readonly Zone[];
  /** Fare multiplier for every vehicle: max of SURGE zones (else the platform default) and live H3 demand surge, capped. */
  readonly multiplier: number;
  /** Vehicles that a vehicle-only SURGE zone covers here, with their own multiplier. */
  readonly vehicleMultipliers: Partial<Record<VehicleKind, number>>;
}

/** The fare multiplier for [vehicleKind] at a located point. */
export function multiplierFor(info: Pick<PointInfo, 'multiplier' | 'vehicleMultipliers'>, vehicleKind: VehicleKind): number {
  return info.vehicleMultipliers[vehicleKind] ?? info.multiplier;
}

const CACHE_MS = 30_000;

/** The city whose centre is nearest [point] (undefined for none). */
function closest(cities: readonly CityIndex[], point: { lat: number; lng: number }): CityIndex | undefined {
  let best: CityIndex | undefined;
  let bestM = Infinity;
  for (const c of cities) {
    const m = haversineMeters(point, { lat: c.city.centerLat, lng: c.city.centerLng });
    if (m < bestM) [best, bestM] = [c, m];
  }
  return best;
}

/**
 * H3-based service areas. Cities and zones are cached in memory (30 s, or until [invalidate]
 * after an admin change) so every fare quote and booking can check them cheaply.
 */
@Injectable()
export class GeoService {
  /** [hasAnyCity]: any City row at all, active or not (none = a fresh install: everywhere is served). */
  private cache: { at: number; cities: CityIndex[]; hasAnyCity: boolean } | null = null;
  /** [serviceBounds] per city id ('*': every city), for the city cache taken [at]. */
  private bounds: { at: number; byCity: Map<string, LatLngBounds | null> } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly demand: DemandService,
  ) {}

  invalidate(): void {
    this.cache = null;
  }

  private async cities(): Promise<CityIndex[]> {
    return (await this.index()).cities;
  }

  private async index(): Promise<{ cities: CityIndex[]; hasAnyCity: boolean }> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache;
    const [rows, total] = await Promise.all([
      this.prisma.city.findMany({
        where: { isActive: true },
        include: { zones: { where: { isActive: true } }, fareRules: { where: { isActive: true } }, modePricing: true },
      }),
      this.prisma.city.count(),
    ]);
    const cities = rows.map((city) => ({ city, service: new Set(city.serviceCells), pricing: effectivePricing(city.modePricing) }));
    this.cache = { at: Date.now(), cities, hasAnyCity: total > 0 };
    return this.cache;
  }

  /**
   * Looks up a point. With no City rows at all (a fresh install), everything is serviceable; once cities exist, only
   * an active city's service cells are, so switching every city off stops service everywhere.
   */
  async locate(point: { lat: number; lng: number }): Promise<PointInfo> {
    const s = await this.settings.all();
    const { cities, hasAnyCity } = await this.index();
    if (!hasAnyCity) return { cityId: null, cell: null, isServiceable: true, canDrop: true, zones: [], multiplier: s.currentMultiplier, vehicleMultipliers: {} };
    const now = new Date();
    for (const { city, service } of cities) {
      const cell = cellAt(point.lat, point.lng, city.h3Resolution);
      if (!service.has(cell)) continue;
      // Each zone at its own resolution (the city's or finer).
      const zones = city.zones.filter((z) => zoneHolds(z.cells, point) && isZoneLive(z, now));
      const blocks = zones.filter((z) => z.kind === ZoneKind.NO_SERVICE);
      const surges = zones.filter((z) => z.kind === ZoneKind.SURGE);
      // Highest of: admin surge zones (or the platform default) and live demand-vs-supply surge.
      const live = await this.demand.surgeAt(point);
      const combine = (zoneMultipliers: number[]) =>
        Math.min(s.maxMultiplier, Math.max(1, live, zoneMultipliers.length ? Math.max(...zoneMultipliers) : s.currentMultiplier));
      const forAll = surges.filter((z) => z.vehicleKinds.length === 0).map((z) => z.surgeMultiplier);
      const vehicleMultipliers: Partial<Record<VehicleKind, number>> = {};
      for (const kind of new Set(surges.flatMap((z) => z.vehicleKinds))) {
        vehicleMultipliers[kind] = combine([...forAll, ...surges.filter((z) => z.vehicleKinds.includes(kind)).map((z) => z.surgeMultiplier)]);
      }
      return {
        cityId: city.id,
        cell,
        isServiceable: !blocks.some((z) => z.blockPickups),
        canDrop: !blocks.some((z) => z.blockDrops),
        zones,
        multiplier: combine(forAll),
        vehicleMultipliers,
      };
    }
    return { cityId: null, cell: null, isServiceable: false, canDrop: false, zones: [], multiplier: 1, vehicleMultipliers: {} };
  }

  /**
   * The rectangle around one city's service cells (+ ~1 km), for Places Autocomplete `locationRestriction`: the
   * active city [near] is in, else the one whose centre is closest. One rectangle around every city would take in the
   * towns between them (Coimbatore and Chennai: most of Tamil Nadu), so that is only for an unknown [near]. Null while
   * no city has cells (search then leans towards the pickup). Recomputed with the city cache. No city is built in:
   * every city comes from the database.
   */
  async serviceBounds(near?: { lat: number; lng: number } | null): Promise<LatLngBounds | null> {
    const cities = (await this.cities()).filter((c) => c.city.serviceCells.length > 0);
    const at = this.cache?.at ?? 0;
    if (this.bounds?.at !== at) this.bounds = { at, byCity: new Map() };
    const city = near ? (cities.find((c) => c.service.has(cellAt(near.lat, near.lng, c.city.h3Resolution))) ?? closest(cities, near)) : undefined;
    const key = city?.city.id ?? '*';
    let value = this.bounds.byCity.get(key);
    if (value === undefined) {
      value = cellsBounds((city ? [city] : cities).flatMap((c) => c.city.serviceCells));
      this.bounds.byCity.set(key, value);
    }
    return value;
  }

  /** City-specific fare rates for a vehicle, if configured. */
  async fareRule(cityId: string | null, vehicleKind: VehicleKind): Promise<CityFareRule | null> {
    if (!cityId) return null;
    const city = (await this.cities()).find((c) => c.city.id === cityId);
    return city?.city.fareRules.find((r) => r.vehicleKind === vehicleKind) ?? null;
  }

  /** The prices for rentals, outstation, goods to another town and shifting in [cityId] (built-in outside a city). */
  async pricing(cityId: string | null): Promise<ModePricing> {
    if (!cityId) return DEFAULT_PRICING;
    return (await this.cities()).find((c) => c.city.id === cityId)?.pricing ?? DEFAULT_PRICING;
  }

  /** [pricing] for the city [point] is in. */
  async pricingAt(point: { lat: number; lng: number }): Promise<ModePricing> {
    return this.pricing((await this.locate(point)).cityId);
  }

  /** Public service-area payload for the apps (cells + the zones live now). */
  async serviceArea(cityId: string): Promise<{
    id: string;
    name: string;
    resolution: number;
    cells: string[];
    zones: Pick<Zone, 'id' | 'name' | 'kind' | 'cells' | 'surgeMultiplier' | 'color' | 'vehicleKinds' | 'blockPickups' | 'blockDrops' | 'endsAt'>[];
  } | null> {
    const found = (await this.cities()).find((c) => c.city.id === cityId);
    if (!found) return null;
    const { city } = found;
    return {
      id: city.id,
      name: city.name,
      resolution: city.h3Resolution,
      cells: city.serviceCells,
      zones: city.zones
        .filter((z) => isZoneLive(z))
        .map(({ id, name, kind, cells, surgeMultiplier, color, vehicleKinds, blockPickups, blockDrops, endsAt }) => ({
          id,
          name,
          kind,
          cells,
          surgeMultiplier,
          color,
          vehicleKinds,
          blockPickups,
          blockDrops,
          endsAt,
        })),
    };
  }

  async activeCities(): Promise<Pick<City, 'id' | 'name' | 'state' | 'centerLat' | 'centerLng' | 'h3Resolution'>[]> {
    return (await this.cities()).map(({ city: { id, name, state, centerLat, centerLng, h3Resolution } }) => ({ id, name, state, centerLat, centerLng, h3Resolution }));
  }
}
