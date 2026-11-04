import { Injectable } from '@nestjs/common';
import { cellToParent, gridDiskDistances } from 'h3-js';

import { RedisService } from '../../core/redis/redis.service.js';
import type { VehicleKind } from '../../generated/prisma/enums.js';
import { haversineMeters } from '../fares/fare-engine.js';
import { DEMAND_RES, SEEN_TTL_S, seenDriversKey } from '../geo/demand.service.js';
import { cellAt } from '../geo/h3.util.js';
import { IDLE_KEY_TTL_S, lastTripEndKey, onlineSinceKey } from '../trips/driver-rank.js';
import { ONLINE_SESSION_TTL_S, onlineSessionKey } from './driver-earnings.service.js';

/** Resolution used to index drivers (≈0.74 km² hexes, ~0.9 km between neighbouring centres). */
export const DRIVER_H3_RES = 8;
const RING_SPACING_KM = 0.92;
const ALIVE_TTL_S = 90;
/**
 * `driver:cell:<id>` and the `h3:drv:*` cell sets live a day from the last fix that wrote them: a driver whose app
 * stopped without going offline doesn't stay in Redis for ever. Members whose heartbeat is gone are pruned by
 * [DriverLocationService.nearby] as it meets them.
 */
const INDEX_TTL_S = 86_400;

/**
 * Removes ARGV (driver ids) from every set in KEYS, each only if `driver:alive:<id>` is still gone (a fix may have
 * brought them back meanwhile), and their `driver:cell` entry. Returns how many set entries were removed.
 */
const PRUNE = `local n = 0
for _, id in ipairs(ARGV) do
  if redis.call('exists', 'driver:alive:' .. id) == 0 then
    for _, k in ipairs(KEYS) do n = n + redis.call('srem', k, id) end
    redis.call('del', 'driver:cell:' .. id)
  end
end
return n`;

/** `driver:busy` can never stick for good: it expires unless GPS updates keep refreshing it during the trip. */
export const BUSY_TTL_S = 6 * 3600;

/** Sets KEYS[1] = ARGV[1] (TTL ARGV[2]) if it is free or already ARGV[1]; 0 when it holds something else. */
const CLAIM = `local cur = redis.call('get', KEYS[1])
if not cur or cur == ARGV[1] then redis.call('set', KEYS[1], ARGV[1], 'EX', ARGV[2]) return 1 end
return 0`;

/** Deletes KEYS[1] only while it still holds ARGV[1] (compare-and-delete). */
export const DEL_IF_EQUALS = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

/** A nearby available driver, found by hexagon rings. */
export interface NearbyDriver {
  readonly driverId: string;
  /** Straight-line distance (for display/tie-breaks; ranking uses road ETA). */
  readonly distanceKm: number;
  readonly lat: number;
  readonly lng: number;
  /** 0 = same hexagon as the pickup, 1 = the six touching it, … */
  readonly ring: number;
}

/**
 * Live driver positions indexed by H3 cell (Uber-style): each driver sits in one Redis set
 * `h3:drv:<kind>:<cell>`; search walks the pickup hexagon, then ring 1, ring 2… instead of
 * measuring distance to every driver. Heartbeat key drops stale drivers; busy flag while on a job.
 */
@Injectable()
export class DriverLocationService {
  constructor(private readonly redis: RedisService) {}

  private static cellKey(kind: VehicleKind, cell: string): string {
    return `h3:drv:${kind}:${cell}`;
  }

  /**
   * Moves the driver in the index. [at]: when the fix was taken (epoch ms, default now); [heading]: degrees from
   * north when the phone knows it. Both are stored in `driver:alive` (`lat,lng,at[,heading]`). Also marks the driver
   * as last heard from in their res-7 demand cell (`driver:area` remembers which, also past going offline, so a move
   * takes them out of the old one): surge counts them as supply there for the demand window.
   */
  async update(params: { driverId: string; kind: VehicleKind; lat: number; lng: number; at?: number; heading?: number | null }): Promise<void> {
    const cell = cellAt(params.lat, params.lng, DRIVER_H3_RES);
    const area = cellToParent(cell, DEMAND_RES);
    const [prev, prevArea] = await this.redis.mget(`driver:cell:${params.driverId}`, `driver:area:${params.driverId}`);
    const next = `${params.kind}|${cell}`;
    const tx = this.redis.multi();
    if (prev && prev !== next) {
      const [pk, pc] = prev.split('|');
      tx.srem(DriverLocationService.cellKey(pk as VehicleKind, pc), params.driverId);
    }
    if (prevArea && prevArea !== area) tx.zrem(seenDriversKey(prevArea), params.driverId);
    tx.zadd(seenDriversKey(area), Date.now(), params.driverId)
      .expire(seenDriversKey(area), SEEN_TTL_S)
      .set(`driver:area:${params.driverId}`, area, 'EX', SEEN_TTL_S);
    tx.sadd(DriverLocationService.cellKey(params.kind, cell), params.driverId)
      .expire(DriverLocationService.cellKey(params.kind, cell), INDEX_TTL_S)
      .set(`driver:cell:${params.driverId}`, next, 'EX', INDEX_TTL_S)
      .set(
        `driver:alive:${params.driverId}`,
        `${params.lat},${params.lng},${params.at ?? Date.now()}${params.heading == null ? '' : `,${Math.round(params.heading)}`}`,
        'EX',
        ALIVE_TTL_S,
      )
      // Keeps the busy flag alive while the driver is on a trip (no-op when free).
      .expire(`driver:busy:${params.driverId}`, BUSY_TTL_S)
      // And the open online session (earnings' online hours) while the app sends fixes.
      .expire(onlineSessionKey(params.driverId), ONLINE_SESSION_TTL_S);
    await tx.exec();
  }

