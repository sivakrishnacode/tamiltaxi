import { Controller, Get, Param, ParseFloatPipe, Query } from '@nestjs/common';

import type { AuthUser } from '../../core/auth/auth-user.js';
import { CurrentUser } from '../../core/auth/current-user.decorator.js';
import { Public } from '../../core/auth/public.decorator.js';
import { LIMITS, RateLimit } from '../../core/rate-limit/rate-limit.decorator.js';
import type { Place } from '../../generated/prisma/client.js';
import type { PlaceSuggestion, ResolvedPlace } from '../maps/google-maps.client.js';
import { type OutstationDestination, PlacesService } from './places.service.js';

/** A valid `lat` / `lng` query pair, else undefined (a bad one is ignored rather than failing the search). */
export function originOf(lat?: string, lng?: string): { lat: number; lng: number } | undefined {
  const a = Number(lat);
  const b = Number(lng);
  if (lat === undefined || lng === undefined || lat === '' || lng === '') return undefined;
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lng: b } : undefined;
}

/**
 * P-08 search (autocomplete + details), P-09 reverse geocode. Autocomplete, details and reverse can be paid Google
 * calls: signed in (any role) and rate limited per user. The seeded search and outstation suggestions stay public.
 */
@Controller('places')
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  /** Seeded places only (no Google cost). */
  @Public()
  @Get()
  search(@Query('q') q = ''): Promise<Place[]> {
    return this.places.search(q);
  }

  /**
   * Send the same `session` token for every keystroke of one search, then call details once. Optional `lat` /
   * `lng` (the pickup) add each suggestion's `distanceKm`; older apps send neither. `scope=outstation` searches
   * beyond the service area (other towns), leaning towards the pickup. Fewer than 4 characters (trimmed): `results`
   * is empty and nothing is looked up.
   */
  @RateLimit(LIMITS.placesAutocomplete)
  @Get('autocomplete')
  autocomplete(
    @CurrentUser() user: AuthUser,
    @Query('q') q = '',
    @Query('session') session = '',
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('scope') scope?: string,
  ): Promise<{ source: 'google' | 'local'; results: PlaceSuggestion[] }> {
    return this.places.autocomplete({ input: q, sessionToken: session || 'anonymous', origin: originOf(lat, lng), anywhere: scope === 'outstation', userId: user.userId });
  }

  /**
   * Outstation suggestions near a pickup: where riders from this area went most on outstation trips (last 180
   * days), with distances. Empty until there are such trips (no towns are built in).
   */
  @Public()
  @Get('outstation-destinations')
  outstationDestinations(@Query('lat') lat?: string, @Query('lng') lng?: string): Promise<{ destinations: OutstationDestination[] }> {
    const at = originOf(lat, lng);
    return at ? this.places.outstationDestinations(at).then((destinations) => ({ destinations })) : Promise.resolve({ destinations: [] });
  }

  @RateLimit(LIMITS.placeDetails)
  @Get('details/:placeId')
  details(@Param('placeId') placeId: string, @Query('session') session?: string): Promise<(ResolvedPlace & { isInServiceArea: boolean }) | null> {
    return this.places.details({ placeId, sessionToken: session });
  }

  @RateLimit(LIMITS.placesReverse)
  @Get('reverse')
  reverse(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lng', ParseFloatPipe) lng: number,
  ): Promise<{ place: ResolvedPlace | null; isInServiceArea: boolean }> {
    return this.places.reverse({ lat, lng });
  }
}
