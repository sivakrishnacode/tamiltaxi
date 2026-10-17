import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service.js';
import { RideMode, TripKind, VehicleKind } from '../../generated/prisma/enums.js';
import { TripDriversService } from '../drivers/trip-drivers.service.js';
import { womenAmong } from '../drivers/women-drivers.js';
import { GeoService } from '../geo/geo.service.js';
import { EtaService, etasByMode } from '../maps/eta.service.js';
import { MapsService } from '../maps/maps.service.js';
import type { Settings } from '../settings/settings.defaults.js';
import { SettingsService } from '../settings/settings.service.js';
import { FareQuote, GeoPoint, quoteFare, type RouteEstimate } from './fare-engine.js';
import { FARE_RULES, inTownKinds } from './fare-rules.js';
import {
  GOODS_TRUCKS,
  goodsOutstationTerms,
  type GoodsTruck,
  isGoodsTruck,
  type ShiftingDetails,
  type ShiftingLines,
  shiftingLines,
} from './goods-modes.js';
import type { ModePricing } from './pricing.js';
import { CAB_TIERS, isCabTier, type ModeTerms, modeQuote, type OutstationTerms, outstationTerms, rentalPackage, rentalTerms } from './ride-modes.js';

/** A rental / outstation quote with the terms it agrees to. */
export type ModeQuote = FareQuote & { modeTerms: ModeTerms };

/** House shifting: what the rider asked for (the items don't change the price). */
export type ShiftingInput = Omit<ShiftingDetails, 'items'>;

/** A house shift priced for one vehicle and slot. */
export interface ShiftingQuote {
  readonly vehicleKind: VehicleKind;
  readonly distanceKm: number;
  readonly durationMin: number;
  readonly lines: ShiftingLines;
  /** To another town: the vehicle's one-way terms (by the km). */
  readonly modeTerms: OutstationTerms | null;
  /** The vehicle's trip fare in the usual quote shape (the transport line). */
  readonly transportQuote: FareQuote;
}

/** [ShiftingQuote] plus what the rider can compare: every goods truck's total, and the next 7 days' totals. */
export interface ShiftingQuoteResult extends ShiftingQuote {
  readonly vehicles: readonly { vehicleKind: VehicleKind; total: number; suggested: boolean }[];
  /** The total on each of the next 7 days (IST calendar dates; weekends cost more). */
  readonly days: readonly { date: string; total: number; weekend: boolean }[];
}

const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** [hour] o'clock IST on the IST calendar day [dayOffset] days after [now]'s. */
export function istDayAt(now: Date, dayOffset: number, hour: number): Date {
  const istMidnight = Math.floor((now.getTime() + IST_MS) / DAY_MS) * DAY_MS;
  return new Date(istMidnight + dayOffset * DAY_MS + hour * 3_600_000 - IST_MS);
}

/** One vehicle's in-town rates on a rate card. */
export interface RateCardRule {
  base: number;
  perKm: number;
  perMin: number;
  minFare: number;
  waitPerMin: number;
}

/**
 * The driver app's Rate card for a city: every vehicle's in-town rates (the city's, else built-in), the waiting
 * charge, the peak cap, the cancellation fee (null while off) and the up-front prices (rentals, outstation, goods to
 * another town, shifting).
 */
export interface RateCard {
  rules: Record<VehicleKind, RateCardRule>;
  freeWaitMin: number;
  waitMaxCharge: number;
  maxMultiplier: number;
  cancellationFee: number | null;
  pricing: ModePricing;
}

export interface QuoteWithEta extends FareQuote {
  /** Road minutes from the nearest free driver; null = nobody within the maximum search radius right now. */
  readonly pickupEtaMin: number | null;
}

/** The waiting terms from the admin settings. */
export const waitingSettings = (s: Pick<Settings, 'freeWaitMin' | 'waitMaxCharge'>): { freeMin: number; maxCharge: number } => ({
  freeMin: s.freeWaitMin,
  maxCharge: s.waitMaxCharge,
});

/** Nearest drivers (by straight line) whose road ETA is measured per vehicle; the fastest of them wins. */
const ETA_SAMPLE = 3;

