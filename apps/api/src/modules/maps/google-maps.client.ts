import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import type { Env } from '../../core/config/env.js';
import { ENV } from '../../core/config/env.token.js';
import { UsageService, type UsageMetric } from '../../core/usage/usage.service.js';
import type { LatLngBounds } from '../geo/h3.util.js';
import { decodePolyline, LatLngLiteral } from './polyline.js';

/** One autocomplete suggestion (Places API New). */
export interface PlaceSuggestion {
  readonly placeId: string;
  readonly name: string;
  readonly address: string;
  /** Autocomplete with an `origin` only: Google's road distance from it (`distanceMeters`), in km to 0.1. */
  readonly distanceKm?: number | null;
}

/** A resolved place with coordinates. */
export interface ResolvedPlace extends PlaceSuggestion, LatLngLiteral {
  /** Reverse geocode only: "Near KG Hospital", from Google's address descriptors (null when none is close). */
  readonly landmark?: string | null;
}

/** Geocoding API `address_descriptor` (reverse geocode with `extra_computations=ADDRESS_DESCRIPTORS`). */
export interface AddressDescriptor {
  readonly landmarks?: {
    readonly display_name?: { readonly text?: string };
    readonly spatial_relationship?: string;
    readonly straight_line_distance_meters?: number;
  }[];
}

/** A landmark farther than this from the pin says little about where to meet. */
export const LANDMARK_MAX_M = 300;

const RELATION: Readonly<Record<string, string>> = {
  NEAR: 'Near',
  WITHIN: 'Inside',
  BESIDE: 'Beside',
  ACROSS_THE_ROAD: 'Opposite',
  DOWN_THE_ROAD: 'Near',
  AROUND_THE_CORNER: 'Around the corner from',
  BEHIND: 'Behind',
};

/**
 * A short meeting-point label from the nearest landmark within [LANDMARK_MAX_M]: "Opposite Ukkadam Bus Stand".
 * Unknown relationships read "Near". Null when Google sent no usable landmark.
 */
export function landmarkLabel(descriptor: AddressDescriptor | undefined): string | null {
  const best = (descriptor?.landmarks ?? [])
    .filter((l) => l.display_name?.text?.trim() && (l.straight_line_distance_meters ?? Infinity) <= LANDMARK_MAX_M)
    .sort((a, b) => a.straight_line_distance_meters! - b.straight_line_distance_meters!)[0];
  if (!best) return null;
  return `${RELATION[best.spatial_relationship ?? ''] ?? 'Near'} ${best.display_name!.text!.trim()}`;
}

/** A road route between two points. */
export interface RoadRoute {
  readonly distanceKm: number;
  /** Google's minutes: traffic-aware for fare routes (when fetched), traffic-unaware for ETAs. */
  readonly durationMin: number;
  readonly encodedPolyline: string;
  readonly points: LatLngLiteral[];
}

/** One route of a computeRoutes answer (only the fields we ask for). */
interface GoogleRoute {
  readonly distanceMeters?: number;
  readonly duration?: string;
  readonly polyline?: { encodedPolyline?: string };
  readonly routeLabels?: string[];
}

/** The shortest route with a path (the default and its alternates); a tie keeps Google's order (default first). */
export function shortestRoute(routes: readonly GoogleRoute[]): GoogleRoute | undefined {
  return routes
    .filter((r) => (r.distanceMeters ?? 0) > 0 && r.polyline?.encodedPolyline)
    .reduce<GoogleRoute | undefined>((best, r) => (!best || r.distanceMeters! < best.distanceMeters! ? r : best), undefined);
}

/** One computeRouteMatrix element (only the fields we ask for). */
export interface MatrixElement {
  readonly originIndex?: number;
  readonly destinationIndex?: number;
  readonly duration?: string;
  readonly distanceMeters?: number;
  readonly condition?: string;
}

/** A matrix leg: road km and minutes. */
export interface MatrixLeg {
  readonly distanceKm: number;
  readonly durationMin: number;
}

/**
 * Google's limit for one matrix request is 50 waypoints (origins + destinations) and 625 elements; one destination
 * leaves 49 origins.
 */
export const MATRIX_MAX_ORIGINS = 49;

/**
 * computeRouteMatrix elements (any order; one destination) → a leg per origin index, null where Google sent no
 * element, no route (`condition` ≠ ROUTE_EXISTS) or no duration.
 */
