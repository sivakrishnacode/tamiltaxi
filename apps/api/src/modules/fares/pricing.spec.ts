import { VehicleKind } from '../../generated/prisma/enums.js';
import { goodsOutstationTerms, shiftingLines } from './goods-modes.js';
import { DEFAULT_PRICING, effectivePricing, isPricingSection, parsePricingSection } from './pricing.js';
import { modeQuote, outstationTerms, rentalTerms } from './ride-modes.js';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('city pricing', () => {
  it('the built-in rates parse as they are (every section round-trips)', () => {
    for (const s of ['rental', 'outstation', 'goodsOutstation', 'shifting'] as const) {
      expect(parsePricingSection(s, clone(DEFAULT_PRICING[s]))).toEqual({ value: DEFAULT_PRICING[s] });
    }
    expect(isPricingSection('rental')).toBe(true);
    expect(isPricingSection('surge')).toBe(false);
  });

  it('refuses a section with a missing tier, a wrong count, an out-of-range or a shrinking price', () => {
    const rental = clone(DEFAULT_PRICING.rental) as unknown as Record<string, { prices: number[]; extraKm: number; extraMin: number }>;
    delete (rental as Record<string, unknown>).SUV;
    expect(parsePricingSection('rental', rental)).toEqual({ error: 'SUV: a price for each of the 8 packages' });
    const short = clone(DEFAULT_PRICING.rental) as unknown as Record<string, { prices: number[] }>;
    short.CAB.prices = [249, 449];
    expect(parsePricingSection('rental', short)).toMatchObject({ error: expect.stringContaining('Mini') });
    const cheaper = clone(DEFAULT_PRICING.rental) as unknown as Record<string, { prices: number[] }>;
    cheaper.SEDAN.prices[3] = 100;
    expect(parsePricingSection('rental', cheaper)).toEqual({ error: "Sedan: a longer package can't cost less than a shorter one" });
    const fraction = clone(DEFAULT_PRICING.rental) as unknown as Record<string, { prices: number[] }>;
    fraction.CAB.prices[0] = 249.5;
    expect(parsePricingSection('rental', fraction)).toMatchObject({ error: expect.stringContaining('whole number') });
    const bad = clone(DEFAULT_PRICING.shifting) as unknown as { sizes: Record<string, { vehicle: string }>; weekendPct: number };
    bad.sizes.ONE_BHK.vehicle = 'GOODS_BIKE';
    expect(parsePricingSection('shifting', bad)).toEqual({ error: '1 BHK: choose a goods truck' });
    const pct = clone(DEFAULT_PRICING.shifting) as unknown as { weekendPct: number };
    pct.weekendPct = 150;
    expect(parsePricingSection('shifting', pct)).toMatchObject({ error: expect.stringContaining('Weekend') });
    expect(parsePricingSection('goodsOutstation', null)).toEqual({ error: 'Goods rates are missing' });
  });

  it("a city's sections win over the built-in ones; a missing or broken one falls back", () => {
    const rental = clone(DEFAULT_PRICING.rental) as unknown as Record<string, { prices: number[] }>;
    rental.SEDAN.prices = rental.SEDAN.prices.map((p) => p + 100);
    const p = effectivePricing({ rental, outstation: { CAB: 'nonsense' }, shifting: null });
    expect(p.rental.SEDAN.prices[3]).toBe(1079);
    expect(p.outstation).toBe(DEFAULT_PRICING.outstation);
    expect(p.shifting).toBe(DEFAULT_PRICING.shifting);
    expect(effectivePricing(null)).toBe(DEFAULT_PRICING);
  });

  it('outstation rows saved before round trips were priced by time keep their rates and get the built-in waiting rate', () => {
    const saved = clone(DEFAULT_PRICING.outstation) as unknown as Record<string, Record<string, number>>;
    for (const tier of Object.values(saved)) {
      delete tier.waitPerHour;
      tier.roundTripKmPerDay = 250;
    }
    saved.SEDAN.roundTripPerKm = 13;
    const p = effectivePricing({ outstation: saved });
    expect(p.outstation.SEDAN).toEqual({ ...DEFAULT_PRICING.outstation.SEDAN, roundTripPerKm: 13 });
    expect(p.outstation.CAB.waitPerHour).toBe(90);
    const bad = clone(DEFAULT_PRICING.outstation) as unknown as Record<string, Record<string, number>>;
    bad.SUV.waitPerHour = 99.5;
    expect(parsePricingSection('outstation', bad)).toMatchObject({ error: expect.stringContaining('SUV waiting') });
  });

  it('custom rates change every up-front price', () => {
    const rental = { ...DEFAULT_PRICING.rental, SEDAN: { prices: [300, 550, 800, 1000, 1500, 1900, 2350, 2750], extraKm: 15, extraMin: 2.5 } };
    expect(rentalTerms('SEDAN', '4h', rental)).toMatchObject({ price: 1000, extraKmRate: 15 });
    expect(rentalTerms('SEDAN', '4h')).toMatchObject({ price: 979 });

    const outstation = { ...DEFAULT_PRICING.outstation, CAB: { ...DEFAULT_PRICING.outstation.CAB, oneWayPerKm: 16, allowancePerDay: 350 } };
    const t = outstationTerms({ kind: 'CAB', routeKm: 100, driveMin: 120, roundTrip: false, leaveAt: new Date(), returnAt: null, rates: outstation });
    expect(modeQuote(VehicleKind.CAB, t, { distanceKm: 100, durationMin: 120 }).total).toBe(100 * 16 + 350);

    const goods = { ...DEFAULT_PRICING.goodsOutstation, PICKUP: { perKm: 33, minKm: 50 } };
    expect(goodsOutstationTerms('PICKUP', 20, goods)).toMatchObject({ includedKm: 50, perKm: 33 });

    const shifting = { ...DEFAULT_PRICING.shifting, helperCity: 500, stairsPerFloor: 200, weekendPct: 0 };
    const details = {
      homeSize: 'ONE_BHK', between: false, pickupFloor: 2, pickupLift: false, dropFloor: 0, dropLift: false,
      packing: 'NONE', dismantlePieces: 0, unpack: false, extraHelpers: 0,
    } as const;
    const saturday = new Date('2026-10-03T03:30:00Z');
    expect(shiftingLines(details, 1000, saturday, shifting)).toMatchObject({ helpers: 1000, stairs: 400, weekend: 0, total: 2400 });
    expect(shiftingLines(details, 1000, saturday).weekend).toBeGreaterThan(0);
  });
});
