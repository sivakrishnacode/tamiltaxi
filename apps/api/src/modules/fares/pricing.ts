import {
  DEFAULT_SHIFTING_RATES,
  GOODS_OUTSTATION_RATES,
  GOODS_TRUCKS,
  type GoodsOutstationRates,
  type GoodsTruck,
  HOME_SIZES,
  type HomeSize,
  isGoodsTruck,
  type ShiftingRates,
  type ShiftingSize,
} from './goods-modes.js';
import { CAB_TIERS, type CabTier, OUTSTATION_RATES, type OutstationRates, RENTAL_PACKAGES, RENTAL_RATES, type RentalRates } from './ride-modes.js';

/**
 * Per-city prices for the services priced up front: rentals, outstation (cabs), goods to another town and house
 * shifting. A city stores its own section (`CityModePricing`, edited in admin › City › Rentals & more); a section it
 * doesn't store uses the built-in rates. In-town fares per vehicle are `CityFareRule` (admin › City › Fares).
 */
export interface ModePricing {
  readonly rental: RentalRates;
  readonly outstation: OutstationRates;
  readonly goodsOutstation: GoodsOutstationRates;
  readonly shifting: ShiftingRates;
}

export const PRICING_SECTIONS = ['rental', 'outstation', 'goodsOutstation', 'shifting'] as const;
export type PricingSection = (typeof PRICING_SECTIONS)[number];

export const isPricingSection = (s: string): s is PricingSection => (PRICING_SECTIONS as readonly string[]).includes(s);

export const DEFAULT_PRICING: ModePricing = {
  rental: RENTAL_RATES,
  outstation: OUTSTATION_RATES,
  goodsOutstation: GOODS_OUTSTATION_RATES,
  shifting: DEFAULT_SHIFTING_RATES,
};

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);

/** A number within [min, max] (whole when [whole]), or a message naming [what]. */
function num(v: unknown, what: string, min: number, max: number, whole = false): number | string {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (whole && !Number.isInteger(v))) {
    return `${what} must be ${whole ? 'a whole number ' : ''}from ${min} to ${max}`;
  }
  return v;
}

class Invalid extends Error {}
const need = (v: number | string): number => {
  if (typeof v === 'string') throw new Invalid(v);
  return v;
};

const TIER_LABEL: Record<CabTier, string> = { CAB: 'Mini', SEDAN: 'Sedan', SUV: 'SUV' };
const TRUCK_LABEL: Record<GoodsTruck, string> = { THREE_WHEELER: '3-wheeler', MINI_TRUCK: 'Mini truck', PICKUP: 'Pickup', TRUCK: 'Truck' };
const SIZE_LABEL: Record<HomeSize, string> = { FEW_ITEMS: 'A few items', ONE_RK: '1 RK', ONE_BHK: '1 BHK', TWO_BHK: '2 BHK', THREE_BHK: '3 BHK' };

function rental(raw: unknown): RentalRates {
  if (!isObj(raw)) throw new Invalid('Rental prices are missing');
  const out = {} as Record<CabTier, { prices: number[]; extraKm: number; extraMin: number }>;
  for (const tier of CAB_TIERS as CabTier[]) {
    const r = raw[tier];
    const label = TIER_LABEL[tier];
    if (!isObj(r) || !Array.isArray(r.prices) || r.prices.length !== RENTAL_PACKAGES.length) {
      throw new Invalid(`${label}: a price for each of the ${RENTAL_PACKAGES.length} packages`);
    }
    const prices = r.prices.map((p, i) => need(num(p, `${label} ${RENTAL_PACKAGES[i].hours} h`, 1, 50_000, true)));
    for (let i = 1; i < prices.length; i++) {
      if (prices[i] < prices[i - 1]) throw new Invalid(`${label}: a longer package can't cost less than a shorter one`);
    }
    out[tier] = {
      prices,
      extraKm: need(num(r.extraKm, `${label} extra ₹/km`, 0, 200)),
      extraMin: need(num(r.extraMin, `${label} extra ₹/min`, 0, 50)),
    };
  }
  return out;
}