/** Quotes vehicles for a route. Distance comes from Google Routes when configured (cached), else haversine. */
@Injectable()
export class FaresService {
  constructor(
    private readonly maps: MapsService,
    private readonly geo: GeoService,
    private readonly drivers: TripDriversService,
    private readonly eta: EtaService,
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Adds each vehicle's pickup ETA (P-10 "3 min away", "Drop 9:24 PM", Fastest). [womenOnly]: Butterfly "only".
   * Every vehicle's nearest drivers are measured together: one [EtaService.minutesMany] (so at most one Route Matrix
   * call) per travel mode, which is one for all vehicles today (all DRIVE).
   */
  async withPickupEta(quotes: readonly FareQuote[], pickup: GeoPoint, opts: { womenOnly: boolean }): Promise<QuoteWithEta[]> {
    const s = await this.settings.all();
    const radiusKm = Math.max(s.searchRadiusKm, s.maxSearchRadiusKm);
    const nearestPer = await Promise.all(
      quotes.map(async (q) => {
        // Bike drivers count for a goods bike (they take parcels too).
        let drivers = await this.drivers.nearby({ kind: q.vehicleKind, ...pickup, radiusKm, limit: ETA_SAMPLE * 2 });
        if (opts.womenOnly) {
          const women = await womenAmong(this.prisma, drivers.map((d) => d.driverId));
          drivers = drivers.filter((d) => women.has(d.driverId));
        }
        return [...drivers].sort((a, b) => a.distanceKm - b.distanceKm).slice(0, ETA_SAMPLE);
      }),
    );
    const etas = await etasByMode(
      quotes.flatMap((q, i) => nearestPer[i].map((d) => ({ at: d, vehicleKind: q.vehicleKind }))),
      (froms, vehicleKind) => this.eta.minutesMany({ froms, to: pickup, vehicleKind, useRoad: s.useRoadEta }),
    );
    let next = 0;
    return quotes.map((q, i): QuoteWithEta => {
      const mine = etas.slice(next, (next += nearestPer[i].length));
      return { ...q, pickupEtaMin: mine.length === 0 ? null : Math.min(...mine) };
    });
  }

  /** The rate card for the city at [point] (built-in rates without a point or outside every city). */
  async rateCard(point: GeoPoint | null): Promise<RateCard> {
    const cityId = point ? (await this.geo.locate(point)).cityId : null;
    const s = await this.settings.all();
    const kinds = Object.keys(FARE_RULES) as VehicleKind[];
    const city = await Promise.all(kinds.map((k) => this.geo.fareRule(cityId, k)));
    const rules = Object.fromEntries(
      kinds.map((k, i) => {
        const b = FARE_RULES[k];
        const r = city[i];
        return [k, { base: r?.base ?? b.base, perKm: r?.perKm ?? b.perKm, perMin: r?.perMin ?? b.perMin, minFare: r?.minFare ?? b.minFare, waitPerMin: r?.waitPerMin ?? b.waitPerMin }];
      }),
    ) as Record<VehicleKind, RateCardRule>;
    return {
      rules,
      freeWaitMin: s.freeWaitMin,
      waitMaxCharge: s.waitMaxCharge,
      maxMultiplier: s.maxMultiplier,
      cancellationFee: s.cancellationFeeEnabled ? s.cancellationFee : null,
      pricing: await this.geo.pricing(cityId),
    };
  }

  async quoteAll(params: { pickup: GeoPoint; drop: GeoPoint; kind: TripKind }): Promise<FareQuote[]> {
    const wantGoods = params.kind === TripKind.PARCEL;
    const route = await this.maps.estimate({ from: params.pickup, to: params.drop, vehicleKind: FaresService.routeVehicle(wantGoods) });
    const here = await this.geo.locate(params.pickup);
    const s = await this.settings.all();
    const kinds = inTownKinds(wantGoods);
    return Promise.all(
      kinds.map(async (vehicleKind) => {
        const rule = (await this.geo.fareRule(here.cityId, vehicleKind)) ?? undefined;
        return quoteFare({ vehicleKind, route, multiplier: here.multiplier, maxMultiplier: s.maxMultiplier, rule, waiting: waitingSettings(s) });
      }),
    );
  }

  /** [vehicleKind] on a route already measured (e.g. a booked trip's), at the pickup's current rates. */
  async quoteOnRoute(params: { pickup: GeoPoint; route: RouteEstimate; vehicleKind: VehicleKind }): Promise<FareQuote> {
    const here = await this.geo.locate(params.pickup);
    const rule = (await this.geo.fareRule(here.cityId, params.vehicleKind)) ?? undefined;
    const s = await this.settings.all();
    return quoteFare({ vehicleKind: params.vehicleKind, route: params.route, multiplier: here.multiplier, maxMultiplier: s.maxMultiplier, rule, waiting: waitingSettings(s) });
  }

