import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { JobsService } from '../../core/jobs/jobs.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { RedisService } from '../../core/redis/redis.service.js';
import { Prisma, type Trip } from '../../generated/prisma/client.js';
import { CancelCode, CancelledBy, RideMode, TripStatus, type VehicleKind, WomenDriverPref } from '../../generated/prisma/enums.js';
import { DriverLocationService } from '../drivers/driver-location.service.js';
import { fitsPrefs, readPrefs, serviceOn, shiftHelpersOf, takesShift } from '../drivers/booking-prefs.js';
import { driverKindsFor, isPriority, tripVehicleFor } from '../drivers/vehicle-match.js';
import { TripDriversService } from '../drivers/trip-drivers.service.js';
import { applyWomenPref, womenAmong } from '../drivers/women-drivers.js';
import { roadKm } from '../geo/eta-model.js';
import { NotifierService } from '../notifications/notifier.service.js';
import { EtaService, etasByMode } from '../maps/eta.service.js';
import { TripEventsService } from '../realtime/trip-events.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { assignBatch, BatchRequest } from './batch-assign.js';
import { searchRadiusAt, searchWindowMs } from './search-radius.js';
import { DriverBlocksService } from './driver-blocks.service.js';
import { DriverOfferStatsService } from './driver-offer-stats.service.js';
import { EMPTY_STATS, rankScore } from './driver-rank.js';
import { extraOf, withExtra } from './extra-fare.js';

const PENDING_KEY = 'dispatch:pending';
const LOCK_KEY = 'dispatch:lock';
const SWEEP_LOCK_KEY = 'dispatch:sweep:lock';
/** The offer key outlives the offer timer so the timeout handler still sees whose offer it was. */
const OFFER_GRACE_S = 5;
/** Durable jobs (see JobsService): an offer's timeout, and the next search when the queue ran out. */
export const OFFER_EXPIRE_JOB = 'offer.expire';
export const RESEARCH_JOB = 'dispatch.research';
/**
 * Claims an open-offer slot for a driver: KEYS[1] = the driver's offers (sorted set, score = expiry ms), ARGV = trip,
 * now ms, expiry ms, max open offers. Drops expired entries; 1 when claimed, 0 when full or already offered.
 */
const CLAIM_OFFER = `
redis.call('zremrangebyscore', KEYS[1], '-inf', ARGV[2])
if redis.call('zscore', KEYS[1], ARGV[1]) then return 0 end
if redis.call('zcard', KEYS[1]) >= tonumber(ARGV[4]) then return 0 end
redis.call('zadd', KEYS[1], ARGV[3], ARGV[1])
redis.call('pexpireat', KEYS[1], ARGV[3])
return 1`;
const driverOffersKey = (driverId: string): string => `dispatch:driver:${driverId}:offers`;
/** Drivers who said no to the trip: not offered it again, unless the rider adds extra ([DispatchService.boosted]). */
const declinedKey = (tripId: string): string => `dispatch:${tripId}:declined`;
/** Drivers taken off the trip (they dropped it, or were not moving): never offered it again, extra or not. */
export const excludedKey = (tripId: string): string => `dispatch:${tripId}:excluded`;

/** Out of candidates: search again after this long (drivers who timed out may be offered again). */
const RESEARCH_AFTER_MS = 4_000;
const SWEEP_EVERY_MS = 15_000;