  async remove(params: { driverId: string; kind: VehicleKind }): Promise<void> {
    const prev = await this.redis.get(`driver:cell:${params.driverId}`);
    const tx = this.redis.multi();
    if (prev) {
      const [pk, pc] = prev.split('|');
      tx.srem(DriverLocationService.cellKey(pk as VehicleKind, pc), params.driverId);
    }
    await tx.del(`driver:alive:${params.driverId}`, `driver:cell:${params.driverId}`).exec();
  }

  /** Last known position, if the driver is online. */
  async position(driverId: string): Promise<{ lat: number; lng: number } | null> {
    const fix = await this.lastFix(driverId);
    return fix && { lat: fix.lat, lng: fix.lng };
  }

  /**
   * Last position from the app's GPS stream / heartbeat, when it arrived (epoch ms; null for older entries) and the
   * heading (null when unknown).
   */
  async lastFix(driverId: string): Promise<{ lat: number; lng: number; at: number | null; heading: number | null } | null> {
    const raw = await this.redis.get(`driver:alive:${driverId}`);
    if (!raw) return null;
    const [lat, lng, at, heading] = raw.split(',').map(Number);
    return { lat, lng, at: Number.isFinite(at) ? at : null, heading: Number.isFinite(heading) ? heading : null };
  }

  /**
   * Marks the driver busy with [tripId], atomically: false when they are already busy with another trip (one
   * active trip per driver). Claiming the same trip again is fine.
   */
  async claimBusy(driverId: string, tripId: string): Promise<boolean> {
    return (await this.redis.eval(CLAIM, 1, `driver:busy:${driverId}`, tripId, BUSY_TTL_S)) === 1;
  }

  /**
   * Frees the driver only if they are still busy with [tripId] (not with a trip they have moved on to). [tripEnded]:
   * their wait for the next trip starts now (the idle bonus in dispatch ranking, trips/driver-rank.ts).
   */
  async releaseBusy(driverId: string, tripId: string, tripEnded = true): Promise<void> {
    const freed = await this.redis.eval(DEL_IF_EQUALS, 1, `driver:busy:${driverId}`, tripId);
    if (freed === 1 && tripEnded) await this.redis.set(lastTripEndKey(driverId), String(Date.now()), 'EX', IDLE_KEY_TTL_S);
  }

  /** The driver went online (from offline): their wait for a trip starts now, for the idle bonus in ranking. */
  async markOnline(driverId: string): Promise<void> {
    await this.redis.set(onlineSinceKey(driverId), String(Date.now()), 'EX', IDLE_KEY_TTL_S);
  }

  activeTrip(driverId: string): Promise<string | null> {
    return this.redis.get(`driver:busy:${driverId}`);
  }

  /**
   * Available drivers from the pickup hexagon outward, ring by ring, up to [radiusKm].
   * Stops after the ring where at least [limit] drivers were found. Members without a heartbeat (the app stopped
   * without going offline) are pruned from the ring's cell sets on the way.
   */
  async nearby(params: { kind: VehicleKind; lat: number; lng: number; radiusKm: number; limit: number }): Promise<NearbyDriver[]> {
    const origin = cellAt(params.lat, params.lng, DRIVER_H3_RES);
    const maxRing = Math.max(1, Math.ceil(params.radiusKm / RING_SPACING_KM));
    const rings = gridDiskDistances(origin, maxRing);
    const found: NearbyDriver[] = [];
    for (let ring = 0; ring < rings.length; ring++) {
      const keys = rings[ring].map((c) => DriverLocationService.cellKey(params.kind, c));
      const ids = keys.length ? await this.redis.sunion(...keys) : [];
      const stale: string[] = [];
      for (const driverId of ids) {
        const [pos, isBusy] = await Promise.all([this.position(driverId), this.redis.exists(`driver:busy:${driverId}`)]);
        if (!pos) stale.push(driverId);
        if (!pos || isBusy) continue;
        const distanceKm = haversineMeters(pos, params) / 1000;
        if (distanceKm <= params.radiusKm) found.push({ driverId, ...pos, distanceKm, ring });
      }
      if (stale.length) await this.redis.eval(PRUNE, keys.length, ...keys, ...stale);
      if (found.length >= params.limit) break;
    }
    return found.sort((a, b) => a.ring - b.ring || a.distanceKm - b.distanceKm);
  }
}
