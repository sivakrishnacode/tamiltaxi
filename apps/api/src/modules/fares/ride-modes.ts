import { VehicleKind } from '../../generated/prisma/enums.js';
import type { FareQuote } from './fare-engine.js';

/**
 * Cab rentals (hourly packages) and outstation trips (intercity, one way or round trip), for the cab tiers only.
 * Same rates as the apps (packages/tamiltaxi_data/lib/src/ride_modes.dart); the shared cases live in
 * packages/tamiltaxi_data/test/fixtures/ride_mode_cases.json. No surge on either: the price is agreed up front.
 */

/** The tiers that do rentals and outstation trips: Mini, Sedan, SUV. */
export const CAB_TIERS: readonly VehicleKind[] = [VehicleKind.CAB, VehicleKind.SEDAN, VehicleKind.SUV];
export type CabTier = 'CAB' | 'SEDAN' | 'SUV';

export const isCabTier = (k: VehicleKind): k is CabTier => (CAB_TIERS as readonly string[]).includes(k);

// ------------------------------------------------------------------------------------------------- rentals

export interface RentalPackage {
  readonly id: string;
  readonly hours: number;
  readonly km: number;
}

/** 1 h / 10 km … 12 h / 120 km. */
export const RENTAL_PACKAGES: readonly RentalPackage[] = [
  { id: '1h', hours: 1, km: 10 },
  { id: '2h', hours: 2, km: 20 },
  { id: '3h', hours: 3, km: 30 },
  { id: '4h', hours: 4, km: 40 },
  { id: '6h', hours: 6, km: 60 },
  { id: '8h', hours: 8, km: 80 },
  { id: '10h', hours: 10, km: 100 },
  { id: '12h', hours: 12, km: 120 },
];

/** Package prices (₹, in [RENTAL_PACKAGES] order) and the rates past the package's km and time, per cab tier. */
export type RentalRates = Readonly<Record<CabTier, { prices: readonly number[]; extraKm: number; extraMin: number }>>;

/** The built-in rental prices (a city may set its own, fares/pricing.ts). */
export const RENTAL_RATES: RentalRates = {
  CAB: { prices: [249, 449, 649, 849, 1249, 1599, 1999, 2349], extraKm: 12, extraMin: 2 },
  SEDAN: { prices: [289, 519, 749, 979, 1429, 1849, 2299, 2699], extraKm: 14, extraMin: 2.5 },
  SUV: { prices: [379, 679, 979, 1279, 1879, 2399, 2999, 3499], extraKm: 18, extraMin: 3 },
};

/** What a rental trip agreed to (stored in `Trip.modeTerms`). */
export interface RentalTerms {
  readonly mode: 'RENTAL';
  readonly packageId: string;
  readonly hours: number;
  readonly km: number;
  readonly price: number;
  readonly extraKmRate: number;
  readonly extraMinRate: number;
}

export function rentalPackage(id: string): RentalPackage | undefined {
  return RENTAL_PACKAGES.find((p) => p.id === id);
}

export function rentalTerms(kind: CabTier, packageId: string, rates: RentalRates = RENTAL_RATES): RentalTerms | null {
  const i = RENTAL_PACKAGES.findIndex((p) => p.id === packageId);
  if (i < 0) return null;
  const p = RENTAL_PACKAGES[i];
  const r = rates[kind];
  return { mode: 'RENTAL', packageId: p.id, hours: p.hours, km: p.km, price: r.prices[i], extraKmRate: r.extraKm, extraMinRate: r.extraMin };
}

// ---------------------------------------------------------------------------------------------- outstation

/**
 * One way: the route km (at least [oneWayMinKm]) at [oneWayPerKm] (the driver drives back empty) and a day's
 * allowance. Round trip, priced by time (5 Nov 2026, like Red Taxi): both ways' km at [roundTripPerKm], the time
 * waiting there (time away past the drive both ways) at [waitPerHour], and the allowance per 24 hours away. Tolls,
 * parking and state permits are paid by the rider on the way.
 */
