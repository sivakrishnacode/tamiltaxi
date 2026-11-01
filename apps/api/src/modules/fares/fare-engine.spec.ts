import { readFileSync } from 'node:fs';

import type { VehicleKind } from '../../generated/prisma/enums.js';
import { estimateRoute, quoteFare, WAIT_DEFAULTS, waitingCharge, waitingTerms, withWaitingCharge } from './fare-engine.js';

/** Shared with the Dart engine's test, so the two engines can't drift apart. */
interface FareCase {
  readonly name: string;
  readonly input: { vehicleKind: VehicleKind; distanceKm: number; durationMin: number; multiplier: number; maxMultiplier?: number };
  readonly expected: Record<string, number>;
}
interface WaitingCase {
  readonly name: string;
  readonly input: {
    vehicleKind: VehicleKind;
    waitedSec: number;
    freeWaitMin?: number;
    waitMaxCharge?: number;
    distanceKm?: number;
    durationMin?: number;
    multiplier?: number;
  };
  readonly expected: { waitPerMin: number; waitingCharge: number; total?: number };
}
const FIXTURE = JSON.parse(readFileSync(new URL('../../../../../packages/tamiltaxi_data/test/fixtures/fare_cases.json', import.meta.url), 'utf8')) as {
  cases: FareCase[];
  waitingCases: WaitingCase[];
};
const FARE_CASES = FIXTURE.cases;
const WAITING_CASES = FIXTURE.waitingCases;

const gandhipuram = { lat: 11.0183, lng: 76.9725, placeId: 'gandhipuram' };
const brookefields = { lat: 11.009, lng: 76.96, placeId: 'brookefields' };
const peelamedu = { lat: 11.029, lng: 77.027, placeId: 'peelamedu' };
const raceCourse = { lat: 10.999, lng: 76.978, placeId: 'race-course' };

