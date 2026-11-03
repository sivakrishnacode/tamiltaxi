import { Injectable } from '@nestjs/common';

import { RedisService } from '../../core/redis/redis.service.js';
import { VehicleKind } from '../../generated/prisma/enums.js';
import type { LatLngBounds } from '../geo/h3.util.js';
import { estimateRoute, GeoPoint, type RouteEstimate } from '../fares/fare-engine.js';
import { GoogleMapsClient, type MatrixLeg, PlaceSuggestion, ResolvedPlace, RoadRoute, TravelMode } from './google-maps.client.js';
import type { LatLngLiteral } from './polyline.js';

const DAY_S = 86_400;
/**
 * A fare route (distance, path: what the fare and the route-deviation check use) is kept 6 h so a quote and its
 * booking price the same route. Google's traffic-aware minutes change through the day, so they live in their own
 * key for 15 min (`maps:tt:*`); after that, one Pro call refreshes them (only the minutes, not the cached route).
 * Autocomplete answers are kept a day (`maps:ac1:*`), resolved places 30 days (`maps:pd1:*`, Google allows caching
 * coordinates that long); neither holds anything about the user. `maps:acs:<session>` counts one search session's
 * billed autocomplete calls (see [MapsService.details]).
 */
const TTL = { geocode: 30 * DAY_S, route: 6 * 3600, travel: 15 * 60, autocomplete: DAY_S, place: 30 * DAY_S, session: 300 } as const;

/** Autocomplete needs this many characters (trimmed) before any lookup: shorter input answers [] at no cost. */
export const AUTOCOMPLETE_MIN_CHARS = 4;
/**
 * A search session's autocomplete calls are free when Place Details (≈ the price of 1.8 autocomplete calls) ends it,
 * else billed one by one. So a cached place is served only while the session made at most this many billed calls;
 * after more, the details call to Google is the cheaper way to end it.
 */
const MAX_BILLED_FOR_CACHED_PLACE = 1;

/**
 * Google Maps Platform with Redis caching (the biggest cost lever), and a local fallback
 * (seeded places + haversine × 1.3) when no key is configured or Google fails.
 */
@Injectable()
export class MapsService {
  constructor(
    private readonly google: GoogleMapsClient,
    private readonly redis: RedisService,
  ) {}

  get isGoogleEnabled(): boolean {
    return this.google.isEnabled;
  }