/**
 * Uber-style dispatch:
 * 1. Bookings wait in a short batch window (`batchWindowMs`, default 2 s).
 * 2. For each booking, drivers are found by H3 rings around the pickup (pickup hexagon, then neighbours…), for the
 *    booked vehicle and any the passenger added ("Book any", [widen]); bike drivers take goods-bike parcels too
 *    (parcel-bikes.ts). The radius grows from `searchRadiusKm` to
 *    `maxSearchRadiusKm` over `searchExpandSeconds` (see search-radius.ts).
 * 3. Candidates are ranked by road ETA (cached per hex pair), not straight-line distance, adjusted for how reliably
 *    each driver took offers over 7 days and how long they have waited (driver-rank.ts; ETA stays dominant).
 *    Butterfly trips keep only women drivers (ONLY) or give them a head start (PREFERRED), see women-drivers.ts.
 * 4. The whole batch is assigned together so two riders never get the same driver.
 * 5. Each driver gets `offerSeconds` to accept; decline/timeout moves to the next in that trip's queue. A driver can
 *    hold up to `maxOpenOffers` requests at once (stacked in the app); accepting one releases the others at once.
 * 6. Out of candidates → search again every few seconds (a driver who let the offer time out can get it again; one who
 *    declined can't) until [searchWindowMs] has passed since the search started (or a vehicle was added), then
 *    NO_DRIVERS.
 * Offer timeouts and re-searches are durable jobs in Redis ([JobsService]), so an API restart doesn't lose them. A
 * sweep still re-queues or closes searching trips that fell through the cracks.
 * A Redis lock makes only one API instance run a batch at a time.
 */