export type OutstationRates = Readonly<
  Record<CabTier, { oneWayPerKm: number; roundTripPerKm: number; allowancePerDay: number; oneWayMinKm: number; waitPerHour: number }>
>;

/** The built-in outstation rates (a city may set its own, fares/pricing.ts). */
export const OUTSTATION_RATES: OutstationRates = {
  CAB: { oneWayPerKm: 14, roundTripPerKm: 11, allowancePerDay: 300, oneWayMinKm: 60, waitPerHour: 90 },
  SEDAN: { oneWayPerKm: 15, roundTripPerKm: 12, allowancePerDay: 300, oneWayMinKm: 60, waitPerHour: 100 },
  SUV: { oneWayPerKm: 19, roundTripPerKm: 16, allowancePerDay: 400, oneWayMinKm: 60, waitPerHour: 130 },
};

/** Up to a week away (round trips and how far ahead a trip can be scheduled). */
export const MAX_DAYS_AHEAD = 7;
/** A round trip back this much later than booked pays nothing more (ETA error, a slow ghat road). */
export const LATE_GRACE_MIN = 30;
const DAY_MIN = 1440;

/** What an outstation trip agreed to (stored in `Trip.modeTerms`). */
export interface OutstationTerms {
  readonly mode: 'OUTSTATION';
  readonly roundTrip: boolean;
  /** Round trip: when the rider comes back (ISO); straight back = leaving + the drive both ways. */
  readonly returnAt: string | null;
  /** Days of driver allowance: 1 one way; a round trip's 24-hour blocks away (26 h = 2). */
  readonly days: number;
  /** One way: the route km (or the minimum); round trip: both ways' km, included in the price. */
  readonly includedKm: number;
  readonly perKm: number;
  readonly allowancePerDay: number;
  readonly routeKm: number;
  /** Round trip (none on trips booked before 5 Nov 2026): the drive one way, minutes. */
  readonly driveMin?: number;
  /** Round trip: minutes from leaving to coming back, at least the drive both ways. */
  readonly awayMin?: number;
  /** Round trip: minutes waiting there that the price includes (away − the drive both ways). */
  readonly waitMin?: number;
  /** Round trip: ₹ an hour of waiting, and of a late return past [LATE_GRACE_MIN]. */
  readonly waitPerHour?: number;
}

/**
 * [p.returnAt] null, or before the drive both ways ([p.driveMin] each), means straight back: leaving + the drive
 * both ways (the rider app's default, Red Taxi style).
 */
export function outstationTerms(p: {
  kind: CabTier;
  routeKm: number;
  driveMin: number;
  roundTrip: boolean;
  leaveAt: Date;
  returnAt: Date | null;
  rates?: OutstationRates;
}): OutstationTerms {
  const r = (p.rates ?? OUTSTATION_RATES)[p.kind];
  const routeKm = Math.round(p.routeKm * 10) / 10;
  if (!p.roundTrip) {
    return { mode: 'OUTSTATION', roundTrip: false, returnAt: null, days: 1, includedKm: Math.max(r.oneWayMinKm, Math.ceil(routeKm)), perKm: r.oneWayPerKm, allowancePerDay: r.allowancePerDay, routeKm };
  }
  const driveMin = Math.max(1, Math.round(p.driveMin));
  const asked = p.returnAt ? Math.round((p.returnAt.getTime() - p.leaveAt.getTime()) / 60_000) : 0;
  const straightBack = asked < 2 * driveMin;
  const awayMin = straightBack ? 2 * driveMin : asked;
  return {
    mode: 'OUTSTATION',
    roundTrip: true,
    returnAt: (straightBack ? new Date(p.leaveAt.getTime() + awayMin * 60_000) : (p.returnAt as Date)).toISOString(),
    days: Math.max(1, Math.ceil(awayMin / DAY_MIN)),
    includedKm: Math.ceil(2 * routeKm),
    perKm: r.roundTripPerKm,
    allowancePerDay: r.allowancePerDay,
    routeKm,
    driveMin,
    awayMin,
    waitMin: awayMin - 2 * driveMin,
    waitPerHour: r.waitPerHour,
  };
}