function outstation(raw: unknown): OutstationRates {
  if (!isObj(raw)) throw new Invalid('Outstation rates are missing');
  const out = {} as Record<CabTier, OutstationRates[CabTier]>;
  for (const tier of CAB_TIERS as CabTier[]) {
    const r = raw[tier];
    const label = TIER_LABEL[tier];
    if (!isObj(r)) throw new Invalid(`${label}: rates are missing`);
    out[tier] = {
      oneWayPerKm: need(num(r.oneWayPerKm, `${label} one way ₹/km`, 1, 200)),
      roundTripPerKm: need(num(r.roundTripPerKm, `${label} round trip ₹/km`, 1, 200)),
      allowancePerDay: need(num(r.allowancePerDay, `${label} driver allowance`, 0, 5_000, true)),
      oneWayMinKm: need(num(r.oneWayMinKm, `${label} one way minimum km`, 0, 500, true)),
      // Rows saved before round trips were priced by time (5 Nov 2026) have none: the built-in rate.
      waitPerHour: r.waitPerHour == null ? OUTSTATION_RATES[tier].waitPerHour : need(num(r.waitPerHour, `${label} waiting ₹/hour`, 0, 2_000, true)),
    };
  }
  return out;
}

function goodsOutstation(raw: unknown): GoodsOutstationRates {
  if (!isObj(raw)) throw new Invalid('Goods rates are missing');
  const out = {} as Record<GoodsTruck, { perKm: number; minKm: number }>;
  for (const k of GOODS_TRUCKS.filter(isGoodsTruck)) {
    const r = raw[k];
    const label = TRUCK_LABEL[k];
    if (!isObj(r)) throw new Invalid(`${label}: rates are missing`);
    out[k] = { perKm: need(num(r.perKm, `${label} ₹/km`, 1, 500)), minKm: need(num(r.minKm, `${label} minimum km`, 0, 500, true)) };
  }
  return out;
}

function shifting(raw: unknown): ShiftingRates {
  if (!isObj(raw) || !isObj(raw.sizes)) throw new Invalid('Shifting prices are missing');
  const sizes = {} as Record<HomeSize, ShiftingSize>;
  for (const size of HOME_SIZES) {
    const r = (raw.sizes as Raw)[size];
    const label = SIZE_LABEL[size];
    if (!isObj(r) || !isObj(r.packing)) throw new Invalid(`${label}: prices are missing`);
    if (typeof r.vehicle !== 'string' || !isGoodsTruck(r.vehicle as GoodsTruck)) throw new Invalid(`${label}: choose a goods truck`);
    sizes[size] = {
      vehicle: r.vehicle as GoodsTruck,
      helpers: need(num(r.helpers, `${label} helpers`, 0, 10, true)),
      packing: {
        BASIC: need(num(r.packing.BASIC, `${label} basic packing`, 0, 50_000, true)),
        FULL: need(num(r.packing.FULL, `${label} full packing`, 0, 50_000, true)),
      },
      unpack: need(num(r.unpack, `${label} unpacking`, 0, 50_000, true)),
    };
  }
  return {
    sizes,
    helperCity: need(num(raw.helperCity, 'Helper in town', 0, 10_000, true)),
    helperBetween: need(num(raw.helperBetween, 'Helper to another town', 0, 10_000, true)),
    stairsPerFloor: need(num(raw.stairsPerFloor, 'Stairs per floor', 0, 5_000, true)),
    dismantlePerPiece: need(num(raw.dismantlePerPiece, 'Taking apart per piece', 0, 5_000, true)),
    weekendPct: need(num(raw.weekendPct, 'Weekend extra %', 0, 100, true)),
  };
}

const PARSERS: { [S in PricingSection]: (raw: unknown) => ModePricing[S] } = { rental, outstation, goodsOutstation, shifting };

/** [raw] checked as a whole [section] (every tier / vehicle / size, in range): the clean value or what's wrong. */
export function parsePricingSection<S extends PricingSection>(section: S, raw: unknown): { value: ModePricing[S] } | { error: string } {
  try {
    return { value: PARSERS[section](raw) };
  } catch (e) {
    if (e instanceof Invalid) return { error: e.message };
    throw e;
  }
}

/** A city's stored sections over the built-in ones (a stored section that no longer parses falls back too). */
export function effectivePricing(row: Partial<Record<PricingSection, unknown>> | null | undefined): ModePricing {
  if (!row) return DEFAULT_PRICING;
  const pick = <S extends PricingSection>(s: S): ModePricing[S] => {
    if (row[s] == null) return DEFAULT_PRICING[s];
    const parsed = parsePricingSection(s, row[s]);
    return 'value' in parsed ? parsed.value : DEFAULT_PRICING[s];
  };
  return { rental: pick('rental'), outstation: pick('outstation'), goodsOutstation: pick('goodsOutstation'), shifting: pick('shifting') };
}