@Injectable()
export class DispatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DispatchService.name);
  private ticker: NodeJS.Timeout | null = null;
  private sweeper: NodeJS.Timeout | null = null;
  private isTicking = false;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly location: DriverLocationService,
    private readonly events: TripEventsService,
    private readonly settings: SettingsService,
    private readonly blocks: DriverBlocksService,
    private readonly eta: EtaService,
    private readonly notifier: NotifierService,
    private readonly jobs: JobsService,
    private readonly offerStats: DriverOfferStatsService,
    private readonly tripDrivers: TripDriversService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.jobs.register<{ driverId: string }>(OFFER_EXPIRE_JOB, (job) => this.onTimeout(job.id, job.payload.driverId));
    // A paused driver's open requests go to the next drivers at once (DriverBlocksService can't call us directly).
    this.blocks.onPaused((driverId) => this.releaseOffers(driverId, null));
    this.jobs.register(RESEARCH_JOB, async (job) => void (await this.redis.sadd(PENDING_KEY, job.id)));
    const windowMs = await this.settings.get('batchWindowMs');
    this.ticker = setInterval(() => void this.tick(), Math.max(250, windowMs));
    this.sweeper = setInterval(() => void this.sweep().catch((e: Error) => this.logger.warn(`Sweep failed: ${e.message}`)), SWEEP_EVERY_MS);
  }

  onModuleDestroy(): void {
    if (this.ticker) clearInterval(this.ticker);
    if (this.sweeper) clearInterval(this.sweeper);
  }

  /** Queues a booking for the next batch. */
  async start(trip: Trip): Promise<void> {
    await this.redis.sadd(PENDING_KEY, trip.id);
  }

  /** Current offered driver for a trip, if any. */
  offeredTo(tripId: string): Promise<string | null> {
    return this.redis.get(`dispatch:${tripId}:offer`);
  }

  /** The oldest request open for [driverId] (older apps recover one missed offer with this). */
  async currentOffer(driverId: string): Promise<(OfferDetails & { expiresInSeconds: number }) | null> {
    return (await this.currentOffers(driverId))[0] ?? null;
  }

  /** Every request open for [driverId], oldest first (the app recovers offers it missed on the socket). */
  async currentOffers(driverId: string): Promise<(OfferDetails & { expiresInSeconds: number })[]> {
    const tripIds = await this.redis.zrangebyscore(driverOffersKey(driverId), String(Date.now()), '+inf');
    const out: (OfferDetails & { expiresInSeconds: number })[] = [];
    for (const tripId of tripIds) {
      if ((await this.offeredTo(tripId)) !== driverId) continue;
      const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
      if (!trip || trip.status !== TripStatus.SEARCHING) continue;
      const ttl = (await this.redis.ttl(`dispatch:${tripId}:offer`)) - OFFER_GRACE_S;
      if (ttl < 1) continue;
      out.push({ ...(await this.offerDetails(trip, driverId)), expiresInSeconds: ttl });
    }
    return out;
  }

  private async clearOffer(tripId: string): Promise<void> {
    const driverId = await this.offeredTo(tripId);
    await this.redis.del(`dispatch:${tripId}:offer`);
    await this.jobs.cancel(OFFER_EXPIRE_JOB, tripId);
    if (!driverId) return;
    // Its slot is free again; the app drops the card (a no-op when the driver answered it themselves).
    await this.redis.zrem(driverOffersKey(driverId), tripId);
    this.events.toDriver(driverId, 'trip.offer_closed', { tripId });
  }

  /**
   * [driverId]'s open requests (but [keptTripId], the one they took) go to the next drivers right away (no decline or
   * timeout counted against them): they took a trip, or were paused ([keptTripId] null).
   */
  private async releaseOffers(driverId: string, keptTripId: string | null): Promise<void> {
    const others = (await this.redis.zrange(driverOffersKey(driverId), '0', '-1')).filter((t) => t !== keptTripId);
    for (const tripId of others) {
      if ((await this.offeredTo(tripId)) === driverId) await this.next(tripId);
      else await this.redis.zrem(driverOffersKey(driverId), tripId);
    }
  }

  /** The driver said no: never offer them this trip again, try the next candidate. */
  async decline(tripId: string, driverId: string): Promise<void> {
    await this.offerStats.record(driverId, 'declined');
    await this.redis.multi().sadd(declinedKey(tripId), driverId).expire(declinedKey(tripId), 900).exec();
    await this.next(tripId);
  }

  /** Driver declined or the offer timed out: try the next candidate. */
  async next(tripId: string): Promise<void> {
    await this.clearOffer(tripId);
    await this.offerNext(tripId);
  }

  /** [driverId] took the trip (the guarded write won): count it for their ranking and stop dispatching. */
  async accepted(tripId: string, driverId: string): Promise<void> {
    await this.offerStats.record(driverId, 'accepted');
    await this.stop(tripId);
    await this.releaseOffers(driverId, tripId);
  }

  /** A cancellation after accepting was judged [driverId]'s fault: counts against them in ranking. */
  driverCancelled(driverId: string): Promise<void> {
    return this.offerStats.record(driverId, 'cancelled');
  }

  /** Stops dispatching (trip accepted or cancelled). */
  async stop(tripId: string): Promise<void> {
    await this.jobs.cancel(RESEARCH_JOB, tripId);
    await this.redis.srem(PENDING_KEY, tripId);
    await this.clearOffer(tripId);
    await this.redis.del(
      `dispatch:${tripId}:queue`,
      declinedKey(tripId),
      excludedKey(tripId),
      `dispatch:${tripId}:offered`,
      `dispatch:${tripId}:since`,
    );
  }

  /**
   * The trip's driver dropped it before pickup and it is SEARCHING again: search now, never offering it to
   * [excludedDriverId] again (not even after the rider adds extra), with the full search time from here.
   */
  async restart(tripId: string, excludedDriverId: string): Promise<void> {
    await this.redis
      .multi()
      .sadd(excludedKey(tripId), excludedDriverId)
      .expire(excludedKey(tripId), 900)
      .set(`dispatch:${tripId}:since`, String(Date.now()), 'EX', 900)
      .sadd(PENDING_KEY, tripId)
      .exec();
  }

  /**
   * The passenger added a vehicle to a searching trip: search again now (without cutting short an open offer) and
   * give the search its full time again from here.
   */
  async widen(tripId: string): Promise<void> {
    await this.redis.set(`dispatch:${tripId}:since`, String(Date.now()), 'EX', 900);
    if (await this.offeredTo(tripId)) {
      // The next search runs when this offer is answered or times out; queue one so the new vehicle joins then.
      await this.redis.sadd(PENDING_KEY, tripId);
      return;
    }
    await this.jobs.cancel(RESEARCH_JOB, tripId);
    await this.redis.sadd(PENDING_KEY, tripId);
  }

  /**
   * The passenger added extra to a searching trip ([TripsService.addExtra]): drivers who said no may take it now, so
   * they can be offered it again (not the ones taken off it, [restart]); whoever holds the offer gets it again at the
   * new fare (same time left), and the search runs again with its full time from here ([widen]).
   */
  async boosted(tripId: string): Promise<void> {
    await this.redis.del(declinedKey(tripId));
    const driverId = await this.offeredTo(tripId);
    const trip = driverId ? await this.prisma.trip.findUnique({ where: { id: tripId } }) : null;
    const left = (await this.redis.ttl(`dispatch:${tripId}:offer`)) - OFFER_GRACE_S;
    if (driverId && trip && left > 0) {
      this.events.toDriver(driverId, 'trip.offer', { ...(await this.offerDetails(trip, driverId)), expiresInSeconds: left });
    }
    await this.widen(tripId);
  }

  /** Runs one batch: takes all pending bookings, ranks candidates by ETA, assigns across the batch. */
  async tick(): Promise<number> {
    if (this.isTicking) return 0;
    this.isTicking = true;
    try {
      const windowMs = await this.settings.get('batchWindowMs');
      const gotLock = await this.redis.set(LOCK_KEY, '1', 'PX', Math.max(500, windowMs - 100), 'NX');
      if (!gotLock) return 0;
      const ids = await this.redis.spop(PENDING_KEY, 500);
      if (ids.length === 0) return 0;
      const trips = await this.prisma.trip.findMany({ where: { id: { in: ids }, status: TripStatus.SEARCHING } });
      const requests = await Promise.all(trips.map((t) => this.request(t)));
      const queues = assignBatch(requests);
      for (const trip of trips) {
        const queue = queues.get(trip.id) ?? [];
        const key = `dispatch:${trip.id}:queue`;
        await this.redis.del(key);
        if (queue.length > 0) await this.redis.rpush(key, ...queue);
        await this.redis.expire(key, 600);
        // A driver is looking at this trip right now (re-queued by [widen]): the fresh queue waits for their answer.
        const open = await this.offeredTo(trip.id);
        if (open) {
          await this.redis.lrem(key, 0, open);
          continue;
        }
        await this.offerNext(trip.id, { searchFoundNobody: queue.length === 0 });
      }
      return trips.length;
    } catch (e) {
      this.logger.error(`Batch failed: ${(e as Error).message}`);
      return 0;
    } finally {
      this.isTicking = false;
    }
  }

  private async request(trip: Trip): Promise<BatchRequest> {
    const s = await this.settings.all();
    const pickup = { lat: trip.pickupLat, lng: trip.pickupLng };
    // From when the search started (booking, or a scheduled trip's start), not from when it was booked.
    const radiusKm = searchRadiusAt(Date.now() - trip.searchFrom.getTime(), s);
    const kinds: VehicleKind[] = [trip.vehicleKind, ...trip.alsoKinds.filter((k) => k !== trip.vehicleKind)];
    const [perKind, declined, own] = await Promise.all([
      Promise.all(kinds.map((kind) => this.tripDrivers.nearby({ kind, ...pickup, radiusKm, limit: s.maxCandidates * 2 }))),
      this.redis.sunion(declinedKey(trip.id), excludedKey(trip.id)),
      // A driver booking in the passenger app is never offered their own trip.
      this.prisma.driver.findUnique({ where: { userId: trip.passengerId }, select: { id: true } }),
    ]);
    // Paused drivers (too many cancellations) are offline anyway; this covers an index entry left behind.
    const paused = await this.blocks.pausedAmong(perKind.flat().map((d) => d.driverId));
    const inRange = perKind.flat().filter((d) => !declined.includes(d.driverId) && !paused.has(d.driverId) && d.driverId !== own?.id);
    // Drivers' booking preferences (pickup distance, trip length, go-to destination): only trips that fit.
    const nearby = await this.fittingPrefs(inRange, trip);
    // One ETA lookup for every candidate (per-cell cache, then a single Route Matrix call for the misses).
    const etas = await etasByMode(
      nearby.map((d) => ({ at: d, vehicleKind: d.kind })),
      (froms, vehicleKind) => this.eta.minutesMany({ froms, to: pickup, vehicleKind, useRoad: s.useRoadEta }),
    );
    const withEta = nearby.map((d, i) => ({ driverId: d.driverId, etaMin: etas[i] }));
    // Ranking minutes: the ETA adjusted for the driver's 7-day offer record and wait (driver-rank.ts). The Butterfly
    // head start and the batch assignment both work on these.
    const now = Date.now();
    const records = await this.offerStats.forDrivers(withEta.map((d) => d.driverId), now);
    const ranked = withEta.map((d) => {
      const r = records.get(d.driverId) ?? { stats: EMPTY_STATS, idleSince: null };
      return { driverId: d.driverId, etaMin: rankScore({ etaMin: d.etaMin, ...r, now }, s).score };
    });
    const women = trip.womenDriver === WomenDriverPref.NONE ? new Set<string>() : await womenAmong(this.prisma, ranked.map((d) => d.driverId));
    const candidates = applyWomenPref(ranked, trip.womenDriver, women)
      .sort((a, b) => a.etaMin - b.etaMin)
      .slice(0, s.maxCandidates);
    return { tripId: trip.id, createdAt: trip.searchFrom, candidates, priority: isPriority(trip.vehicleKind) };
  }

  /**
   * [drivers] whose booking preferences accept [trip] (one query for all of them). A house shift goes only to movers
   * who switched shifting on and bring at least the helpers it needs (no saved preferences: not a mover); a rental or
   * an outstation trip only to drivers with that service on and not paused (Services).
   */
  private async fittingPrefs<T extends { driverId: string; lat: number; lng: number; distanceKm: number }>(drivers: T[], trip: Trip): Promise<T[]> {
    if (!drivers.length) return drivers;
    const helpers = shiftHelpersOf(trip);
    const service = trip.rideMode === RideMode.RENTAL ? 'rentals' : trip.rideMode === RideMode.OUTSTATION ? 'outstation' : null;
    const rows = await this.prisma.driver.findMany({
      where: { id: { in: [...new Set(drivers.map((d) => d.driverId))] }, bookingPrefs: { not: Prisma.DbNull } },
      select: { id: true, bookingPrefs: true },
    });
    if (!rows.length) return helpers === null ? drivers : [];
    const now = new Date();
    const prefs = new Map(rows.map((r) => [r.id, readPrefs(r.bookingPrefs, now)]));
    return drivers.filter((d) => {
      const p = prefs.get(d.driverId);
      if (helpers !== null && !takesShift(p, helpers)) return false;
      if (service && !serviceOn(p, service)) return false;
      return !p || fitsPrefs(p, d, trip);
    });
  }

  private async offerNext(tripId: string, opts: { searchFoundNobody?: boolean } = {}): Promise<void> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip || trip.status !== TripStatus.SEARCHING) return;
    const driverId = await this.redis.lpop(`dispatch:${tripId}:queue`);
    if (!driverId) return this.searchAgainOrGiveUp(trip, opts.searchFoundNobody ?? false);
    const [offerSeconds, maxOpenOffers] = await Promise.all([this.settings.get('offerSeconds'), this.settings.get('maxOpenOffers')]);
    // Up to [maxOpenOffers] open requests per driver (stacked in the app): a driver on a trip, or with a full stack,
    // is skipped (they come back in a later search if still near).
    const now = Date.now();
    const isFree =
      !(await this.redis.exists(`driver:busy:${driverId}`)) &&
      (await this.redis.eval(CLAIM_OFFER, 1, driverOffersKey(driverId), tripId, now, now + (offerSeconds + OFFER_GRACE_S) * 1000, Math.max(1, maxOpenOffers))) === 1;
    if (!isFree) {
      await this.offerNext(tripId);
      return;
    }
    await this.redis.set(`dispatch:${tripId}:offer`, driverId, 'EX', offerSeconds + OFFER_GRACE_S);
    await this.redis.set(`dispatch:${tripId}:offered`, '1', 'EX', 900);
    await this.offerStats.record(driverId, 'offered');
    const details = await this.offerDetails(trip, driverId);
    this.events.toDriver(driverId, 'trip.offer', { ...details, expiresInSeconds: offerSeconds });
    // Also as a push: the driver app may be in the background or killed.
    void this.notifier.offer({ driverId, trip, pickupEtaMin: details.pickupEtaMin, expiresInSeconds: offerSeconds });
    await this.jobs.schedule(OFFER_EXPIRE_JOB, tripId, Date.now() + offerSeconds * 1000, { driverId });
  }

  /**
   * What the driver sees on the request card: the trip (without the OTP), the customer and the pickup distance. No
   * phone numbers (the passenger's or `riderPhone`): a driver gets those only once they have accepted (the accept
   * answer, `trip.updated`, GET /trips/active).
   */
  async offerDetails(booked: Trip, driverId: string): Promise<OfferDetails> {
    const pickup = { lat: booked.pickupLat, lng: booked.pickupLng };
    const [passenger, at, useRoad, driver] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: booked.passengerId }, select: { name: true, identityStatus: true } }),
      this.location.position(driverId),
      this.settings.get('useRoadEta'),
      this.prisma.driver.findUnique({ where: { id: driverId }, select: { vehicleKind: true } }),
    ]);
    // "Book any": a driver of an added vehicle sees the trip as their vehicle, at its fare.
    const trip = asVehicle(booked, driver?.vehicleKind);
    return {
      trip: { ...trip, otp: '', riderPhone: null },
      // Booked for someone else: the driver sees the rider; the account holder is "booked by".
      passenger: booked.riderName
        ? { name: booked.riderName, isVerified: false, bookedBy: passenger?.name ?? undefined }
        : { name: passenger?.name ?? 'Tamil Taxi customer', isVerified: passenger?.identityStatus === 'APPROVED' },
      pickupKm: at ? Math.round(roadKm(at, pickup) * 10) / 10 : null,
      pickupEtaMin: at ? await this.eta.minutes({ from: at, to: pickup, vehicleKind: trip.vehicleKind, useRoad }) : null,
    };
  }

  /** Search time left is counted from the booking, or from the last vehicle the passenger added. */
  private async searchedLongEnough(trip: Trip): Promise<boolean> {
    const [offered, since, s] = await Promise.all([
      this.redis.exists(`dispatch:${trip.id}:offered`),
      this.redis.get(`dispatch:${trip.id}:since`),
      this.settings.all(),
    ]);
    const from = Math.max(trip.searchFrom.getTime(), Number(since ?? 0));
    return Date.now() - from >= searchWindowMs(offered === 1, s);
  }

  /**
   * Nobody left in the queue: search again shortly, or end the search once it has run long enough. A fresh search
   * that finds nobody but drivers who already declined ends it right away once the radius can't widen any more and
   * no other vehicle was added (they said no; waiting helps nobody).
   */
  private async searchAgainOrGiveUp(trip: Trip, searchFoundNobody: boolean): Promise<void> {
    const [declined, excluded] = searchFoundNobody ? await Promise.all([this.redis.scard(declinedKey(trip.id)), this.redis.scard(excludedKey(trip.id))]) : [0, 0];
    if (declined + excluded > 0) {
      // Only drivers who said no (or were taken off it) are in range: wait while the radius still widens, else end it now.
      const s = await this.settings.all();
      const atMax = searchRadiusAt(Date.now() - trip.searchFrom.getTime(), s) >= Math.max(s.searchRadiusKm, s.maxSearchRadiusKm);
      if (atMax && trip.alsoKinds.length === 0) return this.giveUp(trip);
    }
    if (!(await this.searchedLongEnough(trip))) {
      await this.jobs.schedule(RESEARCH_JOB, trip.id, Date.now() + RESEARCH_AFTER_MS);
      return;
    }
    await this.giveUp(trip);
  }

  private async giveUp(trip: Trip): Promise<void> {
    const { count } = await this.prisma.trip.updateMany({
      where: { id: trip.id, status: TripStatus.SEARCHING },
      data: { status: TripStatus.NO_DRIVERS, cancelledBy: CancelledBy.SYSTEM, cancelCode: CancelCode.NO_DRIVERS, cancelledAt: new Date() },
    });
    await this.stop(trip.id);
    if (count === 0) return;
    this.events.toUser(trip.passengerId, 'trip.no_drivers', { tripId: trip.id });
    this.notifier.tripChanged({ ...trip, status: TripStatus.NO_DRIVERS }, 'SYSTEM');
  }

  /**
   * Safety net (one instance at a time): a SEARCHING trip with no open offer, no pending batch and no scheduled
   * re-search fell through the cracks (e.g. its offer key expired while the API was down) → queue it again, or end
   * it if it has searched long enough.
   */
  async sweep(): Promise<void> {
    if (!(await this.redis.set(SWEEP_LOCK_KEY, '1', 'PX', SWEEP_EVERY_MS - 1_000, 'NX'))) return;
    const searching = await this.prisma.trip.findMany({ where: { status: TripStatus.SEARCHING } });
    for (const trip of searching) {
      const [offer, pending, retry] = await Promise.all([
        this.offeredTo(trip.id),
        this.redis.sismember(PENDING_KEY, trip.id),
        this.jobs.scheduledAt(RESEARCH_JOB, trip.id),
      ]);
      if (offer || pending || retry) continue;
      if (await this.searchedLongEnough(trip)) await this.giveUp(trip);
      else await this.redis.sadd(PENDING_KEY, trip.id);
    }
  }

  private async onTimeout(tripId: string, driverId: string): Promise<void> {
    if ((await this.offeredTo(tripId)) !== driverId) return;
    this.logger.debug(`Offer for ${tripId} to ${driverId} timed out`);
    await this.offerStats.record(driverId, 'ignored');
    await this.next(tripId);
  }
}