/** A round trip's waiting there, whole rupees rounded down (0 one way and on older trips). */
export function waitCharge(t: OutstationTerms): number {
  return Math.floor(((t.waitMin ?? 0) * (t.waitPerHour ?? 0)) / 60);
}

// ------------------------------------------------------------------------------------------------- quotes

export type ModeTerms = RentalTerms | OutstationTerms;

/**
 * The fare lines for [terms], in the usual quote shape so every screen and the receipt read it the same way:
 * `base` is the package price (rental) or the km charge (outstation), `timeCharge` the driver allowance plus a round
 * trip's waiting there ([waitCharge]; apps before 0.1.3 show it all as the allowance, so the lines still add up).
 * [distanceKm] / [durationMin]: what the trip is planned to cover.
 */
export function modeQuote(kind: VehicleKind, terms: ModeTerms, plan: { distanceKm: number; durationMin: number; travelMin?: number }): FareQuote {
  // Floored like the apps' engine: per-city ₹/km may have paise, and the fare columns are whole rupees.
  const base = terms.mode === 'RENTAL' ? terms.price : Math.floor(terms.includedKm * terms.perKm);
  const allowance = terms.mode === 'OUTSTATION' ? terms.allowancePerDay * terms.days + waitCharge(terms) : 0;
  const total = base + allowance;
  return {
    vehicleKind: kind,
    distanceKm: plan.distanceKm,
    durationMin: plan.durationMin,
    ...(plan.travelMin !== undefined && { travelMin: plan.travelMin }),
    base,
    distanceCharge: 0,
    timeCharge: allowance,
    minFareTopUp: 0,
    subtotal: total,
    multiplier: 1,
    peakCharge: 0,
    night: false,
    waitingCharge: 0,
    freeWaitMin: 0,
    waitPerMin: 0,
    waitMaxCharge: 0,
    total,
  };
}

/** What a finished rental / round trip adds past what it included (km and, for rentals, minutes); whole rupees. */
export interface ModeSettlement {
  readonly extraKm: number;
  readonly extraMin: number;
  readonly extraKmCharge: number;
  readonly extraTimeCharge: number;
}

/**
 * The extra for [terms] after [actualKm] and [actualMin] (null km: the GPS distance failed, so nothing is added for
 * km). One-way outstation trips are fixed; a round trip back later than booked pays the time past
 * [LATE_GRACE_MIN] at its waiting rate. Each line rounded down, like the fare engine.
 */
export function settleMode(terms: ModeTerms, actualKm: number | null, actualMin: number): ModeSettlement {
  if (terms.mode === 'OUTSTATION' && !terms.roundTrip) return { extraKm: 0, extraMin: 0, extraKmCharge: 0, extraTimeCharge: 0 };
  const allowedKm = terms.mode === 'RENTAL' ? terms.km : terms.includedKm;
  const extraKm = actualKm === null ? 0 : Math.max(0, Math.round((actualKm - allowedKm) * 10) / 10);
  const kmRate = terms.mode === 'RENTAL' ? terms.extraKmRate : terms.perKm;
  const extraKmCharge = Math.floor(extraKm * kmRate + 1e-9);
  if (terms.mode === 'OUTSTATION') {
    // Older round trips (before 5 Nov 2026) had no planned time: nothing added for time.
    const late = terms.awayMin == null ? 0 : Math.max(0, Math.ceil(actualMin - terms.awayMin - LATE_GRACE_MIN));
    return { extraKm, extraMin: late, extraKmCharge, extraTimeCharge: Math.floor((late * (terms.waitPerHour ?? 0)) / 60) };
  }
  const extraMin = Math.max(0, Math.ceil(actualMin - terms.hours * 60));
  return { extraKm, extraMin, extraKmCharge, extraTimeCharge: Math.floor(extraMin * terms.extraMinRate + 1e-9) };
}

/** [fare] with the settlement lines added to its total (stored as `extraKmCharge` / `extraTimeCharge`). */
export function withSettlement<T extends { total: number }>(fare: T, s: ModeSettlement): T & ModeSettlement {
  return { ...fare, ...s, total: fare.total + s.extraKmCharge + s.extraTimeCharge };
}
