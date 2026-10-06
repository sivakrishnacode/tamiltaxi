import { createHmac } from 'node:crypto';

import { VehicleKind } from '../../generated/prisma/enums.js';
import { haversineMeters } from '../fares/fare-engine.js';
import type { DriverLocationService } from './driver-location.service.js';

/**
 * A free driver's vehicle as riders see it on the map: the position rounded, the heading in 15° steps, and a marker
 * [id] that is not the driver's: it changes every hour, so the app can glide a car between refreshes but nobody can
 * follow one driver for longer.
 */
export interface NearbyVehicle {
  readonly id: string;
  readonly kind: VehicleKind;
  readonly lat: number;
  readonly lng: number;
  readonly heading: number | null;
}

/** Vehicles shown around a ride pickup (every vehicle a ride driver can have) and a parcel pickup. */
export const RIDE_MAP_KINDS: readonly VehicleKind[] = [
  VehicleKind.BIKE,
  VehicleKind.SCOOTY,
  VehicleKind.AUTO,
  VehicleKind.CAB,
  VehicleKind.SEDAN,
  VehicleKind.SUV,
];
export const PARCEL_MAP_KINDS: readonly VehicleKind[] = [
  VehicleKind.GOODS_BIKE,
  VehicleKind.BIKE,
  VehicleKind.SCOOTY,
  VehicleKind.THREE_WHEELER,
  VehicleKind.MINI_TRUCK,
  VehicleKind.PICKUP,
  VehicleKind.TRUCK,
];

export const NEARBY_RADIUS_KM = 3;
export const NEARBY_MAX = 15;
const PER_KIND = 4;
/** ~55 m: close enough to look right on the map, too coarse to follow one driver to their door. */
const GRID_DEG = 0.0005;

const snap = (v: number): number => Math.round(Math.round(v / GRID_DEG) * GRID_DEG * 1e6) / 1e6;

/** How long a car keeps its marker id. */
export const MARKER_ID_TTL_MS = 3_600_000;

/** The car's marker id this hour: keyed with a server secret, so it can't be turned back into the driver's id. */
export function markerId(driverId: string, key: string, now: number): string {
  return createHmac('sha256', key).update(`nearby:${Math.floor(now / MARKER_ID_TTL_MS)}:${driverId}`).digest('base64url').slice(0, 12);
}

/**
 * Up to [NEARBY_MAX] free drivers within [NEARBY_RADIUS_KM] of [at], nearest first, a few of each vehicle so the map
 * shows the mix (RedTaxi / Rapido style). Busy and stale drivers are left out by [DriverLocationService.nearby].
 */
export async function nearbyVehicles(
  location: Pick<DriverLocationService, 'nearby' | 'lastFix'>,
  at: { lat: number; lng: number },
  kinds: readonly VehicleKind[] = RIDE_MAP_KINDS,
  ids: { key: string; now?: number } = { key: '' },
): Promise<NearbyVehicle[]> {
  const now = ids.now ?? Date.now();
  const perKind = await Promise.all(
    kinds.map(async (kind) => (await location.nearby({ kind, ...at, radiusKm: NEARBY_RADIUS_KM, limit: PER_KIND })).slice(0, PER_KIND).map((d) => ({ ...d, kind }))),
  );
  const seen = new Set<string>();
  const nearest = perKind
    .flat()
    .filter((d) => !seen.has(d.driverId) && seen.add(d.driverId))
    .sort((a, b) => haversineMeters(a, at) - haversineMeters(b, at))
    .slice(0, NEARBY_MAX);
  return Promise.all(
    nearest.map(async (d) => {
      const heading = (await location.lastFix(d.driverId))?.heading ?? null;
      return {
        id: markerId(d.driverId, ids.key, now),
        kind: d.kind,
        lat: snap(d.lat),
        lng: snap(d.lng),
        heading: heading == null ? null : (Math.round(heading / 15) * 15) % 360,
      };
    }),
  );
}
