import type { VehicleKind } from '../../generated/prisma/enums.js';
import { FARE_RULES } from './fare-rules.js';

/** A point with an optional known-place id (used for measured demo routes). */
export interface GeoPoint {
  readonly lat: number;
  readonly lng: number;
  readonly placeId?: string;
}

export interface RouteEstimate {
  readonly distanceKm: number;
  /** Fare minutes (distance at 18 km/h): what the time charge is billed on. */
  readonly durationMin: number;
  /**
   * Display only: Google's traffic-aware minutes for the route ("11.4 km · 24 min", "Drop by"). Null / missing when
   * Google is off or for the measured demo routes; the apps then show [durationMin]. Never used for the fare.
   */
  readonly travelMin?: number | null;
}

/**
 * Itemised quote; every line is a whole rupee and they add up exactly to [total]:
 * base + distanceCharge + timeCharge + minFareTopUp = subtotal, subtotal + peakCharge + waitingCharge = total.
 * A quote has waitingCharge 0; the trip's stored fare gets it when the ride starts ([withWaitingCharge]).
 * At night an auto's peak line is the night fare ([night] true, [multiplier] the night one), so older apps that know
 * only "Peak time" still add up.
 */
export interface FareQuote extends RouteEstimate {
  readonly vehicleKind: VehicleKind;
  readonly base: number;
  readonly distanceCharge: number;
  readonly timeCharge: number;
  readonly minFareTopUp: number;
  readonly subtotal: number;
  readonly multiplier: number;
  readonly peakCharge: number;
  /** The night fare applied: [peakCharge] is the night charge and [multiplier] the night multiplier ("Night fare 1.5x"). */
  readonly night: boolean;
  /** Waiting at the pickup past the free minutes (never surged). 0 until the ride starts. */
  readonly waitingCharge: number;
  /** The waiting terms quoted with this fare: free minutes, rupees per started minute after them, and the cap. */
  readonly freeWaitMin: number;
  readonly waitPerMin: number;
  readonly waitMaxCharge: number;
  readonly total: number;
}

/** Waiting terms when the caller gives none (the admin settings' defaults `freeWaitMin`, `waitMaxCharge`). */
export const WAIT_DEFAULTS = { freeMin: 3, maxCharge: 30 } as const;

const ROAD_FACTOR = 1.3;
const AVERAGE_SPEED_KMH = 18;
/** Cap when the caller passes no `maxMultiplier` (the admin setting's default). */
export const MAX_MULTIPLIER = 1.5;
const EPS = 1e-9;
const EARTH_RADIUS_M = 6_371_000;

/** Measured distances for the seeded demo places (ids from prisma/seed.ts; same as the apps' mock data). */
const KNOWN_ROUTES_KM: Readonly<Record<string, number>> = {
  'gandhipuram|brookefields': 4.2,
  'gandhipuram|brookefields-plaza': 4.4,
  'gandhipuram|brookebond-road': 4.0,
  'peelamedu|race-course': 6.8,
  'saibaba-colony|airport': 12.4,
  'rs-puram|junction': 3.6,
  'town-hall|ukkadam': 1.4,
  'psg-tech|tidel-park': 3.4,
};

/** Multiplier when the caller gives none: no peak markup (the live one comes from GeoService.locate). */
export const CURRENT_MULTIPLIER = 1.0;

function floorRupee(v: number): number {
  return Math.floor(v + EPS);
}

/** Great-circle distance in metres. */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const rad = (d: number): number => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Road distance (haversine × 1.3, or a measured route) and duration at 18 km/h. A measured route counts only when
 * the points are about where its places are (the place ids come from the client, so they alone would let anyone
 * price a 20 km trip as the 1.4 km demo route).
 */
export function estimateRoute(from: GeoPoint, to: GeoPoint): RouteEstimate {
  const estimate = Math.max(0.5, Math.round((haversineMeters(from, to) / 1000) * ROAD_FACTOR * 10) / 10);
  const known = KNOWN_ROUTES_KM[`${from.placeId}|${to.placeId}`] ?? KNOWN_ROUTES_KM[`${to.placeId}|${from.placeId}`];
  const km = known !== undefined && known >= estimate * 0.5 && known <= estimate * 2.5 ? known : estimate;
  return { distanceKm: km, durationMin: Math.max(1, Math.round((km / AVERAGE_SPEED_KMH) * 60)) };
}

/**
 * Builds the itemised fare for one vehicle:
 * total = max(minFare, floor((base + perKm·km + perMin·min) × multiplier)), each line floored to the rupee.
 * The multiplier applies to the ride (base + distance + time) only, never to the minimum-fare top-up.
 * [night] (autos at night, as the Tamil Nadu government fare has it) multiplies the whole fare, the minimum included:
 * floor(max(minFare, base + distance + time) × night). It replaces the peak price when it is higher; they never stack.
 */
