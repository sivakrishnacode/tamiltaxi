import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service.js';
import { RedisService } from '../../core/redis/redis.service.js';
import type { Place } from '../../generated/prisma/client.js';
import { RideMode, TripStatus } from '../../generated/prisma/enums.js';
import { parseLastLocation, riderLastPinKey } from '../drivers/last-location.js';
import { estimateRoute, haversineMeters } from '../fares/fare-engine.js';
import type { PlaceSuggestion, ResolvedPlace } from '../maps/google-maps.client.js';
import { GeoService } from '../geo/geo.service.js';
import { AUTOCOMPLETE_MIN_CHARS, MapsService } from '../maps/maps.service.js';

/** A popular outstation drop near a pickup ([PlacesService.outstationDestinations]). */
export interface OutstationDestination {
  readonly name: string;
  readonly address: string;
  readonly lat: number;
  readonly lng: number;
  readonly distanceKm: number;
  readonly trips: number;
}

/** Place search and reverse geocoding: Google when configured, seeded places otherwise. */
@Injectable()
export class PlacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maps: MapsService,
    private readonly geo: GeoService,
    private readonly redis: RedisService,
  ) {}

  /** Seeded places matching [query] (also the offline fallback). */
  search(query: string): Promise<Place[]> {
    const q = query.trim();
    return this.prisma.place.findMany({
      where: q
        ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { address: { contains: q, mode: 'insensitive' } }] }
        : {},
      take: 10,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Google Places Autocomplete inside one city's service area, with each suggestion's road distance from [origin]
   * (the pickup) when given; falls back to seeded search (ids prefixed "local:", straight-line × 1.3 distance). The
   * city is the one [origin] is in, else the one around [userId]'s last map position (the apps send no origin while
   * the pickup itself is searched), else the nearest ([GeoService.serviceBounds]). Under [AUTOCOMPLETE_MIN_CHARS]
   * characters: no results, no lookup.
   */
  async autocomplete(params: { input: string; sessionToken: string; origin?: { lat: number; lng: number }; anywhere?: boolean; userId?: string }): Promise<{ source: 'google' | 'local'; results: PlaceSuggestion[] }> {
    if (MapsService.normaliseInput(params.input).length < AUTOCOMPLETE_MIN_CHARS) return { source: this.maps.isGoogleEnabled ? 'google' : 'local', results: [] };
    // Outstation drops are other towns: no service-area restriction, results lean towards the pickup.
    const near = params.origin ?? (params.userId ? parseLastLocation(await this.redis.get(riderLastPinKey(params.userId))) : null);
    const restriction = params.anywhere ? null : await this.geo.serviceBounds(near);
    const google = await this.maps.autocomplete({ input: params.input, sessionToken: params.sessionToken, origin: params.origin, restriction });
    if (google) return { source: 'google', results: google };
    const local = await this.search(params.input);
    const km = (p: Place): number | null => (params.origin ? estimateRoute(params.origin, p).distanceKm : null);
    return { source: 'local', results: local.map((p) => ({ placeId: `local:${p.id}`, name: p.name, address: p.address, distanceKm: km(p) })) };
  }

  /**
   * Where outstation trips from around [at] (≈ 40 km) went most in the last 180 days: up to 6 drops by trip count,
   * each with the latest trip's coordinates and the straight-line distance from [at].
   */
  async outstationDestinations(at: { lat: number; lng: number }): Promise<OutstationDestination[]> {
    const box = 0.36; // ≈ 40 km
    const since = new Date(Date.now() - 180 * 86_400_000);
    const where = {
      rideMode: RideMode.OUTSTATION,
      status: { not: TripStatus.CANCELLED },
      createdAt: { gte: since },
      pickupLat: { gte: at.lat - box, lte: at.lat + box },
      pickupLng: { gte: at.lng - box, lte: at.lng + box },
    };
    const top = await this.prisma.trip.groupBy({ by: ['dropName'], where, _count: { _all: true }, orderBy: { _count: { dropName: 'desc' } }, take: 6 });
    const out: OutstationDestination[] = [];
    for (const t of top) {
      const last = await this.prisma.trip.findFirst({ where: { ...where, dropName: t.dropName }, orderBy: { createdAt: 'desc' }, select: { dropAddr: true, dropLat: true, dropLng: true } });
      if (!last) continue;
      const drop = { lat: last.dropLat, lng: last.dropLng };
      out.push({ name: t.dropName, address: last.dropAddr, ...drop, distanceKm: Math.round(haversineMeters(at, drop) / 100) / 10, trips: t._count._all });
    }
    return out;
  }

  /** Coordinates for an autocomplete result (ends the Google session), and whether Tamil Taxi serves that point. */
  async details(params: { placeId: string; sessionToken?: string }): Promise<(ResolvedPlace & { isInServiceArea: boolean }) | null> {
    let place: ResolvedPlace | null;
    if (params.placeId.startsWith('local:')) {
      const p = await this.prisma.place.findUnique({ where: { id: params.placeId.slice(6) } });
      place = p ? { placeId: `local:${p.id}`, name: p.name, address: p.address, lat: p.lat, lng: p.lng } : null;
    } else {
      place = await this.maps.details(params);
    }
    return place && { ...place, isInServiceArea: (await this.geo.locate(place)).isServiceable };
  }

  async reverse(point: { lat: number; lng: number }): Promise<{ place: ResolvedPlace | null; isInServiceArea: boolean }> {
    const isInServiceArea = (await this.geo.locate(point)).isServiceable;
    const google = await this.maps.reverseGeocode(point);
    if (google) return { place: google, isInServiceArea };
    const places = await this.prisma.place.findMany();
    const nearest = places.reduce<Place | null>(
      (best, p) => (!best || haversineMeters(p, point) < haversineMeters(best, point) ? p : best),
      null,
    );
    const place = nearest ? { placeId: `local:${nearest.id}`, name: nearest.name, address: nearest.address, ...point } : null;
    return { place, isInServiceArea };
  }
}