export function parseMatrix(elements: readonly MatrixElement[], origins: number): (MatrixLeg | null)[] {
  const legs: (MatrixLeg | null)[] = Array.from({ length: origins }, () => null);
  for (const e of Array.isArray(elements) ? elements : []) {
    const i = e.originIndex ?? 0; // proto3 JSON omits a 0 index
    if (i < 0 || i >= origins || (e.destinationIndex ?? 0) !== 0) continue;
    if (e.condition !== 'ROUTE_EXISTS' || e.duration === undefined) continue;
    const seconds = Number(e.duration.replace('s', ''));
    if (!Number.isFinite(seconds)) continue;
    legs[i] = { distanceKm: Math.round(((e.distanceMeters ?? 0) / 1000) * 10) / 10, durationMin: Math.max(1, Math.round(seconds / 60)) };
  }
  return legs;
}

/**
 * Every route drives. TWO_WHEELER is beta (Google requires an in-app warning) and bills at Routes Enterprise (3×
 * Essentials, 7k free a month); bikes are priced on the car route anyway so the fare matches P-10.
 */
export type TravelMode = 'DRIVE';

const TIMEOUT_MS = 5000;
/** An Open Location Code ("plus code") at the start of an address: 2–8 code letters, "+", 2–3 more. */
const PLUS_CODE_START = /^[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/i;
/** ETAs have fallbacks (learned speeds, estimate), so they give Google less time. */
const ETA_TIMEOUT_MS = 2500;

/**
 * Thin client for Google Maps Platform web services. Every call returns null on failure so callers
 * can fall back to local data. Requests only the fields we use (FieldMask) to stay on the cheaper SKUs.
 */
@Injectable()
export class GoogleMapsClient {
  private readonly logger = new Logger(GoogleMapsClient.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Optional() private readonly usage?: UsageService,
  ) {}

  get isEnabled(): boolean {
    return this.env.googleMapsApiKey.length > 0;
  }

  /**
   * Places Autocomplete (New). Pass the same [sessionToken] until [placeDetails] ends the session.
   * [restriction]: only places inside this rectangle (the service area; `locationRestriction`, not a bias, so
   * nothing Tamil Taxi can't serve is suggested). Without one, results lean towards [origin] (50 km bias).
   * [origin]: the pickup, so each suggestion carries `distanceMeters`. Neither changes the SKU (Autocomplete per
   * session, ended by Place Details).
   */
  async autocomplete(params: { input: string; sessionToken: string; restriction?: LatLngBounds | null; origin?: LatLngLiteral }): Promise<PlaceSuggestion[] | null> {
    const r = params.restriction;
    const o = params.origin;
    const body = {
      input: params.input,
      sessionToken: params.sessionToken,
      includedRegionCodes: ['in'],
      ...(r && { locationRestriction: { rectangle: { low: { latitude: r.low.lat, longitude: r.low.lng }, high: { latitude: r.high.lat, longitude: r.high.lng } } } }),
      ...(!r && o && { locationBias: { circle: { center: { latitude: o.lat, longitude: o.lng }, radius: 50_000 } } }),
      ...(o && { origin: { latitude: o.lat, longitude: o.lng } }),
    };
    const json = await this.call<{ suggestions?: { placePrediction?: { placeId: string; distanceMeters?: number; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } } }[] }>(
      'https://places.googleapis.com/v1/places:autocomplete',
      { method: 'POST', body: JSON.stringify(body), sku: 'maps.autocomplete' },
    );
    if (!json) return null;
    return (json.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({
        placeId: p.placeId,
        name: p.structuredFormat?.mainText?.text ?? '',
        address: p.structuredFormat?.secondaryText?.text ?? '',
        distanceKm: typeof p.distanceMeters === 'number' ? Math.round(p.distanceMeters / 100) / 10 : null,
      }));
  }

  /** Place Details (Essentials fields only); ends the autocomplete session. */
  async placeDetails(params: { placeId: string; sessionToken?: string }): Promise<ResolvedPlace | null> {
    const qs = params.sessionToken ? `?sessionToken=${encodeURIComponent(params.sessionToken)}` : '';
    const json = await this.call<{ id: string; displayName?: { text: string }; formattedAddress?: string; location?: { latitude: number; longitude: number } }>(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(params.placeId)}${qs}`,
      // Essentials fields only (displayName would bill at Pro); the app keeps the suggestion's name.
      { method: 'GET', fieldMask: 'id,formattedAddress,location', sku: 'maps.place_details' },
    );
    if (!json?.location) return null;
    return {
      placeId: json.id,
      name: json.displayName?.text ?? (json.formattedAddress ?? '').split(',')[0].trim(),
      address: json.formattedAddress ?? '',
      lat: json.location.latitude,
      lng: json.location.longitude,
    };
  }

  /**
   * Geocoding API reverse lookup, with address descriptors (`extra_computations=ADDRESS_DESCRIPTORS`: nearby
   * landmarks, India supported) for a "Near KG Hospital" meeting point.
   */
  async reverseGeocode(point: LatLngLiteral): Promise<ResolvedPlace | null> {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${point.lat},${point.lng}&language=en&extra_computations=ADDRESS_DESCRIPTORS&key=${this.env.googleMapsApiKey}`;
    const json = await this.call<{ status: string; address_descriptor?: AddressDescriptor; results?: { place_id: string; formatted_address: string; types?: string[]; address_components?: { long_name: string; types: string[] }[] }[] }>(
      url,
      { method: 'GET', isKeyInUrl: true, sku: 'maps.geocode' },
    );
    // The first result can be a plus code ("7Q6M+2X <city>", typed plus_code or not: "X2JR+9H, ELGI Nagar, …")
    // or an unnamed road: take the first real address; if there is none, drop the code from the front.
    const results = json?.status === 'OK' ? (json.results ?? []) : [];
    const isReal = (r: (typeof results)[number]): boolean =>
      !r.types?.includes('plus_code') && !PLUS_CODE_START.test(r.formatted_address) && !/^unnamed road/i.test(r.formatted_address);
    const first = results.find(isReal) ?? results[0];
    if (!first) return null;
    const address = first.formatted_address.replace(PLUS_CODE_START, '').replace(/^[,\s]+/, '') || first.formatted_address;
    const area = first.address_components?.find((c) => c.types.includes('sublocality') || c.types.includes('locality'));
    return {
      placeId: first.place_id,
      name: area?.long_name ?? address.split(',')[0],
      address,
      landmark: landmarkLabel(json?.address_descriptor),
      ...point,
    };
  }

  /**
   * The city's Google place ID: the Geocoding result for "<name>, <state>, India" typed `locality`, the feature the
   * admin maps outline as the city boundary. Null when Google has no locality by that name (or on failure).
   */
  async localityPlaceId(name: string, state: string): Promise<string | null> {
    const address = encodeURIComponent(`${name}, ${state}, India`);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${address}&components=country:IN&language=en&key=${this.env.googleMapsApiKey}`;
    const json = await this.call<{ status: string; results?: { place_id: string; types?: string[] }[] }>(url, {
      method: 'GET',
      isKeyInUrl: true,
      sku: 'maps.geocode',
    });
    const locality = json?.status === 'OK' ? json.results?.find((r) => r.types?.includes('locality')) : undefined;
    return locality?.place_id ?? null;
  }

  /**
   * Routes API computeRoutes.
   *
   * `vehicleStopover` snaps a stop to a road where a vehicle can pull over, not a flyover or highway passing
   * above it: a drop pinned on the Ukkadam flyover was routed 16.5 km round via Podanur instead of 11.4 km along
   * Trichy Road. It bills the request at Routes Pro (Essentials without it), so only fare routes set [stops];
   * ETAs (cell centre to cell centre, often a moving driver) leave it off.
   *
   * Fare routes also ask for `computeAlternativeRoutes` (up to 3 alternates, no SKU change: Pro is already set by the
   * stopovers) and keep the **shortest** by `distanceMeters`: the fare is charged per km, so the map, the cached route
   * and the trip's `routePolyline` are the route the rider pays for (Google's default is the fastest).
   * Fare routes are `TRAFFIC_AWARE`, so their `durationMin` is Google's travel time now (display only: the fare's
   * minutes stay on the 18 km/h model).
   */
  async route(params: { from: LatLngLiteral; to: LatLngLiteral; mode: TravelMode; stops?: boolean }): Promise<RoadRoute | null> {
    const isEta = params.stops === false;
    const wp = (p: LatLngLiteral, isStop: boolean): object => ({
      location: { latLng: { latitude: p.lat, longitude: p.lng } },
      ...(isStop && { vehicleStopover: true }),
    });
    const json = await this.call<{ routes?: GoogleRoute[] }>(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        sku: isEta ? 'maps.routes' : 'maps.routes_pro',
        // An ETA needs no path (smaller answer, same SKU).
        fieldMask: isEta ? 'routes.distanceMeters,routes.duration' : 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.routeLabels',
        timeoutMs: isEta ? ETA_TIMEOUT_MS : TIMEOUT_MS,
        body: JSON.stringify({
          origin: wp(params.from, !isEta),
          destination: wp(params.to, !isEta),
          travelMode: params.mode,
          // Fare routes are Pro already (stopovers), so traffic costs nothing more there; ETAs stay Essentials.
          // Never TRAFFIC_AWARE_OPTIMAL (Enterprise-priced in some regions, and slower).
          routingPreference: isEta ? 'TRAFFIC_UNAWARE' : 'TRAFFIC_AWARE',
          ...(!isEta && { computeAlternativeRoutes: true }),
          regionCode: 'in',
        }),
      },
    );
    const r = isEta ? json?.routes?.[0] : shortestRoute(json?.routes ?? []);
    const encoded = r?.polyline?.encodedPolyline ?? '';
    if (!r?.distanceMeters || (!isEta && !encoded)) return null;
    const seconds = Number((r.duration ?? '0s').replace('s', ''));
    return {
      distanceKm: Math.round((r.distanceMeters / 1000) * 10) / 10,
      durationMin: Math.max(1, Math.round(seconds / 60)),
      encodedPolyline: encoded,
      points: encoded ? decodePolyline(encoded) : [],
    };
  }

  /**
   * Routes API computeRouteMatrix: road distance and time from each of [origins] to [destination], in ONE call
   * (billed per element: origins × 1, Essentials: `TRAFFIC_UNAWARE`, DRIVE, no stopover, no toll or traffic
   * fields). Returns one entry per origin, in the same order: null for an element Google left out or could not
   * route (`condition` ROUTE_NOT_FOUND). Null for the whole call on failure. At most [MATRIX_MAX_ORIGINS] origins.
   */
  async routeMatrix(params: { origins: readonly LatLngLiteral[]; destination: LatLngLiteral; mode: TravelMode }): Promise<(MatrixLeg | null)[] | null> {
    if (params.origins.length === 0) return [];
    if (params.origins.length > MATRIX_MAX_ORIGINS) throw new RangeError(`routeMatrix takes at most ${MATRIX_MAX_ORIGINS} origins`);
    const wp = (p: LatLngLiteral): object => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } });
    const json = await this.call<MatrixElement[]>('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
      method: 'POST',
      // Billed per element: origins × one destination.
      sku: 'maps.matrix_elements',
      units: params.origins.length,
      fieldMask: 'originIndex,destinationIndex,duration,distanceMeters,condition',
      timeoutMs: ETA_TIMEOUT_MS,
      body: JSON.stringify({
        origins: params.origins.map(wp),
        destinations: [wp(params.destination)],
        travelMode: params.mode,
        routingPreference: 'TRAFFIC_UNAWARE',
        regionCode: 'in',
      }),
    });
    return json ? parseMatrix(json, params.origins.length) : null;
  }

  /** One Google call; a successful one is counted under [opts.sku] ([opts.units] elements, default 1) for Server health. */
  private async call<T>(
    url: string,
    opts: { method: 'GET' | 'POST'; sku: UsageMetric; units?: number; body?: string; fieldMask?: string; isKeyInUrl?: boolean; timeoutMs?: number },
  ): Promise<T | null> {
    if (!this.isEnabled) return null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!opts.isKeyInUrl) headers['X-Goog-Api-Key'] = this.env.googleMapsApiKey;
    if (opts.fieldMask) headers['X-Goog-FieldMask'] = opts.fieldMask;
    try {
      const res = await fetch(url, { method: opts.method, headers, body: opts.body, signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS) });
      if (!res.ok) {
        // 429 = quota / rate limit: callers fall back to local estimates.
        this.logger.warn(`Google ${new URL(url).pathname} → ${res.status}${res.status === 429 ? ' (quota exceeded)' : ''}`);
        return null;
      }
      this.usage?.count(opts.sku, opts.units ?? 1);
      return (await res.json()) as T;
    } catch (e) {
      this.logger.warn(`Google call failed: ${(e as Error).message}`);
      return null;
    }
  }
}
