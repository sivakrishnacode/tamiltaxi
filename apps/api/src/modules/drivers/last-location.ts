import { type LatLngBounds, nearBounds } from '../geo/h3.util.js';

/**
 * Where the server last saw each person, for the admin user and driver pages. Drivers: the newest live GPS fix
 * (written with `driver:alive`, which expires 90 s after the app stops). Riders: the point the rider app asks
 * `GET /drivers/nearby` about every 15 s while a map is open, which is their GPS on Home unless they moved the
 * pickup pin; the app rounds it to ~110 m. One value each (`lat,lng,at`), overwritten, kept 30 days from the last
 * write and deleted with the account.
 */
export const LAST_LOCATION_TTL_S = 30 * 86_400;

export const driverLastFixKey = (driverId: string): string => `driver:lastfix:${driverId}`;
export const riderLastPinKey = (userId: string): string => `rider:lastpin:${userId}`;

export interface LastLocation {
  readonly lat: number;
  readonly lng: number;
  /** When it was recorded (ISO time). */
  readonly at: string;
}

/** [at]: epoch ms. */
export function encodeLastLocation(lat: number, lng: number, at: number): string {
  return `${lat},${lng},${at}`;
}

/** Null for a missing or malformed value. */
export function parseLastLocation(raw: string | null | undefined): LastLocation | null {
  if (!raw) return null;
  const [lat, lng, at] = raw.split(',').map(Number.parseFloat);
  if (![lat, lng, at].every(Number.isFinite)) return null;
  return { lat, lng, at: new Date(at).toISOString() };
}

/**
 * [driverIds] less those last seen (`driver:lastfix`) more than [km] outside [bounds]: a push about one part of a big
 * city (a busy zone, a surge there) shouldn't reach drivers across town. Drivers with no fix in the last 30 days are
 * kept, since where they are is unknown.
 */
export async function driversNotFar(redis: { mget(...keys: string[]): Promise<(string | null)[]> }, driverIds: readonly string[], bounds: LatLngBounds, km: number): Promise<string[]> {
  if (driverIds.length === 0) return [];
  const fixes = await redis.mget(...driverIds.map(driverLastFixKey));
  return driverIds.filter((_, i) => {
    const at = parseLastLocation(fixes[i]);
    return !at || nearBounds(bounds, at, km);
  });
}