  /**
   * The booked vehicle's fare, on the same route [quoteAll] priced for P-10 (the car / three-wheeler route), so the
   * booked fare is the one the passenger saw (and a bike booking doesn't make an extra two-wheeler Routes call).
   */
  async quoteOne(params: { pickup: GeoPoint; drop: GeoPoint; vehicleKind: VehicleKind }): Promise<FareQuote> {
    const route = await this.maps.estimate({ from: params.pickup, to: params.drop, vehicleKind: FaresService.routeVehicle(FARE_RULES[params.vehicleKind].isGoods) });
    const here = await this.geo.locate(params.pickup);
    const rule = (await this.geo.fareRule(here.cityId, params.vehicleKind)) ?? undefined;
    const s = await this.settings.all();
    return quoteFare({ vehicleKind: params.vehicleKind, route, multiplier: here.multiplier, maxMultiplier: s.maxMultiplier, rule, waiting: waitingSettings(s) });
  }

  /**
   * Rental or outstation quotes for the cab tiers (Mini, Sedan, SUV), each with the terms it agrees to
   * (ride-modes.ts). No surge and no city override: the price is fixed up front. Throws 400 for a missing package,
   * drop or return time.
   */
  async modeQuotes(params: {
    pickup: GeoPoint;
    drop?: GeoPoint;
    rideMode: RideMode;
    /** PARCEL: goods to another town (one way, the goods trucks). Default RIDE. */
    kind?: TripKind;
    rentalPackageId?: string;
    roundTrip?: boolean;
    leaveAt: Date;
    returnAt?: Date | null;
  }): Promise<ModeQuote[]> {
    if (params.kind === TripKind.PARCEL) {
      if (params.rideMode !== RideMode.OUTSTATION) throw new BadRequestException('Goods go within town or to another town');
      if (params.roundTrip) throw new BadRequestException('Goods to another town are one way');
      if (!params.drop) throw new BadRequestException('Choose where the goods are going');
      return this.goodsOutstationQuotes({ pickup: params.pickup, drop: params.drop });
    }
    // The pickup's city prices it (its own rates, else the built-in ones).
    const pricing = await this.geo.pricingAt(params.pickup);
    if (params.rideMode === RideMode.RENTAL) {
      const pkg = rentalPackage(params.rentalPackageId ?? '');
      if (!pkg) throw new BadRequestException('Choose a rental package');
      return CAB_TIERS.filter(isCabTier).map((kind) => {
        const terms = rentalTerms(kind, pkg.id, pricing.rental)!;
        return { ...modeQuote(kind, terms, { distanceKm: pkg.km, durationMin: pkg.hours * 60 }), modeTerms: terms };
      });
    }
    if (!params.drop) throw new BadRequestException('Choose where you are going');
    const roundTrip = params.roundTrip === true;
    if (roundTrip && !params.returnAt) throw new BadRequestException('Choose when you come back');
    const route = await this.maps.estimate({ from: params.pickup, to: params.drop, vehicleKind: VehicleKind.CAB });
    return CAB_TIERS.filter(isCabTier).map((kind) => {
      const terms = outstationTerms({ kind, routeKm: route.distanceKm, roundTrip, leaveAt: params.leaveAt, returnAt: params.returnAt ?? null, rates: pricing.outstation });
      const awayMin = roundTrip ? Math.max(route.durationMin * 2, Math.round(((params.returnAt as Date).getTime() - params.leaveAt.getTime()) / 60_000)) : route.durationMin;
      const plan = { distanceKm: roundTrip ? terms.includedKm : route.distanceKm, durationMin: awayMin, ...(typeof route.travelMin === 'number' && { travelMin: route.travelMin }) };
      return { ...modeQuote(kind, terms, plan), modeTerms: terms };
    });
  }