  /** "  Gandhi   Puram " → "gandhi puram": the form searches are sent and cached in. */
  static normaliseInput(input: string): string {
    return input.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * `maps:ac1:<area>:<origin>:<input>`: the same search (normalised) in the same area ([restriction] rectangle, or
   * `any` for outstation) from about the same place ([origin] on a ~1 km grid, since suggestions carry their distance
   * from it) shares one answer.
   */
  static autocompleteKey(p: { input: string; restriction?: LatLngBounds | null; origin?: LatLngLiteral }): string {
    const r = p.restriction;
    const area = r ? [r.low.lat, r.low.lng, r.high.lat, r.high.lng].map((v) => v.toFixed(3)).join(',') : 'any';
    const origin = p.origin ? `${p.origin.lat.toFixed(2)},${p.origin.lng.toFixed(2)}` : 'none';
    return `maps:ac1:${area}:${origin}:${MapsService.normaliseInput(p.input)}`;
  }

  private static sessionKey(sessionToken: string): string {
    return `maps:acs:${sessionToken}`;
  }

  /**
   * Places Autocomplete: [] under [AUTOCOMPLETE_MIN_CHARS] (no call), then the cached answer (a day), then Google
   * with the client's session token. Null without Google or when it fails (callers fall back to seeded places).
   */
  async autocomplete(params: { input: string; sessionToken: string; restriction?: LatLngBounds | null; origin?: LatLngLiteral }): Promise<PlaceSuggestion[] | null> {
    const input = MapsService.normaliseInput(params.input);
    if (input.length < AUTOCOMPLETE_MIN_CHARS) return [];
    if (!this.isGoogleEnabled) return null;
    const key = MapsService.autocompleteKey(params);
    const hit = await this.redis.get(key);
    if (hit) return JSON.parse(hit) as PlaceSuggestion[];
    const results = await this.google.autocomplete({ ...params, input });
    if (results === null) return null;
    const session = MapsService.sessionKey(params.sessionToken);
    await this.redis.multi().set(key, JSON.stringify(results), 'EX', TTL.autocomplete).incr(session).expire(session, TTL.session).exec();
    return results;
  }

  /**
   * Coordinates for a suggestion. Cached 30 days by place ID, but a session that made several billed autocomplete
   * calls ends with Google's Place Details instead (which makes those calls free, see [MAX_BILLED_FOR_CACHED_PLACE]);
   * that also refreshes the cache. If Google fails, the cached place still answers.
   */
  async details(params: { placeId: string; sessionToken?: string }): Promise<ResolvedPlace | null> {
    const key = `maps:pd1:${params.placeId}`;
    const session = params.sessionToken ? MapsService.sessionKey(params.sessionToken) : null;
    const [hit, billed] = await Promise.all([this.redis.get(key), session ? this.redis.get(session) : Promise.resolve(null)]);
    const cached = hit ? (JSON.parse(hit) as ResolvedPlace) : null;
    if (cached && Number(billed ?? 0) <= MAX_BILLED_FOR_CACHED_PLACE) return cached;
    const place = await this.google.placeDetails(params);
    if (session) await this.redis.del(session); // Place Details ended the session.
    if (place) await this.redis.set(key, JSON.stringify(place), 'EX', TTL.place);
    return place ?? cached;
  }

  reverseGeocode(point: LatLngLiteral): Promise<ResolvedPlace | null> {
    // ~11 m grid so nearby pins share a cache entry. `rg2`: the value carries the landmark (older `maps:rg:`
    // entries have none and expire unused).
    const key = `maps:rg3:${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
    return this.cached(key, TTL.geocode, () => this.google.reverseGeocode(point));
  }

  /** The city's Google place ID (its `locality`), or null; callers store it, so it isn't cached here. */
  cityPlaceId(name: string, state: string): Promise<string | null> {
    return this.google.localityPlaceId(name, state);
  }

  /** Road route (Google when enabled; cached ~6 h on a ~100 m grid), else null. */
  route(params: { from: LatLngLiteral; to: LatLngLiteral; vehicleKind?: VehicleKind; stops?: boolean }): Promise<RoadRoute | null> {
    const mode = MapsService.travelMode(params.vehicleKind);
    const key = MapsService.routeKey(mode, params);
    return this.cached(key, TTL.route, async () => {
      const road = await this.google.route({ ...params, mode });
      // A fresh fare route carries Google's traffic-aware minutes for now.
      if (road && params.stops !== false) await this.redis.set(MapsService.travelKey(key), String(road.durationMin), 'EX', TTL.travel);
      return road;
    });
  }

  /**
   * Google's traffic-aware minutes for a fare route (display only), from the last 15 min; on a miss one Routes Pro
   * call refreshes them (the cached route, and so the fare, stays as it is). Null without Google or if it fails.
   */
  async travelMin(params: { from: LatLngLiteral; to: LatLngLiteral; vehicleKind?: VehicleKind }): Promise<number | null> {
    if (!this.isGoogleEnabled) return null;
    const mode = MapsService.travelMode(params.vehicleKind);
    const key = MapsService.travelKey(MapsService.routeKey(mode, params));
    const hit = await this.cachedTravelMin(params);
    if (hit !== null) return hit;
    const fresh = await this.google.route({ from: params.from, to: params.to, mode });
    if (!fresh) return null;
    await this.redis.set(key, String(fresh.durationMin), 'EX', TTL.travel);
    return fresh.durationMin;
  }

  /** The traffic-aware minutes from the last 15 min only, never a Google call (null on a miss). */
  async cachedTravelMin(params: { from: LatLngLiteral; to: LatLngLiteral; vehicleKind?: VehicleKind }): Promise<number | null> {
    const hit = await this.redis.get(MapsService.travelKey(MapsService.routeKey(MapsService.travelMode(params.vehicleKind), params)));
    return hit === null ? null : Number(hit);
  }

  /**
   * The cached road route only, never a Google call: e.g. at booking, the route the quote just fetched (for the
   * trip's route-deviation check). Null on a miss, without Google, or for the measured demo routes.
   */
  async cachedRoute(params: { from: LatLngLiteral; to: LatLngLiteral; vehicleKind?: VehicleKind }): Promise<RoadRoute | null> {
    const hit = await this.redis.get(MapsService.routeKey(MapsService.travelMode(params.vehicleKind), params));
    return hit ? (JSON.parse(hit) as RoadRoute) : null;
  }

  /**
   * Road ETAs from many points to one (a single computeRouteMatrix call, Essentials), for [EtaService.minutesMany].
   * Not cached here: the caller caches per cell pair. Null without Google or when the call fails.
   */
  etaMatrix(params: { origins: readonly LatLngLiteral[]; destination: LatLngLiteral; vehicleKind?: VehicleKind }): Promise<(MatrixLeg | null)[] | null> {
    if (!this.isGoogleEnabled) return Promise.resolve(null);
    return this.google.routeMatrix({ origins: params.origins, destination: params.destination, mode: MapsService.travelMode(params.vehicleKind) });
  }

  /** Google travel mode for a vehicle: always DRIVE (see [TravelMode]); kept per vehicle for cache keys. */
  static travelMode(_kind?: VehicleKind): TravelMode {
    return 'DRIVE';
  }

  /**
   * `rt3`: fare routes snap stops with `vehicleStopover` and keep the shortest of Google's alternatives (older
   * `maps:rt:` / `maps:rt2:` entries, the default or a flyover route, expire unused); `:eta` = no stopover.
   */
  private static routeKey(mode: TravelMode, p: { from: LatLngLiteral; to: LatLngLiteral; stops?: boolean }): string {
    // Fare routes on a ~11 m grid: Google snaps the first asker's exact pins, so a coarser square could hand a pin
    // on the street the route computed for one on the flyover. ETAs go cell centre to cell centre (already shared).
    const d = p.stops === false ? 3 : 4;
    const g = (q: LatLngLiteral): string => `${q.lat.toFixed(d)},${q.lng.toFixed(d)}`;
    return `maps:rt3:${mode}${p.stops === false ? ':eta' : ''}:${g(p.from)}:${g(p.to)}`;
  }

  /** `maps:tt:<mode>:<from>:<to>`: the traffic-aware minutes of the fare route under [routeKey]. */
  private static travelKey(routeKey: string): string {
    return routeKey.replace('maps:rt3:', 'maps:tt:');
  }

  /**
   * Distance/duration for fares: measured demo routes first, then Google road distance, then haversine × 1.3.
   * [RouteEstimate.travelMin] is Google's traffic-aware time for display (null for the local estimate).
   */
  async estimate(params: { from: GeoPoint; to: GeoPoint; vehicleKind?: VehicleKind }): Promise<RouteEstimate> {
    const local = { ...estimateRoute(params.from, params.to), travelMin: null };
    if (!this.isGoogleEnabled || this.isDemo(params.from, params.to)) return local;
    const road = await this.route(params);
    if (!road) return local;
    // Real road distance from Google; duration keeps the 18 km/h fare model so prices stay predictable.
    const travelMin = await this.travelMin(params);
    return { distanceKm: road.distanceKm, durationMin: Math.max(1, Math.round((road.distanceKm / 18) * 60)), travelMin };
  }

  /** True when the pair is one of the measured demo routes (keeps design fares stable). */
  private isDemo(from: GeoPoint, to: GeoPoint): boolean {
    const a = estimateRoute(from, to);
    const b = estimateRoute({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng });
    return a.distanceKm !== b.distanceKm;
  }

  private async cached<T>(key: string, ttl: number, load: () => Promise<T | null>): Promise<T | null> {
    const hit = await this.redis.get(key);
    if (hit) return JSON.parse(hit) as T;
    const value = await load();
    if (value !== null) await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
    return value;
  }
}
