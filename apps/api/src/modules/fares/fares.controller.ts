import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';

import type { AuthUser } from '../../core/auth/auth-user.js';
import { CurrentUser } from '../../core/auth/current-user.decorator.js';
import { Public } from '../../core/auth/public.decorator.js';
import { LIMITS, RateLimit } from '../../core/rate-limit/rate-limit.decorator.js';
import { RideMode, Role, TripKind } from '../../generated/prisma/enums.js';
import { AutomationsService } from '../automations/automations.service.js';
import { QuoteRequestDto } from './dto/quote-request.dto.js';
import { ShiftingQuoteDto } from './dto/shifting.dto.js';
import { GeoService } from '../geo/geo.service.js';
import { FaresService, istDayAt, type QuoteWithEta, type RateCard, type ShiftingQuoteResult } from './fares.service.js';
import type { ModePricing } from './pricing.js';
import { type RentalPackage, RENTAL_PACKAGES } from './ride-modes.js';

/** `?lat&lng` → a point, or null when absent / not numbers. */
function pointOf(q: { lat?: string; lng?: string }): { lat: number; lng: number } | null {
  const lat = Number(q.lat);
  const lng = Number(q.lng);
  return q.lat && q.lng && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

/**
 * Fare quotes (P-10 / PP-06). Quotes can fetch a paid Google route: signed in (any role) and rate limited per user.
 * The rate cards (`rates`, `rental-packages`) stay public.
 */
@Controller('fares')
export class FaresController {
  constructor(
    private readonly fares: FaresService,
    private readonly geo: GeoService,
    private readonly automations: AutomationsService,
  ) {}

  /**
   * The prices the apps show before quoting (P-34 package chips, P-07 "from ₹…", PH-03 packing and extras): rentals,
   * outstation, goods to another town and house shifting for the city at `?lat&lng` (built-in without a point or
   * outside every city). Quotes and bookings are always priced on the server with the same rates.
   */
  @Public()
  @Get('rates')
  async rates(@Query() q: { lat?: string; lng?: string }): Promise<{ packages: readonly RentalPackage[]; pricing: ModePricing }> {
    const at = pointOf(q);
    return { packages: RENTAL_PACKAGES, pricing: at ? await this.geo.pricingAt(at) : await this.geo.pricing(null) };
  }

  /** The driver app's Rate card: every vehicle's in-town rates and extras in the city at `?lat&lng`. */
  @Public()
  @Get('rate-card')
  rateCard(@Query() q: { lat?: string; lng?: string }): Promise<RateCard> {
    return this.fares.rateCard(pointOf(q));
  }

  @RateLimit(LIMITS.faresQuote)
  @Post('quote')
  @HttpCode(200)
  async quote(@Body() body: QuoteRequestDto, @CurrentUser() user: AuthUser): Promise<{ quotes: QuoteWithEta[] }> {
    const mode = body.rideMode ?? RideMode.LOCAL;
    if (mode !== RideMode.LOCAL) {
      // Rental / outstation: the cab tiers, each with the terms it agrees to (`modeTerms`).
      const quotes = await this.fares.modeQuotes({
        pickup: body.pickup,
        drop: body.drop,
        rideMode: mode,
        kind: body.kind,
        rentalPackageId: body.rentalPackageId,
        roundTrip: body.roundTrip,
        leaveAt: body.scheduledAt ? new Date(body.scheduledAt) : new Date(),
        returnAt: body.returnAt ? new Date(body.returnAt) : null,
      });
      const withEta = await this.fares.withPickupEta(quotes, body.pickup, { womenOnly: body.womenOnly ?? false });
      this.searched(user, body, mode);
      return { quotes: withEta };
    }
    if (!body.drop) throw new BadRequestException('Choose where you are going');
    const quotes = await this.fares.quoteAll({ pickup: body.pickup, drop: body.drop, kind: body.kind ?? TripKind.RIDE });
    const withEta = await this.fares.withPickupEta(quotes, body.pickup, { womenOnly: body.womenOnly ?? false });
    this.searched(user, body, mode);
    return { quotes: withEta };
  }

  /** A rider's local or outstation ride quote with a drop: "Siva, Ooty?" later unless they book (automations). */
  private searched(user: AuthUser, body: QuoteRequestDto, mode: RideMode): void {
    if (user.role !== Role.PASSENGER || (body.kind ?? TripKind.RIDE) !== TripKind.RIDE || !body.drop) return;
    if (mode !== RideMode.LOCAL && mode !== RideMode.OUTSTATION) return;
    this.automations.searched({ userId: user.userId, mode, pickup: body.pickup, drop: body.drop });
  }

  /**
   * House shifting (PH-01 … PH-03): the price lines for the home size, floors, packing and extras at a slot (default
   * tomorrow 9 am), every goods truck's total, and the next 7 days' totals.
   */
  @RateLimit(LIMITS.shiftingQuote)
  @Post('shifting-quote')
  @HttpCode(200)
  shiftingQuote(@Body() body: ShiftingQuoteDto): Promise<ShiftingQuoteResult> {
    const now = new Date();
    return this.fares.shiftingQuote({
      pickup: body.pickup,
      drop: body.drop,
      details: body.shifting,
      vehicleKind: body.vehicleKind,
      at: body.at ? new Date(body.at) : istDayAt(now, 1, 9),
      now,
    });
  }

  /** Rental packages (1 h / 10 km … 12 h / 120 km) with each cab tier's price and its rates past the package. */
  @Public()
  @Get('rental-packages')
  async rentalPackages(
    @Query() q: { lat?: string; lng?: string },
  ): Promise<{ packages: { id: string; hours: number; km: number; prices: Record<string, number> }[]; rates: Record<string, { extraKm: number; extraMin: number }> }> {
    const at = pointOf(q);
    const rental = (at ? await this.geo.pricingAt(at) : await this.geo.pricing(null)).rental;
    const tiers = Object.keys(rental) as (keyof typeof rental)[];
    return {
      packages: RENTAL_PACKAGES.map((p, i) => ({ ...p, prices: Object.fromEntries(tiers.map((t) => [t, rental[t].prices[i]])) })),
      rates: Object.fromEntries(tiers.map((t) => [t, { extraKm: rental[t].extraKm, extraMin: rental[t].extraMin }])),
    };
  }
}
