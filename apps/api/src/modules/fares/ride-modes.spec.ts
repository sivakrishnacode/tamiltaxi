import { readFileSync } from 'node:fs';

import { VehicleKind } from '../../generated/prisma/enums.js';
import { modeQuote, type OutstationTerms, outstationTerms, rentalTerms, settleMode, waitCharge, withSettlement } from './ride-modes.js';

describe('rentals', () => {
  it('prices a package per cab tier and settles extra km and minutes at the end', () => {
    const t = rentalTerms('CAB', '4h')!;
    expect(t).toMatchObject({ hours: 4, km: 40, price: 849, extraKmRate: 12, extraMinRate: 2 });
    expect(rentalTerms('SUV', '4h')!.price).toBe(1279);
    expect(rentalTerms('CAB', '5h')).toBeNull();
    const q = modeQuote(VehicleKind.CAB, t, { distanceKm: 40, durationMin: 240 });
    expect(q).toMatchObject({ base: 849, total: 849, multiplier: 1, peakCharge: 0 });
    // Inside the package: nothing more.
    expect(settleMode(t, 31.4, 200)).toEqual({ extraKm: 0, extraMin: 0, extraKmCharge: 0, extraTimeCharge: 0 });
    // 46.2 km in 4 h 25 min (and a few seconds): 6.2 km × ₹12 = ₹74, 26 started minutes × ₹2 = ₹52.
    const s = settleMode(t, 46.2, 265.2);
    expect(s).toEqual({ extraKm: 6.2, extraMin: 26, extraKmCharge: 74, extraTimeCharge: 52 });
    expect(withSettlement(q, s).total).toBe(849 + 74 + 52);
    // GPS distance failed: no km charge, time still counts.
    expect(settleMode(t, null, 250).extraKmCharge).toBe(0);
  });
});

describe('outstation', () => {
  const leave = new Date('2026-10-06T00:30:00Z'); // Tue 6:00 am IST

  it('one way: the route km (at least the minimum) at the one-way rate plus a day of allowance, fixed', () => {
    const t = outstationTerms({ kind: 'SEDAN', routeKm: 87.4, driveMin: 140, roundTrip: false, leaveAt: leave, returnAt: null });
    expect(t).toMatchObject({ roundTrip: false, days: 1, includedKm: 88, perKm: 15, allowancePerDay: 300 });
    expect(modeQuote(VehicleKind.SEDAN, t, { distanceKm: 87.4, durationMin: 120 }).total).toBe(88 * 15 + 300);
    expect(outstationTerms({ kind: 'CAB', routeKm: 22, driveMin: 35, roundTrip: false, leaveAt: leave, returnAt: null }).includedKm).toBe(60);
    expect(settleMode(t, 140, 600).extraKmCharge).toBe(0);
  });

  it("round trip by time: both ways' km, waiting there by the hour, allowance per 24 hours, late return at the end", () => {
    const pollachi = (returnAt: Date | null): OutstationTerms =>
      outstationTerms({ kind: 'CAB', routeKm: 40.1, driveMin: 55, roundTrip: true, leaveAt: leave, returnAt });
    const after = (min: number): Date => new Date(leave.getTime() + min * 60_000);
    // No return time: straight back, 81 km × ₹11 and a day's allowance, nothing for waiting.
    const quick = pollachi(null);
    expect(quick).toMatchObject({ days: 1, includedKm: 81, perKm: 11, awayMin: 110, waitMin: 0, waitPerHour: 90, returnAt: '2026-10-06T02:20:00.000Z' });
    expect(modeQuote(VehicleKind.CAB, quick, { distanceKm: 81, durationMin: 110 }).total).toBe(81 * 11 + 300);
    // A return before the drive both ways is straight back too.
    expect(pollachi(after(60)).awayMin).toBe(110);
    // Back at 8 pm: 14 h away, 12 h 10 min waiting at ₹90 an hour, in the time charge with the allowance.
    const evening = pollachi(after(840));
    expect(evening).toMatchObject({ days: 1, awayMin: 840, waitMin: 730, returnAt: '2026-10-06T14:30:00.000Z' });
    expect(waitCharge(evening)).toBe(1095);
    expect(modeQuote(VehicleKind.CAB, evening, { distanceKm: 81, durationMin: 840 })).toMatchObject({ base: 891, timeCharge: 300 + 1095, total: 891 + 300 + 1095 });
    // Allowance per 24 hours away, not per calendar day.
    expect(pollachi(after(1440)).days).toBe(1);
    expect(pollachi(after(1500)).days).toBe(2);
    // Back 40 min late: the 10 min past the free 30 at ₹90 an hour, and the km past both ways.
    expect(settleMode(evening, 85.3, 840 + 40)).toEqual({ extraKm: 4.3, extraMin: 10, extraKmCharge: 47, extraTimeCharge: 15 });
    expect(settleMode(evening, 80, 840 + 30).extraTimeCharge).toBe(0);
    // Booked before 5 Nov 2026 (km a day, no planned time): its own lines, only km at the end.
    const old: OutstationTerms = { mode: 'OUTSTATION', roundTrip: true, returnAt: after(2280).toISOString(), days: 2, includedKm: 500, perKm: 11, allowancePerDay: 300, routeKm: 86 };
    expect(modeQuote(VehicleKind.CAB, old, { distanceKm: 500, durationMin: 2280 }).total).toBe(500 * 11 + 600);
    expect(settleMode(old, 512.3, 5000)).toEqual({ extraKm: 12.3, extraMin: 0, extraKmCharge: 135, extraTimeCharge: 0 });
  });
});

describe('shared ride-mode cases (same as the apps)', () => {
  const cases = JSON.parse(readFileSync(new URL('../../../../../packages/tamiltaxi_data/test/fixtures/ride_mode_cases.json', import.meta.url), 'utf8')) as {
    rental: { name: string; input: { kind: 'CAB' | 'SEDAN' | 'SUV'; packageId: string; actualKm: number | null; actualMin: number }; expected: Record<string, unknown> }[];
    outstation: {
      name: string;
      input: { kind: 'CAB' | 'SEDAN' | 'SUV'; routeKm: number; driveMin: number; roundTrip: boolean; leaveAt: string; returnAt: string | null; actualKm: number; actualMin?: number };
      expected: Record<string, unknown>;
    }[];
  };

  it.each(cases.rental)('$name', ({ input, expected }) => {
    const t = rentalTerms(input.kind, input.packageId)!;
    const q = modeQuote(input.kind as VehicleKind, t, { distanceKm: t.km, durationMin: t.hours * 60 });
    expect({ price: t.price, extraKmRate: t.extraKmRate, extraMinRate: t.extraMinRate, total: q.total, settlement: settleMode(t, input.actualKm, input.actualMin) }).toEqual(expected);
  });

  it.each(cases.outstation)('$name', ({ input, expected }) => {
    const t = outstationTerms({ kind: input.kind, routeKm: input.routeKm, driveMin: input.driveMin, roundTrip: input.roundTrip, leaveAt: new Date(input.leaveAt), returnAt: input.returnAt ? new Date(input.returnAt) : null });
    const q = modeQuote(input.kind as VehicleKind, t, { distanceKm: input.routeKm, durationMin: 60 });
    const settlement = settleMode(t, input.actualKm, input.actualMin ?? 600);
    expect({ days: t.days, includedKm: t.includedKm, perKm: t.perKm, allowancePerDay: t.allowancePerDay, awayMin: t.awayMin, waitMin: t.waitMin, total: q.total, settlement }).toEqual(expected);
  });
});