  /** Goods to another town: each goods truck one way by the km (goods-modes.ts), with its terms. */
  async goodsOutstationQuotes(params: { pickup: GeoPoint; drop: GeoPoint }): Promise<ModeQuote[]> {
    const route = await this.maps.estimate({ from: params.pickup, to: params.drop, vehicleKind: FaresService.routeVehicle(true) });
    const rates = (await this.geo.pricingAt(params.pickup)).goodsOutstation;
    const plan = { distanceKm: route.distanceKm, durationMin: route.durationMin, ...(typeof route.travelMin === 'number' && { travelMin: route.travelMin }) };
    return GOODS_TRUCKS.filter(isGoodsTruck).map((kind) => {
      const terms = goodsOutstationTerms(kind, route.distanceKm, rates);
      return { ...modeQuote(kind, terms, plan), modeTerms: terms };
    });
  }

  /**
   * House shifting for [vehicleKind] (default: the one suggested for the home size) at the slot [at]: the vehicle's
   * fare on the goods route (in town: the goods fare engine at the city's rates, no surge; to another town: by the km)
   * plus helpers, stairs, packing and extras. Also every goods truck's total and the next 7 days' totals.
   */
  async shiftingQuote(p: { pickup: GeoPoint; drop: GeoPoint; details: ShiftingInput; vehicleKind?: VehicleKind; at: Date; now?: Date }): Promise<ShiftingQuoteResult> {
    const here = await this.geo.locate(p.pickup);
    const pricing = await this.geo.pricing(here.cityId);
    const rates = pricing.shifting;
    const suggested = rates.sizes[p.details.homeSize].vehicle;
    const kind = p.vehicleKind ?? suggested;
    if (!isGoodsTruck(kind)) throw new BadRequestException('Packers & Movers goes by three-wheeler, mini truck, pickup or truck');
    const route = await this.maps.estimate({ from: p.pickup, to: p.drop, vehicleKind: FaresService.routeVehicle(true) });
    const s = await this.settings.all();
    const plan = { distanceKm: route.distanceKm, durationMin: route.durationMin, ...(typeof route.travelMin === 'number' && { travelMin: route.travelMin }) };
    const transportOf = async (k: GoodsTruck): Promise<{ quote: FareQuote; terms: OutstationTerms | null }> => {
      if (p.details.between) {
        const terms = goodsOutstationTerms(k, route.distanceKm, pricing.goodsOutstation);
        return { quote: modeQuote(k, terms, plan), terms };
      }
      const rule = (await this.geo.fareRule(here.cityId, k)) ?? undefined;
      // Booked for a day ahead: no surge, the price is agreed up front; no waiting charge while loading.
      const q = quoteFare({ vehicleKind: k, route, multiplier: 1, maxMultiplier: s.maxMultiplier, rule, waiting: waitingSettings(s) });
      return { quote: { ...q, freeWaitMin: 0, waitPerMin: 0, waitMaxCharge: 0 }, terms: null };
    };
    const all = await Promise.all(GOODS_TRUCKS.filter(isGoodsTruck).map(async (k) => ({ k, ...(await transportOf(k)) })));
    const mine = all.find((t) => t.k === kind)!;
    const now = p.now ?? new Date();
    return {
      vehicleKind: kind,
      distanceKm: route.distanceKm,
      durationMin: route.durationMin,
      lines: shiftingLines(p.details, mine.quote.total, p.at, rates),
      modeTerms: mine.terms,
      transportQuote: mine.quote,
      vehicles: all.map((t) => ({ vehicleKind: t.k, total: shiftingLines(p.details, t.quote.total, p.at, rates).total, suggested: t.k === suggested })),
      days: Array.from({ length: 7 }, (_, i) => {
        const at = istDayAt(now, i, 9);
        const lines = shiftingLines(p.details, mine.quote.total, at, rates);
        return { date: new Date(at.getTime() + IST_MS).toISOString().slice(0, 10), total: lines.total, weekend: lines.weekend > 0 };
      }),
    };
  }

  /** One route prices every vehicle of a kind: rides on the car route, goods on the three-wheeler route. */
  static routeVehicle(isGoods: boolean): VehicleKind {
    return isGoods ? VehicleKind.THREE_WHEELER : VehicleKind.CAB;
  }

  /** Waiting-charge rate per started minute for [vehicleKind] at [at] (the city's rule, else the built-in one). */
  async waitPerMin(at: GeoPoint, vehicleKind: VehicleKind): Promise<number> {
    const here = await this.geo.locate(at);
    const rule = await this.geo.fareRule(here.cityId, vehicleKind);
    return rule?.waitPerMin ?? FARE_RULES[vehicleKind].waitPerMin;
  }
}
