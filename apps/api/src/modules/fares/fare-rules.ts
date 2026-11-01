import type { VehicleKind } from '../../generated/prisma/enums.js';

/** Per-vehicle rates. fare = max(minFare, (base + perKm × km + perMin × min) × multiplier). */
export interface FareRule {
  readonly base: number;
  readonly perKm: number;
  readonly perMin: number;
  readonly minFare: number;
  /** Waiting charge: rupees per started minute the driver waits at the pickup after the free minutes. */
  readonly waitPerMin: number;
  /** Minutes until the nearest driver usually arrives (display only). */
  readonly etaMin: number;
  readonly isGoods: boolean;
  /** Seats (rides) or capacity in kg (goods). */
  readonly capacity: number;
}

/**
 * Same rates as the apps (packages/tamiltaxi_data/lib/src/seed.dart), in the order the vehicle list shows them:
 * Bike, Scooty, Auto, Auto Priority (autos, offered first: vehicle-match.ts), Mini (CAB), Sedan, SUV.
 */
export const FARE_RULES: Readonly<Record<VehicleKind, FareRule>> = {
  BIKE: { base: 12, perKm: 5, perMin: 0.15, minFare: 25, waitPerMin: 1, etaMin: 2, isGoods: false, capacity: 1 },
  SCOOTY: { base: 14, perKm: 5.5, perMin: 0.2, minFare: 28, waitPerMin: 1, etaMin: 3, isGoods: false, capacity: 1 },
  // Tamil Nadu government auto fare (G.O. Ms. No. 366, Home (Transport-I), 27 Oct 2026): ₹50 for the first 1.8 km, then
  // ₹25 a km, no time charge, waiting ₹1 a minute. base 5 + 25 × km is exactly ₹50 at 1.8 km; the minimum covers less.
  AUTO: { base: 5, perKm: 25, perMin: 0, minFare: 50, waitPerMin: 1, etaMin: 4, isGoods: false, capacity: 3 },
  // Auto Priority: 1.2 × the government fare (₹60 for 1.8 km, then ₹30 a km).
  AUTO_PRIORITY: { base: 6, perKm: 30, perMin: 0, minFare: 60, waitPerMin: 1, etaMin: 3, isGoods: false, capacity: 3 },
  CAB: { base: 48, perKm: 15, perMin: 1.5, minFare: 90, waitPerMin: 2, etaMin: 6, isGoods: false, capacity: 4 },
  SEDAN: { base: 58, perKm: 18, perMin: 1.8, minFare: 110, waitPerMin: 2, etaMin: 7, isGoods: false, capacity: 4 },
  SUV: { base: 80, perKm: 24, perMin: 2.2, minFare: 150, waitPerMin: 3, etaMin: 9, isGoods: false, capacity: 6 },
  GOODS_BIKE: { base: 10, perKm: 5, perMin: 0.05, minFare: 30, waitPerMin: 1, etaMin: 3, isGoods: true, capacity: 10 },
  // Parcel on Scooty: a little above the goods bike (like the Scooty ride), 20 kg on the footboard and seat (vehicle-match.ts).
  SCOOTY_PARCEL: { base: 12, perKm: 5.5, perMin: 0.1, minFare: 32, waitPerMin: 1, etaMin: 3, isGoods: true, capacity: 20 },
  // Parcel on Auto: the government auto rate with a ₹5 higher minimum, inside the auto (vehicle-match.ts).
  AUTO_PARCEL: { base: 5, perKm: 25, perMin: 0, minFare: 55, waitPerMin: 1, etaMin: 4, isGoods: true, capacity: 100 },
  THREE_WHEELER: { base: 50, perKm: 15, perMin: 0.55, minFare: 120, waitPerMin: 2, etaMin: 6, isGoods: true, capacity: 500 },
  MINI_TRUCK: { base: 140, perKm: 35, perMin: 0.2, minFare: 300, waitPerMin: 3, etaMin: 9, isGoods: true, capacity: 750 },
  PICKUP: { base: 250, perKm: 45, perMin: 1, minFare: 500, waitPerMin: 3, etaMin: 12, isGoods: true, capacity: 1500 },
  TRUCK: { base: 500, perKm: 70, perMin: 1.5, minFare: 1000, waitPerMin: 4, etaMin: 15, isGoods: true, capacity: 4000 },
} as const;

/** Tiers that charge the government night fare (settings `autoNightMultiplier`, fares.service.ts `nightMultiplier`). */
export const NIGHT_FARE_KINDS: ReadonlySet<VehicleKind> = new Set<VehicleKind>(['AUTO', 'AUTO_PRIORITY', 'AUTO_PARCEL']);

/**
 * The vehicles listed for a ride or a parcel in town (P-10, PP-06, "Book any"), in [FARE_RULES] order. Like Porter, the
 * truck isn't one: it goes with Packers & Movers and goods to another town (goods-modes.ts).
 */
export const inTownKinds = (goods: boolean): VehicleKind[] =>
  (Object.keys(FARE_RULES) as VehicleKind[]).filter((k) => FARE_RULES[k].isGoods === goods && k !== 'TRUCK');