/**
 * [trip] as matched with a driver of [driverKind]: an added vehicle ("Book any") takes its own quote from
 * `alsoFares` (a bike driver on a parcel takes it as a goods bike); a driver who can serve the booked vehicle (an
 * auto on Auto Priority, a scooter on a Bike ride) or an unknown one leaves the trip as it is.
 */
export function asVehicle(trip: Trip, driverKind: VehicleKind | undefined): Trip {
  if (driverKind && driverKindsFor(trip.vehicleKind).includes(driverKind)) return trip;
  const kind = driverKind && tripVehicleFor(driverKind, trip.kind);
  if (!kind || kind === trip.vehicleKind || !trip.alsoKinds.includes(kind)) return trip;
  const quote = (trip.alsoFares as Record<string, { total: number }> | null)?.[kind];
  if (!quote) return trip;
  // The rider's extra ("+₹20") is on top of whichever vehicle takes it.
  const fare = withExtra(quote, extraOf(trip.fare));
  return { ...trip, vehicleKind: kind, fare, fareTotal: fare.total };
}

export interface OfferDetails {
  trip: Trip;
  /** isVerified: the rider passed the optional Didit check (a badge on the request card). */
  /** The rider: the account holder, or who they booked for ([bookedBy] = the account holder's name). No phone. */
  passenger: { name: string; isVerified: boolean; bookedBy?: string };
  pickupKm: number | null;
  pickupEtaMin: number | null;
}