describe('fare engine', () => {
  it('uses measured distances for the demo routes', () => {
    // Arrange / Act
    const route = estimateRoute(gandhipuram, brookefields);
    // Assert
    expect(route).toEqual({ distanceKm: 4.2, durationMin: 14 });
  });

  it('ignores a demo route id sent with points far from its places', () => {
    const far = { lat: 11.17, lng: 76.96, placeId: 'ukkadam' };
    const route = estimateRoute({ ...gandhipuram, placeId: 'town-hall' }, far);
    expect(route.distanceKm).toBeGreaterThan(20);
  });

  it('adds no peak markup by default', () => {
    const route = estimateRoute(gandhipuram, brookefields);
    const quotes = (['BIKE', 'AUTO', 'CAB'] as const).map((k) => quoteFare({ vehicleKind: k, route }));
    expect(quotes.map((q) => q.total)).toEqual([35, 110, 132]);
    expect(quotes.every((q) => q.multiplier === 1 && q.peakCharge === 0)).toBe(true);
  });

  it('matches the ride fares in the designs (peak 1.1x)', () => {
    const route = estimateRoute(gandhipuram, brookefields);
    const totals = (['BIKE', 'AUTO', 'CAB'] as const).map((k) => quoteFare({ vehicleKind: k, route, multiplier: 1.1 }).total);
    expect(totals).toEqual([38, 121, 145]);
  });

  it('matches the goods fares in the designs (peak 1.1x)', () => {
    const route = estimateRoute(peelamedu, raceCourse);
    const totals = (['GOODS_BIKE', 'THREE_WHEELER', 'MINI_TRUCK'] as const).map(
      (k) => quoteFare({ vehicleKind: k, route, multiplier: 1.1 }).total,
    );
    expect(totals).toEqual([49, 180, 420]);
  });

  it('adds up exactly and caps the multiplier at 1.5x', () => {
    const route = estimateRoute(gandhipuram, raceCourse);
    const q = quoteFare({ vehicleKind: 'CAB', route, multiplier: 3 });
    expect(q.multiplier).toBe(1.5);
    expect(q.base + q.distanceCharge + q.timeCharge + q.minFareTopUp).toBe(q.subtotal);
    expect(q.subtotal + q.peakCharge).toBe(q.total);
  });

  it('caps the multiplier at the admin maxMultiplier', () => {
    const route = estimateRoute(gandhipuram, raceCourse);
    expect(quoteFare({ vehicleKind: 'CAB', route, multiplier: 1.4, maxMultiplier: 1.2 }).multiplier).toBe(1.2);
    expect(quoteFare({ vehicleKind: 'CAB', route, multiplier: 1.4, maxMultiplier: 0.5 }).multiplier).toBe(1);
  });

  it('applies the multiplier before the minimum fare, never to the top-up', () => {
    // Bike 0.5 km / 1 min: 12 + 2 + 0 = 14, × 1.5 = 21, topped up to the ₹25 minimum (not 25 × 1.5).
    const q = quoteFare({ vehicleKind: 'BIKE', route: { distanceKm: 0.5, durationMin: 1 }, multiplier: 1.5 });
    expect(q).toMatchObject({ subtotal: 18, minFareTopUp: 4, peakCharge: 7, total: 25 });
    // Surge that already clears the minimum needs no top-up: 12 + 10 + 0 = 22 × 1.5 = 33.
    const big = quoteFare({ vehicleKind: 'BIKE', route: { distanceKm: 2, durationMin: 1 }, multiplier: 1.5 });
    expect(big).toMatchObject({ minFareTopUp: 0, subtotal: 22, peakCharge: 11, total: 33 });
  });

  it('has the shared fixture cases', () => expect(FARE_CASES.length).toBeGreaterThanOrEqual(10));

  it.each(FARE_CASES)('shared case: $name', ({ input, expected }) => {
    const q = quoteFare({
      vehicleKind: input.vehicleKind,
      route: { distanceKm: input.distanceKm, durationMin: input.durationMin },
      multiplier: input.multiplier,
      maxMultiplier: input.maxMultiplier,
    });
    expect(q).toMatchObject(expected);
  });

  it('has the shared waiting cases', () => expect(WAITING_CASES.length).toBeGreaterThanOrEqual(10));

  it.each(WAITING_CASES)('shared waiting case: $name', ({ input, expected }) => {
    const waiting = { freeMin: input.freeWaitMin ?? WAIT_DEFAULTS.freeMin, maxCharge: input.waitMaxCharge ?? WAIT_DEFAULTS.maxCharge };
    const route = { distanceKm: input.distanceKm ?? 1, durationMin: input.durationMin ?? 1 };
    const q = quoteFare({ vehicleKind: input.vehicleKind, route, multiplier: input.multiplier, waiting });
    expect(q.waitPerMin).toBe(expected.waitPerMin);
    const charge = waitingCharge({ waitedMs: input.waitedSec * 1000, freeMin: q.freeWaitMin, perMin: q.waitPerMin, maxCharge: q.waitMaxCharge });
    expect(charge).toBe(expected.waitingCharge);
    const fare = withWaitingCharge(q, charge);
    expect(fare.subtotal + fare.peakCharge + fare.waitingCharge).toBe(fare.total);
    if (expected.total !== undefined) expect(fare.total).toBe(expected.total);
  });

  it('quotes carry the waiting terms and no waiting charge yet', () => {
    const q = quoteFare({ vehicleKind: 'CAB', route: { distanceKm: 4.2, durationMin: 14 }, waiting: { freeMin: 5, maxCharge: 50 } });
    expect(q).toMatchObject({ waitingCharge: 0, freeWaitMin: 5, waitPerMin: 2, waitMaxCharge: 50 });
    // A city rule's own rate wins; a null one falls back to the built-in rate.
    const rule = { base: 48, perKm: 15, perMin: 1.5, minFare: 90 };
    expect(quoteFare({ vehicleKind: 'CAB', route: q, rule: { ...rule, waitPerMin: 3 } }).waitPerMin).toBe(3);
    expect(quoteFare({ vehicleKind: 'CAB', route: q, rule: { ...rule, waitPerMin: null } }).waitPerMin).toBe(2);
  });

  it('replaces an earlier waiting line instead of adding it twice', () => {
    const q = withWaitingCharge(quoteFare({ vehicleKind: 'BIKE', route: { distanceKm: 4.2, durationMin: 14 } }), 5);
    expect(withWaitingCharge(q, 7)).toMatchObject({ waitingCharge: 7, total: 35 + 7 });
  });

  it('reads the terms of a stored fare, with a fallback for fares from before waiting charges', () => {
    const fallback = { freeMin: 3, perMin: 1, maxCharge: 30 };
    expect(waitingTerms({ freeWaitMin: 5, waitPerMin: 2, waitMaxCharge: 40 }, fallback)).toEqual({ freeMin: 5, perMin: 2, maxCharge: 40 });
    expect(waitingTerms({}, fallback)).toEqual(fallback);
    expect(waitingTerms(null, fallback)).toEqual(fallback);
  });
});