export function quoteFare(params: {
  vehicleKind: VehicleKind;
  route: RouteEstimate;
  multiplier?: number;
  /** Cap for [multiplier] (admin `maxMultiplier` setting); defaults to [MAX_MULTIPLIER]. */
  maxMultiplier?: number;
  /** Per-city rates (admin panel); defaults to the built-in [FARE_RULES]. A null / missing waitPerMin uses the built-in one. */
  rule?: { base: number; perKm: number; perMin: number; minFare: number; waitPerMin?: number | null };
  /** Free waiting minutes and the waiting-charge cap (admin settings); defaults to [WAIT_DEFAULTS]. */
  waiting?: { freeMin: number; maxCharge: number };
  /** Night fare multiplier for this vehicle now (fares.service.ts `nightMultiplier`); missing or 1 = none. */
  night?: number;
}): FareQuote {
  const { vehicleKind, route } = params;
  const rule = params.rule ?? FARE_RULES[vehicleKind];
  const waiting = params.waiting ?? WAIT_DEFAULTS;
  const cap = Math.max(1, params.maxMultiplier ?? MAX_MULTIPLIER);
  const multiplier = Math.min(cap, Math.max(1, params.multiplier ?? CURRENT_MULTIPLIER));
  const distanceCharge = floorRupee(rule.perKm * route.distanceKm);
  const timeCharge = floorRupee(rule.perMin * route.durationMin);
  const raw = rule.base + distanceCharge + timeCharge;
  const surged = floorRupee(raw * multiplier);
  const dayTopUp = Math.max(0, rule.minFare - surged);
  const dayTotal = surged + dayTopUp;
  const night = Math.max(1, params.night ?? 1);
  const regular = Math.max(raw, rule.minFare);
  const nightTotal = floorRupee(regular * night);
  const isNight = night > 1 && nightTotal >= dayTotal;
  const minFareTopUp = isNight ? regular - raw : dayTopUp;
  const subtotal = raw + minFareTopUp;
  const total = isNight ? nightTotal : dayTotal;
  return {
    vehicleKind,
    ...route,
    base: rule.base,
    distanceCharge,
    timeCharge,
    minFareTopUp,
    subtotal,
    multiplier: isNight ? night : multiplier,
    peakCharge: total - subtotal,
    night: isNight,
    waitingCharge: 0,
    freeWaitMin: Math.max(0, waiting.freeMin),
    waitPerMin: Math.max(0, Math.floor(rule.waitPerMin ?? FARE_RULES[vehicleKind].waitPerMin)),
    waitMaxCharge: Math.max(0, Math.floor(waiting.maxCharge)),
    total,
  };
}

const MINUTE_MS = 60_000;

/**
 * Waiting charge for [waitedMs] at the pickup (driver arrived → ride started): the first [freeMin] minutes are free,
 * then every started minute costs [perMin] rupees, capped at [maxCharge]. E.g. 3 free, ₹1/min: 3:00 → ₹0,
 * 3:01 → ₹1, 5:30 → ₹3.
 */
export function waitingCharge(p: { waitedMs: number; freeMin: number; perMin: number; maxCharge: number }): number {
  const overMs = p.waitedMs - Math.max(0, p.freeMin) * MINUTE_MS;
  if (!(overMs > 0) || p.perMin <= 0 || p.maxCharge <= 0) return 0;
  const minutes = Math.ceil(overMs / MINUTE_MS - EPS);
  return Math.min(Math.floor(p.maxCharge), minutes * Math.floor(p.perMin));
}

/** Waiting terms of a stored fare; fares stored before waiting charges existed get [fallback]. */
export function waitingTerms(
  fare: Partial<Pick<FareQuote, 'freeWaitMin' | 'waitPerMin' | 'waitMaxCharge'>> | null | undefined,
  fallback: { freeMin: number; perMin: number; maxCharge: number },
): { freeMin: number; perMin: number; maxCharge: number } {
  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return { freeMin: num(fare?.freeWaitMin, fallback.freeMin), perMin: num(fare?.waitPerMin, fallback.perMin), maxCharge: num(fare?.waitMaxCharge, fallback.maxCharge) };
}

/** [fare] with its waiting line set to [charge] (replacing any earlier one); the total moves by the difference. */
export function withWaitingCharge<T extends { total: number; waitingCharge?: number }>(fare: T, charge: number): T & { waitingCharge: number } {
  const was = fare.waitingCharge ?? 0;
  return { ...fare, waitingCharge: charge, total: fare.total - was + charge };
}
