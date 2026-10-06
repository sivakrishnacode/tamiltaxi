import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { AuthUser } from '../../core/auth/auth-user.js';
import { JobsService } from '../../core/jobs/jobs.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { RedisService } from '../../core/redis/redis.service.js';
import type { Prisma, Trip } from '../../generated/prisma/client.js';
import { CancelCode, CancelFault, CancelledBy, DriverStatus, DueStatus, Gender, type PaymentMode, RideMode, TripKind, TripStatus, type VehicleKind, WomenDriverPref } from '../../generated/prisma/enums.js';
import { DriverLocationService } from '../drivers/driver-location.service.js';
import { TripDriversService } from '../drivers/trip-drivers.service.js';
import { MAX_RIDER_NOT_WOMAN } from '../drivers/women-drivers.js';
import { type FareQuote, haversineMeters, waitingCharge, waitingTerms, withWaitingCharge } from '../fares/fare-engine.js';
import { FARE_RULES } from '../fares/fare-rules.js';
import { isGoodsTruck } from '../fares/goods-modes.js';
import { isCabTier, type ModeTerms, settleMode, withSettlement } from '../fares/ride-modes.js';
import { DemandService } from '../geo/demand.service.js';
import { GeoService } from '../geo/geo.service.js';
import { cellAt } from '../geo/h3.util.js';
import { FaresService } from '../fares/fares.service.js';
import { EtaService } from '../maps/eta.service.js';
import { MapsService } from '../maps/maps.service.js';
import { NotifierService, type TripWithPeople } from '../notifications/notifier.service.js';
import { TripEventsService } from '../realtime/trip-events.service.js';
import { TripTrackService } from '../realtime/trip-track.service.js';
import { asVehicle, DispatchService } from './dispatch.service.js';
import { bookingTimes } from './booking-times.js';
import type { BookTripDto } from './dto/book-trip.dto.js';
import type { CancelTripDto } from './dto/cancel-trip.dto.js';
import { resolveCancel } from './cancel-codes.js';
import { cancelSignals, type CancelSignals, faultVerdict, type FaultVerdict } from './cancel-fault.js';
import { cancellationDueAmount, withCancellationFee } from './cancellation-dues.js';
import { extraOf, extraProblem, withExtra } from './extra-fare.js';
import { SAFETY_CHECK_EVENT, SafetyMonitorService, safetyCheckPayload } from '../safety/safety-monitor.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type { PositionCheckDto } from './dto/position-check.dto.js';
import { checkNearStop, positionForCheck } from './trip-position.js';
import { averageRating } from './driver-rating.js';
import { fareReviewNotes, mergeReviewNote } from './fare-review.js';
import { TripOtpGuard } from './trip-otp-guard.js';
import { newTripOtp, RideOtpService } from './ride-otp.service.js';
import { TRIP_INCLUDE } from './trip-include.js';
import { DriverBlocksService, istTime } from './driver-blocks.service.js';
import { canReassign, canTransition, isFinished } from './trip-transitions.js';
import { ALL_TRIP_JOBS, noShowAt, pickupCapAt, pickupCheckAt, setOffAt, stuckAt, TRIP_JOBS } from './trip-timeouts.js';

/** H3 resolution stored on trips for heatmaps. */
const HEAT_RES = 8;

/** "Book any": at most this many vehicles added to one search. */
const MAX_ALSO_KINDS = 3;

/** A rider's trip in these is still searching or under way: no second trip for now meanwhile. */
const IN_PROGRESS = [TripStatus.SEARCHING, TripStatus.DRIVER_ASSIGNED, TripStatus.DRIVER_ARRIVED, TripStatus.IN_PROGRESS, TripStatus.PICKED_UP] as const;
/** How long one booking may hold the rider's booking lock. */
const BOOKING_LOCK_S = 15;
/** Keep an overlapping scheduled booking pending, checking again once a minute. */
const SCHEDULED_RECHECK_MS = 60_000;

/** Another vehicle a searching passenger could add: free drivers of it are within the maximum search radius. */
export interface VehicleAlternative {
  readonly vehicleKind: VehicleKind;
  readonly quote: FareQuote;
  readonly driversNearby: number;
  /** Straight-line km from the pickup to the nearest of them. */
  readonly nearestKm: number;
}

/** Both sides see who they're riding with: the driver (with name / phone) and the passenger's name / phone. */
/** "+919876543210" from "9876543210" or "+919876543210" (the DTO already checked it). */
const normalisePhone = (phone: string): string => (phone.startsWith('+91') ? phone : `+91${phone}`);


type CancelInfo = { by: CancelledBy; code: CancelCode; note: string | null };

/** A trip [TripsService.accept] just won: as booked, as the driver's vehicle takes it, where the driver was and when. */
type ClaimedTrip = { booked: Trip; matched: Trip; at: { lat: number; lng: number } | null; acceptedAt: Date };

/** The verdict of one cancellation and what it was based on. */
type Judged = { signals: CancelSignals; verdict: FaultVerdict; /** Cancellation fee owed to the driver (0 = none). */ due: number };

/**
 * "Passenger didn't come" only after the driver has waited at the pickup (`noShowAt`); before that → 400
 * `NO_SHOW_TOO_EARLY` with `details.retryInSeconds`.
 */
function checkNoShowWait(trip: Trip, now = Date.now()): void {
  if (trip.status === TripStatus.DRIVER_ARRIVED && trip.noShowAt && trip.noShowAt.getTime() <= now) return;
  const retryInSeconds = trip.status === TripStatus.DRIVER_ARRIVED && trip.noShowAt ? Math.ceil((trip.noShowAt.getTime() - now) / 1000) : null;
  throw new BadRequestException({
    code: 'NO_SHOW_TOO_EARLY',
    message: retryInSeconds === null ? 'Mark "Arrived" and wait for the passenger first' : `Please wait ${Math.ceil(retryInSeconds / 60)} more min for the passenger`,
    details: { retryInSeconds },
  });
}

/** [trip] as a driver may see it: the ride / delivery OTP is only for the passenger to read out. */
const hideOtp = <T extends Trip>(trip: T): T => ({ ...trip, otp: '' });

/** Rides and parcels: booking, the status lifecycle, cancel and rating. */
@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fares: FaresService,
    private readonly dispatch: DispatchService,
    private readonly location: DriverLocationService,
    private readonly events: TripEventsService,
    private readonly geo: GeoService,
    private readonly demand: DemandService,
    private readonly notifier: NotifierService,
    private readonly settings: SettingsService,
    private readonly otpGuard: TripOtpGuard,
    private readonly jobs: JobsService,
    private readonly eta: EtaService,
    private readonly track: TripTrackService,
    private readonly blocks: DriverBlocksService,
    private readonly safety: SafetyMonitorService,
    private readonly maps: MapsService,
    private readonly tripDrivers: TripDriversService,
    private readonly redis: RedisService,
    private readonly rideOtps: RideOtpService,
  ) {}

  /**
   * Quotes, stores and starts dispatching a trip. A rental or outstation trip (cab tiers) is priced by its package or
   * per km (ride-modes.ts); booked for later ([BookTripDto.scheduledAt]) it waits as SCHEDULED and dispatch starts
   * `scheduledDispatchLeadMin` before the pickup time ([startScheduled]). A trip for now while another one of the
   * rider's is still searching or under way → 409 `TRIP_IN_PROGRESS` (bookings for later are fine).
   */
  async book(passengerId: string, dto: BookTripDto): Promise<Trip> {
    // One booking at a time per rider, so two quick taps can't both pass the trip-in-progress check.
    const lock = `trips:booking:${passengerId}`;
    if ((await this.redis.set(lock, '1', 'EX', BOOKING_LOCK_S, 'NX')) !== 'OK') throw new ConflictException('Your booking is already on its way');
    try {
      return await this.createBooking(passengerId, dto);
    } finally {
      await this.redis.del(lock);
    }
  }

  /** 409 while the rider has a trip searching or under way (SEARCHING … PICKED_UP; not one booked for later). */
  private async checkNoTripInProgress(passengerId: string): Promise<void> {
    const open = await this.prisma.trip.findFirst({ where: { passengerId, status: { in: [...IN_PROGRESS] } }, select: { id: true } });
    if (open) throw new ConflictException({ code: 'TRIP_IN_PROGRESS', message: 'You already have a trip in progress', details: { tripId: open.id } });
  }

  private async createBooking(passengerId: string, dto: BookTripDto): Promise<Trip> {
    const shifting = dto.shifting;
    // A house shift to another town is priced by the km like goods to another town.
    const mode = shifting ? (shifting.between ? RideMode.OUTSTATION : RideMode.LOCAL) : (dto.rideMode ?? RideMode.LOCAL);
    const isGoods = FARE_RULES[dto.vehicleKind].isGoods;
    if (isGoods !== (dto.kind === TripKind.PARCEL)) throw new BadRequestException('Vehicle does not match trip kind');
    if (shifting) {
      if (!isGoodsTruck(dto.vehicleKind)) throw new BadRequestException('Packers & Movers goes by three-wheeler, mini truck, pickup or truck');
      if (!shifting.items?.length) throw new BadRequestException('Add the things you are moving');
    } else if (mode !== RideMode.LOCAL && dto.kind === TripKind.PARCEL) {
      if (mode !== RideMode.OUTSTATION || !isGoodsTruck(dto.vehicleKind)) {
        throw new BadRequestException('Goods to another town go by three-wheeler, mini truck, pickup or truck');
      }
      if (dto.roundTrip) throw new BadRequestException('Goods to another town are one way');
    } else if (mode !== RideMode.LOCAL && !isCabTier(dto.vehicleKind)) {
      throw new BadRequestException('Rentals and outstation trips are for Mini, Sedan and SUV');
    }
    const now = new Date();
    const { scheduledAt, returnAt } = bookingTimes(dto, mode, now, { shifting: !!shifting });
    const s = await this.settings.all();
    const dispatchAt = scheduledAt ? scheduledAt.getTime() - s.scheduledDispatchLeadMin * 60_000 : now.getTime();
    const isLater = dispatchAt > now.getTime();
    if (!isLater) await this.checkNoTripInProgress(passengerId);
    // A rental starts and ends wherever the rider says on the way: its drop is the pickup.
    const drop = mode === RideMode.RENTAL ? dto.pickup : dto.drop;
    if (!drop) throw new BadRequestException('Choose where you are going');
    const [from, to] = await Promise.all([this.geo.locate(dto.pickup), this.geo.locate(drop)]);
    // Outstation goes to other towns: only the pickup has to be in the service area.
    if (!from.isServiceable || (mode === RideMode.LOCAL && !to.isServiceable)) throw new BadRequestException("Tamil Taxi isn't in this area yet");
    if (dto.rider && isGoods) throw new BadRequestException('Parcels are booked with sender and receiver details');
    const riderIsWoman = dto.rider
      ? dto.rider.isWoman
      : (await this.prisma.user.findUnique({ where: { id: passengerId }, select: { gender: true } }))?.gender === Gender.FEMALE;
    const womenDriver = dto.womenDriver ?? WomenDriverPref.NONE;
    if (womenDriver !== WomenDriverPref.NONE) {
      if (isGoods) throw new BadRequestException('Pink Taxi is for rides only');
      if (!riderIsWoman) {
        throw new BadRequestException(
          dto.rider ? 'Pink Taxi is for women riders' : 'Pink Taxi is for women riders. Set your gender in Profile to use it',
        );
      }
      if (dto.rider) await this.checkButterflyForOthers(passengerId);
    }
    let quote: FareQuote;
    let modeTerms: ModeTerms | null = null;
    let shiftingRecord: Prisma.InputJsonValue | undefined;
    if (shifting && scheduledAt) {
      const q = await this.fares.shiftingQuote({ pickup: dto.pickup, drop, details: shifting, vehicleKind: dto.vehicleKind, at: scheduledAt, now });
      // The vehicle's fare with the whole shift as its total (the lines are in `shifting`).
      quote = { ...q.transportQuote, subtotal: q.lines.subtotal, total: q.lines.total };
      modeTerms = q.modeTerms;
      const items = (shifting.items ?? []).map((i) => ({ name: i.name.trim(), qty: i.qty, ...(i.note?.trim() && { note: i.note.trim() }) }));
      shiftingRecord = { ...shifting, items, lines: q.lines } as unknown as Prisma.InputJsonValue;
    } else if (mode === RideMode.LOCAL) {
      quote = await this.fares.quoteOne({ pickup: dto.pickup, drop, vehicleKind: dto.vehicleKind });
    } else {
      const quotes = await this.fares.modeQuotes({
        pickup: dto.pickup,
        drop,
        rideMode: mode,
        kind: dto.kind,
        rentalPackageId: dto.rentalPackageId,
        roundTrip: dto.roundTrip,
        leaveAt: scheduledAt ?? now,
        returnAt,
      });
      const { modeTerms: terms, ...fare } = quotes.find((q) => q.vehicleKind === dto.vehicleKind)!;
      quote = fare;
      modeTerms = terms;
    }
    // The road route that quote just fetched, from the cache (no extra Google call), for the route-deviation check.
    const road =
      mode === RideMode.RENTAL ? null : await this.maps.cachedRoute({ from: dto.pickup, to: drop, vehicleKind: dto.vehicleKind }).catch(() => null);
    const trip = await this.prisma.trip.create({
      data: {
        kind: dto.kind,
        vehicleKind: dto.vehicleKind,
        passengerId,
        status: isLater ? TripStatus.SCHEDULED : TripStatus.SEARCHING,
        rideMode: mode,
        modeTerms: (modeTerms ?? undefined) as Prisma.InputJsonValue | undefined,
        shifting: shiftingRecord,
        scheduledAt,
        searchFrom: now,
        pickupName: dto.pickup.name ?? 'Pinned location',
        pickupAddr: dto.pickup.address ?? '',
        pickupLandmark: dto.pickupLandmark?.trim() || null,
        pickupLat: dto.pickup.lat,
        pickupLng: dto.pickup.lng,
        dropName: drop.name ?? 'Pinned location',
        dropAddr: drop.address ?? '',
        dropLat: drop.lat,
        dropLng: drop.lng,
        pickupCell: cellAt(dto.pickup.lat, dto.pickup.lng, HEAT_RES),
        dropCell: cellAt(drop.lat, drop.lng, HEAT_RES),
        distanceKm: quote.distanceKm,
        durationMin: quote.durationMin,
        fare: quote as unknown as Prisma.InputJsonValue,
        fareTotal: quote.total,
        // The rider's own code for their own rides; a one-time code for parcels and rides for someone else.
        otp: dto.kind === TripKind.RIDE && !dto.rider ? await this.rideOtps.forRider(passengerId) : newTripOtp(),
        paymentMode: dto.paymentMode,
        parcel: dto.parcel as Prisma.InputJsonValue | undefined,
        payer: dto.payer,
        womenDriver,
        riderName: dto.rider?.name.trim(),
        riderPhone: dto.rider ? normalisePhone(dto.rider.phone) : undefined,
        riderIsWoman,
        routePolyline: road?.encodedPolyline || null,
      },
    });
    if (isLater) {
      await this.jobs.schedule(TRIP_JOBS.scheduledDispatch, trip.id, dispatchAt, {});
      return trip;
    }
    await this.demand.recordRequest(dto.pickup, passengerId);
    await this.dispatch.start(trip);
    return trip;
  }

  /**
   * A SCHEDULED trip's time has come (job `trip.scheduled-dispatch`): it starts looking for a driver now (the search
   * radius widens from here), and the passenger sees "Finding your driver". A cancelled or already started trip is
   * left alone. When the passenger is already on a trip or making a booking, dispatch waits and checks again.
   */
  async startScheduled(tripId: string): Promise<void> {
    const scheduled = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!scheduled || scheduled.status !== TripStatus.SCHEDULED) return;
    const lock = `trips:booking:${scheduled.passengerId}`;
    if ((await this.redis.set(lock, '1', 'EX', BOOKING_LOCK_S, 'NX')) !== 'OK') return this.deferScheduled(tripId);
    try {
      const open = await this.prisma.trip.findFirst({ where: { passengerId: scheduled.passengerId, status: { in: [...IN_PROGRESS] } }, select: { id: true } });
      if (open) return await this.deferScheduled(tripId);
      const { count } = await this.prisma.trip.updateMany({
        where: { id: tripId, status: TripStatus.SCHEDULED },
        data: { status: TripStatus.SEARCHING, searchFrom: new Date() },
      });
      if (count === 0) return;
      const trip = await this.prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
      await this.demand.recordRequest({ lat: trip.pickupLat, lng: trip.pickupLng }, trip.passengerId);
      await this.dispatch.start(trip);
      await this.publish(tripId, 'SYSTEM');
    } finally {
      await this.redis.del(lock);
    }
  }

  private deferScheduled(tripId: string): Promise<void> {
    return this.jobs.schedule(TRIP_JOBS.scheduledDispatch, tripId, Date.now() + SCHEDULED_RECHECK_MS);
  }

  /** The passenger's trips booked for later (soonest first). */
  async upcoming(passengerId: string): Promise<Trip[]> {
    return this.prisma.trip.findMany({
      where: { passengerId, status: TripStatus.SCHEDULED },
      orderBy: { scheduledAt: 'asc' },
      take: 20,
      include: TRIP_INCLUDE,
    });
  }

  /** Drivers reported (cancel code BUTTERFLY_MISMATCH) that the "woman" this account booked Butterfly for was not one. */
  private async checkButterflyForOthers(passengerId: string): Promise<void> {
    const reports = await this.prisma.trip.count({
      where: { passengerId, riderName: { not: null }, cancelCode: CancelCode.BUTTERFLY_MISMATCH },
    });
    if (reports >= MAX_RIDER_NOT_WOMAN) {
      throw new ForbiddenException('Pink Taxi for someone else is off for your account after reports from drivers. Contact support.');
    }
  }

  async history(user: AuthUser): Promise<Trip[]> {
    const where = user.driverId ? { driverId: user.driverId } : { passengerId: user.userId };
    const trips = await this.prisma.trip.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50, include: TRIP_INCLUDE });
    return user.driverId ? trips.map((t) => ({ ...t, otp: '' })) : trips;
  }

  /** The caller's unfinished trip (searching or on the way), to restore the app after a restart. */
  async active(user: AuthUser): Promise<Trip | null> {
    // A trip booked for later isn't active until its search starts (GET /trips/upcoming lists those).
    const unfinished = { notIn: [TripStatus.COMPLETED, TripStatus.DELIVERED, TripStatus.CANCELLED, TripStatus.NO_DRIVERS, TripStatus.SCHEDULED] };
    const where = user.driverId ? { driverId: user.driverId, status: unfinished } : { passengerId: user.userId, status: unfinished };
    const trip = await this.prisma.trip.findFirst({ where, orderBy: { createdAt: 'desc' }, include: TRIP_INCLUDE });
    if (!trip) return null;
    return user.driverId && trip.driverId === user.driverId ? { ...trip, otp: '' } : trip;
  }

  /** A trip the caller takes part in. The OTP is hidden from drivers. */
  async get(user: AuthUser, id: string): Promise<Trip> {
    const trip = await this.prisma.trip.findUnique({ where: { id }, include: TRIP_INCLUDE });
    if (!trip) throw new NotFoundException('Trip not found');
    const isPassenger = trip.passengerId === user.userId;
    if (!isPassenger && trip.driverId !== user.driverId) throw new ForbiddenException();
    return isPassenger ? trip : { ...trip, otp: '' };
  }

  async accept(driverId: string, tripId: string): Promise<Trip> {
    await this.checkCanTakeTrips(driverId);
    if ((await this.dispatch.offeredTo(tripId)) !== driverId) throw new ConflictException('This request is no longer available');
    // One active trip per driver: claimed before the database write, released again only if the write lost (or never
    // ran). Once the trip is theirs, a later step failing must not free them while they hold it.
    if (!(await this.location.claimBusy(driverId, tripId))) throw new ConflictException('Finish your current trip first');
    let won: ClaimedTrip | null;
    try {
      won = await this.claimTrip(driverId, tripId);
    } catch (e) {
      await this.location.releaseBusy(driverId, tripId, false);
      throw e;
    }
    if (!won) {
      await this.location.releaseBusy(driverId, tripId, false);
      throw new ConflictException('Trip already taken or cancelled');
    }
    return this.assigned(driverId, tripId, won);
  }

  /**
   * Only an approved driver who is not paused (too many cancellations) and not blocked takes trips: an offer can still
   * be open when an admin puts them on hold or the pause starts. 403 otherwise (`DRIVER_TEMP_BLOCKED` while paused).
   */
  private async checkCanTakeTrips(driverId: string): Promise<void> {
    const d = await this.prisma.driver.findUnique({ where: { id: driverId }, select: { status: true, blockedUntil: true, user: { select: { isBlocked: true } } } });
    if (!d || d.user.isBlocked) throw new ForbiddenException('Your account is blocked. Contact support.');
    if (d.status !== DriverStatus.APPROVED) throw new ForbiddenException(`You can't take trips while your account is ${d.status.toLowerCase().replace('_', ' ')}`);
    if (d.blockedUntil && d.blockedUntil.getTime() > Date.now()) {
      throw new ForbiddenException({
        code: 'DRIVER_TEMP_BLOCKED',
        message: `You cancelled too many rides, so you can't take trips until ${istTime(d.blockedUntil)}`,
        details: { until: d.blockedUntil.toISOString() },
      });
    }
  }

  /**
   * The guarded write that gives the SEARCHING trip to [driverId] (as their vehicle, "Book any"). Null when it lost:
   * someone else took it, or it was cancelled.
   */
  private async claimTrip(driverId: string, tripId: string): Promise<ClaimedTrip | null> {
    const [booked, driver] = await Promise.all([
      this.prisma.trip.findUnique({ where: { id: tripId } }),
      this.prisma.driver.findUnique({ where: { id: driverId }, select: { vehicleKind: true } }),
    ]);
    if (!booked) throw new NotFoundException('Trip not found');
    // "Book any": a driver of an added vehicle takes the trip as that vehicle, at its fare.
    const matched = asVehicle(booked, driver?.vehicleKind);
    const switched = matched.vehicleKind !== booked.vehicleKind;
    // Where the driver is now: the "not moving" check compares later positions to this.
    const pickup = { lat: booked.pickupLat, lng: booked.pickupLng };
    const at = await this.location.position(driverId);
    const acceptDistanceM = at ? Math.round(haversineMeters(at, pickup)) : null;
    const acceptedAt = new Date();
    const { count } = await this.prisma.trip.updateMany({
      where: { id: tripId, status: TripStatus.SEARCHING },
      data: {
        status: TripStatus.DRIVER_ASSIGNED,
        driverId,
        assignedAt: acceptedAt,
        acceptDistanceM,
        ...(switched && { vehicleKind: matched.vehicleKind, fare: matched.fare as Prisma.InputJsonValue, fareTotal: matched.fareTotal }),
      },
    });
    return count === 0 ? null : { booked, matched, at, acceptedAt };
  }

  /** After [claimTrip] won: stop dispatching, start the pickup timers, tell both sides. */
  private async assigned(driverId: string, tripId: string, won: ClaimedTrip): Promise<Trip> {
    const { booked, matched, at, acceptedAt } = won;
    const pickup = { lat: booked.pickupLat, lng: booked.pickupLng };
    await this.dispatch.accepted(tripId, driverId);
    // Breadcrumbs from here: the drive to the pickup, then the ride from start.
    await this.track.setPhase(tripId, 'p');
    const s = await this.settings.all();
    const etaMin = at ? await this.eta.minutes({ from: at, to: pickup, vehicleKind: matched.vehicleKind, useRoad: s.useRoadEta }).catch(() => null) : null;
    // A trip booked for later, accepted early: the driver only has to set off in time for the pickup.
    const setOff = setOffAt(acceptedAt.getTime(), booked.scheduledAt, etaMin);
    await this.jobs.schedule(TRIP_JOBS.pickupProgress, tripId, pickupCheckAt(setOff, etaMin, s), { driverId, strikes: 0 });
    await this.jobs.schedule(TRIP_JOBS.pickupCap, tripId, pickupCapAt(setOff, s), { driverId });
    return hideOtp(await this.publish(tripId, 'DRIVER'));
  }

  /**
   * "Book any" (like Namma Yatra): other vehicles of the same kind (ride / goods) the passenger could add to a slow
   * search. Only vehicles with free drivers within the maximum search radius, cheapest first, with their fare.
   */
  async alternatives(passengerId: string, tripId: string): Promise<VehicleAlternative[]> {
    const trip = await this.searchingTrip(passengerId, tripId);
    // Rentals and outstation trips are priced per tier up front: no "Book any".
    if (trip.rideMode !== RideMode.LOCAL) return [];
    const s = await this.settings.all();
    const isGoods = FARE_RULES[trip.vehicleKind].isGoods;
    const kinds = (Object.keys(FARE_RULES) as VehicleKind[]).filter(
      (k) => FARE_RULES[k].isGoods === isGoods && k !== trip.vehicleKind && !trip.alsoKinds.includes(k),
    );
    const pickup = { lat: trip.pickupLat, lng: trip.pickupLng };
    const route = { distanceKm: trip.distanceKm, durationMin: trip.durationMin };
    const radiusKm = Math.max(s.searchRadiusKm, s.maxSearchRadiusKm);
    const found = await Promise.all(
      kinds.map(async (vehicleKind): Promise<VehicleAlternative | null> => {
        const drivers = await this.tripDrivers.nearby({ kind: vehicleKind, ...pickup, radiusKm, limit: 5 });
        if (drivers.length === 0) return null;
        // Same route as the booking, so the fares compare like the vehicle list did; the rider's extra comes on top.
        const quote = withExtra(await this.fares.quoteOnRoute({ pickup, route, vehicleKind }), extraOf(trip.fare));
        const nearestKm = Math.round(Math.min(...drivers.map((d) => d.distanceKm)) * 10) / 10;
        return { vehicleKind, quote, driversNearby: drivers.length, nearestKm };
      }),
    );
    return found.filter((a): a is VehicleAlternative => a !== null).sort((a, b) => a.quote.total - b.quote.total);
  }

  /**
   * The rider adds extra to a trip nobody has taken yet (like Rapido's "+₹10"): [amount] is the extra in all, more
   * than before and up to [maxExtra]. Every vehicle's fare goes up by it; drivers who said no get the request again,
   * the one looking at it sees the new fare, and the search time starts over.
   */
  async addExtra(passengerId: string, tripId: string, amount: number): Promise<Trip> {
    const trip = await this.searchingTrip(passengerId, tripId);
    const was = extraOf(trip.fare);
    const problem = extraProblem({ amount, was, quoteTotal: trip.fareTotal - was });
    if (problem) throw new BadRequestException(problem);
    const fare = (trip.fare ?? {}) as { total?: number; extra?: number };
    const next = withExtra({ ...fare, total: fare.total ?? trip.fareTotal }, amount);
    // Guarded on the fare it was checked with, so two quick taps can't both add on the old total.
    const { count } = await this.prisma.trip.updateMany({
      where: { id: tripId, status: TripStatus.SEARCHING, fareTotal: trip.fareTotal },
      data: { fare: next as Prisma.InputJsonValue, fareTotal: trip.fareTotal - was + amount },
    });
    if (count === 0) throw new ConflictException('The search has already ended, or the fare just changed');
    await this.dispatch.boosted(tripId);
    return this.publish(tripId, 'PASSENGER');
  }

  /**
   * Adds [vehicleKind] to a searching trip ("Book any"): its drivers get the offer too, at that vehicle's fare. The
   * write is guarded on the vehicle list it was checked with, so two adds at once can't both pass the
   * [MAX_ALSO_KINDS] cap or drop each other's fare: the one that lost looks again (up to 3 times).
   */
  async addVehicle(passengerId: string, tripId: string, vehicleKind: VehicleKind): Promise<Trip> {
    for (let attempt = 1; ; attempt++) {
      const trip = await this.searchingTrip(passengerId, tripId);
      if (trip.rideMode !== RideMode.LOCAL) throw new BadRequestException('Rentals and outstation trips keep the vehicle you booked');
      if (FARE_RULES[vehicleKind].isGoods !== FARE_RULES[trip.vehicleKind].isGoods) {
        throw new BadRequestException("That vehicle can't take this trip");
      }
      if (vehicleKind === trip.vehicleKind || trip.alsoKinds.includes(vehicleKind)) {
        return this.prisma.trip.findUniqueOrThrow({ where: { id: tripId }, include: TRIP_INCLUDE });
      }
      if (trip.alsoKinds.length >= MAX_ALSO_KINDS) throw new BadRequestException('You already added the other vehicles');
      const quote = await this.fares.quoteOnRoute({
        pickup: { lat: trip.pickupLat, lng: trip.pickupLng },
        route: { distanceKm: trip.distanceKm, durationMin: trip.durationMin },
        vehicleKind,
      });
      const alsoFares = { ...(trip.alsoFares as Record<string, FareQuote> | null), [vehicleKind]: quote };
      const { count } = await this.prisma.trip.updateMany({
        where: { id: tripId, status: TripStatus.SEARCHING, alsoKinds: { equals: trip.alsoKinds } },
        data: { alsoKinds: { set: [...trip.alsoKinds, vehicleKind] }, alsoFares: alsoFares as unknown as Prisma.InputJsonValue },
      });
      if (count === 1) break;
      // Another add (or the end of the search) got in first: check again with the trip as it is now.
      if (attempt >= 3) throw new ConflictException('The search just changed. Please try again');
    }
    await this.dispatch.widen(tripId);
    return this.publish(tripId, 'PASSENGER');
  }

  private async searchingTrip(passengerId: string, tripId: string): Promise<Trip> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip || trip.passengerId !== passengerId) throw new NotFoundException('Trip not found');
    if (trip.status !== TripStatus.SEARCHING) throw new ConflictException('The search has already ended');
    return trip;
  }

  async decline(driverId: string, tripId: string): Promise<void> {
    if ((await this.dispatch.offeredTo(tripId)) === driverId) await this.dispatch.decline(tripId, driverId);
  }

  /** Driver at the pickup. Too far from it without a reason → 422 TOO_FAR (see [checkNearStop]). */
  async arrived(driverId: string, tripId: string, pos: PositionCheckDto = {}): Promise<Trip> {
    const trip = await this.driverTrip(driverId, tripId);
    if (trip.status === TripStatus.DRIVER_ARRIVED) return this.current(tripId);
    const check = checkNearStop({
      stop: 'pickup',
      at: await this.driverPosition(driverId, pos),
      target: { lat: trip.pickupLat, lng: trip.pickupLng },
      radiusM: await this.settings.get('arrivalRadiusM'),
      farReason: pos.farReason,
    });
    const now = Date.now();
    const s = await this.settings.all();
    const updated = await this.move({
      driverId,
      tripId,
      to: TripStatus.DRIVER_ARRIVED,
      // Early for a scheduled pickup: the no-show wait starts at the pickup time.
      data: {
        arrivedAt: new Date(now),
        noShowAt: new Date(noShowAt(Math.max(now, trip.scheduledAt?.getTime() ?? 0), s)),
        arrivedDistanceM: check.distanceM,
        arrivedFarReason: check.farReason,
      },
    });
    await this.jobs.cancel(TRIP_JOBS.pickupProgress, tripId);
    if (updated.noShowAt) await this.jobs.schedule(TRIP_JOBS.noShow, tripId, updated.noShowAt, { driverId });
    return updated;
  }

  /** The server's fresh GPS fix, else the one sent with the request (see [positionForCheck]). */
  private async driverPosition(driverId: string, pos: PositionCheckDto): Promise<{ lat: number; lng: number } | null> {
    return positionForCheck({ server: await this.location.lastFix(driverId), sent: pos, now: Date.now() });
  }

  /** Ride: driver enters the passenger's OTP to start (5 tries a minute, [TripOtpGuard]). Parcel: marks picked up. */
  async start(driverId: string, tripId: string, otp?: string): Promise<Trip> {
    const trip = await this.driverTrip(driverId, tripId);
    // A retry (double tap, lost response) of a start that already went through.
    if (trip.status === TripStatus.IN_PROGRESS || trip.status === TripStatus.PICKED_UP) return this.current(tripId);
    if (trip.kind !== TripKind.PARCEL) await this.otpGuard.check({ tripId, expected: trip.otp, given: otp, who: 'rider' });
    const startedAt = new Date();
    const to = trip.kind === TripKind.PARCEL ? TripStatus.PICKED_UP : TripStatus.IN_PROGRESS;
    const waiting = await this.waitingFare(trip, startedAt);
    const updated = await this.move({ driverId, tripId, to, data: { startedAt, ...waiting } });
    await this.track.setPhase(tripId, 't');
    // Ride safety checks on the GPS stream from here (stop and route checks, safety module); at night the passenger
    // may get "Share your trip" (push + socket).
    const nightCheck = await this.safety.rideStarted(updated).catch((e: Error) => {
      this.logger.warn(`Safety state for ${tripId} not set: ${e.message}`);
      return null;
    });
    if (nightCheck) this.events.toUser(nightCheck.passengerId, SAFETY_CHECK_EVENT, safetyCheckPayload(nightCheck));
    await Promise.all([this.jobs.cancel(TRIP_JOBS.noShow, tripId), this.jobs.cancel(TRIP_JOBS.pickupCap, tripId)]);
    await this.jobs.schedule(TRIP_JOBS.stuck, tripId, stuckAt(startedAt.getTime(), trip.durationMin, await this.settings.all()), { driverId });
    return updated;
  }

  /**
   * The fare with its waiting charge for a start at [startedAt] (driver arrived → start, first `freeWaitMin` free, then
   * `waitPerMin` per started minute, capped at `waitMaxCharge`; the terms quoted with the fare win over today's
   * settings). Rides and parcels alike. Nothing to change → `{}`.
   */
  private async waitingFare(trip: Trip, startedAt: Date): Promise<{ fare?: Prisma.InputJsonValue; fareTotal?: number }> {
    // Rentals and outstation trips quote no waiting terms (a rental's clock is its package); loading a house shift
    // takes as long as it takes.
    if (!trip.arrivedAt || trip.rideMode !== RideMode.LOCAL || trip.shifting) return {};
    const fare = (trip.fare ?? {}) as Partial<FareQuote> & { total: number };
    const s = await this.settings.all();
    const perMin = typeof fare.waitPerMin === 'number' ? fare.waitPerMin : await this.fares.waitPerMin({ lat: trip.pickupLat, lng: trip.pickupLng }, trip.vehicleKind);
    const terms = waitingTerms(fare, { freeMin: s.freeWaitMin, perMin, maxCharge: s.waitMaxCharge });
    // A driver early for a scheduled pickup waits for free until the pickup time.
    const waitFrom = Math.max(trip.arrivedAt.getTime(), trip.scheduledAt?.getTime() ?? 0);
    const charge = waitingCharge({ waitedMs: startedAt.getTime() - waitFrom, ...terms });
    const was = fare.waitingCharge ?? 0;
    if (charge === was) return {};
    const withWait = withWaitingCharge({ ...fare, total: fare.total ?? trip.fareTotal }, charge);
    return { fare: withWait as unknown as Prisma.InputJsonValue, fareTotal: trip.fareTotal - was + charge };
  }

  /**
   * Ride: end trip. Parcel: receiver's OTP confirms delivery. Frees the driver. Too far from the drop without a
   * reason → 422 TOO_FAR (the OTP is checked first so the driver isn't asked for a reason and then told it's wrong).
   */
  async complete(driverId: string, tripId: string, body: { otp?: string } & PositionCheckDto = {}): Promise<Trip> {
    const trip = await this.driverTrip(driverId, tripId);
    const isParcel = trip.kind === TripKind.PARCEL;
    if (trip.status === TripStatus.COMPLETED || trip.status === TripStatus.DELIVERED) {
      await this.location.releaseBusy(driverId, tripId);
      return this.current(tripId);
    }
    if (isParcel) await this.otpGuard.check({ tripId, expected: trip.otp, given: body.otp, who: 'receiver' });
    const s = await this.settings.all();
    const terms = trip.modeTerms as ModeTerms | null;
    // A rental ends wherever the rider gets off, a round trip back near the pickup: no "near the drop" check.
    const endsAnywhere = trip.rideMode === RideMode.RENTAL || (terms?.mode === 'OUTSTATION' && terms.roundTrip);
    const check = checkNearStop({
      stop: 'drop',
      at: await this.driverPosition(driverId, body),
      target: { lat: trip.dropLat, lng: trip.dropLng },
      radiusM: endsAnywhere ? Number.MAX_SAFE_INTEGER : s.dropRadiusM,
      farReason: body.farReason,
    });
    // The recorded path, measured before the guarded move so it is stored with the completion (one Redis read),
    // and the fare sanity checks on it (the fare stays the quote; odd trips are flagged for an admin).
    const path = await this.track.summary(tripId);
    const notes = fareReviewNotes({
      path,
      quotedKm: trip.distanceKm,
      isPickupFar: !!trip.arrivedFarReason || (trip.arrivedDistanceM ?? 0) > s.arrivalRadiusM,
      isDropFar: !!check.farReason || (check.distanceM ?? 0) > s.dropRadiusM,
    });
    const review = notes.length ? { needsReview: true, reviewNote: mergeReviewNote(trip.reviewNote, notes) } : {};
    // Rental / round trip: the km (from the GPS path) and, for rentals, minutes past the package are added now.
    const settled = terms ? this.settle(trip, terms, path) : {};
    const dues = await this.pendingDues({ ...trip, ...settled } as Trip, s.cancellationFeeEnabled);
    const updated = await this.move({
      driverId,
      tripId,
      to: isParcel ? TripStatus.DELIVERED : TripStatus.COMPLETED,
      data: { endedAt: new Date(), endDistanceM: check.distanceM, endFarReason: check.farReason, ...path, ...review, ...settled, ...dues.fare },
      // Counted in the same transaction as the guarded status change, so a double tap counts the ride once.
      after: async (tx) => {
        await tx.driver.update({ where: { id: driverId }, data: { ridesCount: { increment: 1 } } });
        if (dues.ids.length === 0) return;
        const { count } = await tx.cancellationDue.updateMany({
          where: { id: { in: dues.ids }, status: DueStatus.PENDING },
          data: { status: DueStatus.APPLIED, appliedTripId: tripId, appliedAt: new Date() },
        });
        // Taken by another ride meanwhile: roll back, the retry recounts.
        if (count !== dues.ids.length) throw new ConflictException('This trip has changed. Please try again');
      },
    });
    await this.location.releaseBusy(driverId, tripId);
    await this.clearTripJobs(tripId);
    // Night ride: "Did you reach safely?" a few minutes from now (safety module).
    await this.safety.rideCompleted(updated).catch((e: Error) => this.logger.warn(`Arrival check for ${tripId} not scheduled: ${e.message}`));
    return updated;
  }

  /**
   * How the rider paid the driver ("Received cash" / "Received on UPI", D-19 / D-22b), stored on the finished trip for
   * the rider's receipt and the driver's earnings. Only the trip's driver, only once it is completed or delivered;
   * sending it again is harmless and a later answer corrects a wrong tap. Nothing is pushed: no money moves here.
   */
  async recordPayment(driverId: string, tripId: string, mode: PaymentMode): Promise<Trip> {
    const trip = await this.driverTrip(driverId, tripId);
    if (trip.status !== TripStatus.COMPLETED && trip.status !== TripStatus.DELIVERED) throw new BadRequestException('End the trip before collecting the payment');
    if (trip.paymentMode !== mode) await this.prisma.trip.update({ where: { id: tripId }, data: { paymentMode: mode } });
    return this.current(tripId);
  }

  /** [trip]'s fare with the rental / round-trip settlement for the recorded [path] (`{}` when nothing is added). */
  private settle(trip: Trip, terms: ModeTerms, path: { actualDistanceM?: number | null; distanceCalcFailed?: boolean }): { fare?: Prisma.InputJsonValue; fareTotal?: number } {
    const km = path.distanceCalcFailed || path.actualDistanceM == null ? null : path.actualDistanceM / 1000;
    const minutes = trip.startedAt ? (Date.now() - trip.startedAt.getTime()) / 60_000 : 0;
    const s = settleMode(terms, km, minutes);
    if (s.extraKmCharge === 0 && s.extraTimeCharge === 0) return {};
    const fare = withSettlement({ ...(trip.fare as { total: number }), total: trip.fareTotal }, s);
    return { fare: fare as unknown as Prisma.InputJsonValue, fareTotal: fare.total };
  }

  /**
   * The passenger's unpaid cancellation fees, added to this ride's fare as "Previous cancellation fee" (rides only,
   * only while `cancellationFeeEnabled`); the driver collects them in cash. Nothing → no fare change.
   */
  private async pendingDues(trip: Trip, isEnabled: boolean): Promise<{ ids: string[]; fare: { fare?: Prisma.InputJsonValue; fareTotal?: number } }> {
    if (!isEnabled || trip.kind !== TripKind.RIDE) return { ids: [], fare: {} };
    const dues = await this.prisma.cancellationDue.findMany({
      where: { passengerId: trip.passengerId, status: DueStatus.PENDING, tripId: { not: trip.id } },
      select: { id: true, amount: true },
    });
    const fee = dues.reduce((a, d) => a + d.amount, 0);
    if (fee === 0) return { ids: [], fare: {} };
    const fare = (trip.fare ?? {}) as { total?: number; previousCancellationFee?: number };
    const was = fare.previousCancellationFee ?? 0;
    const withFee = withCancellationFee({ ...fare, total: fare.total ?? trip.fareTotal }, fee);
    return { ids: dues.map((d) => d.id), fare: { fare: withFee as unknown as Prisma.InputJsonValue, fareTotal: trip.fareTotal - was + fee } };
  }

  /**
   * Cancels, guarded on the status it was checked in: if the trip moved meanwhile (a driver accepted or started),
   * it is checked again, so a cancel never overwrites a ride that has started. Cancelling twice returns the trip.
   * [body]: a cancel code (one this side may use, else OTHER) and an optional note, or an old client's `reason`.
   *
   * The driver cancelling before pickup doesn't end the trip: it goes back to searching for another driver
   * ([dropTrip]). Except a Butterfly-mismatch report, which ends it (the booking itself was wrong).
   */
  async cancel(user: AuthUser, tripId: string, body: CancelTripDto = {}): Promise<Trip> {
    let trip = await this.get(user, tripId);
    const by = user.driverId && trip.driverId === user.driverId ? CancelledBy.DRIVER : CancelledBy.PASSENGER;
    const resolved = resolveCancel({ by, ...body });
    // "Rider is not a woman" only means something on a Butterfly ride. Anywhere else it would end the trip without
    // reassigning it, put the fault on the rider and skip the driver's cancel rate, so it counts as OTHER.
    const isButterfly = trip.kind === TripKind.RIDE && trip.womenDriver !== WomenDriverPref.NONE;
    const code = resolved.code === CancelCode.BUTTERFLY_MISMATCH && !isButterfly ? CancelCode.OTHER : resolved.code;
    const { note } = resolved;
    for (let attempt = 1; ; attempt++) {
      if (trip.status === TripStatus.CANCELLED) return by === CancelledBy.DRIVER ? hideOtp(trip) : trip;
      if (code === CancelCode.PASSENGER_NO_SHOW) checkNoShowWait(trip);
      if (by === CancelledBy.DRIVER && code !== CancelCode.BUTTERFLY_MISMATCH && code !== CancelCode.PASSENGER_NO_SHOW && canReassign(trip)) {
        const dropped = await this.dropTrip(trip, { by, code, note });
        if (dropped) return hideOtp(dropped);
      } else {
        if (isFinished(trip.status) || !canTransition({ kind: trip.kind, from: trip.status, to: TripStatus.CANCELLED })) {
          throw new BadRequestException('This trip can no longer be cancelled');
        }
        if (await this.markCancelled(trip, { by, code, note })) break;
      }
      if (attempt >= 3) throw new ConflictException('This trip is changing right now. Please try again');
      const now = await this.prisma.trip.findUniqueOrThrow({ where: { id: tripId }, include: TRIP_INCLUDE });
      // A retry of a driver cancel that already sent the trip back to searching: they are off it.
      if (by === CancelledBy.DRIVER && now.driverId !== user.driverId) return hideOtp(now);
      trip = now;
    }
    await this.dispatch.stop(tripId);
    await this.clearTripJobs(tripId);
    // The status matched, so this is the driver the trip had; free them only if they are still on it.
    if (trip.driverId) await this.location.releaseBusy(trip.driverId, tripId);
    const published = await this.publish(tripId, by);
    return by === CancelledBy.DRIVER ? hideOtp(published) : published;
  }

  /**
   * The driver (or the system, for a driver who isn't moving) takes [trip] off its driver before pickup: guarded back
   * to SEARCHING without the driver, who is freed and never offered it again, the drop is recorded
   * (`TripCancellation`, reassigned) and dispatch starts again; the passenger sees "finding you another driver".
   * After `maxReassigns` drops the trip is cancelled instead (SYSTEM / NO_DRIVERS; the history keeps the driver's
   * reason). Null when the trip had moved on meanwhile (nothing changed).
   */
  async dropTrip(trip: Trip, c: { by: CancelledBy; code: CancelCode; note: string | null }): Promise<Trip | null> {
    const driverId = trip.driverId;
    if (!driverId || !canReassign(trip)) return null;
    if (trip.reassignCount >= (await this.settings.get('maxReassigns'))) {
      const ended = { by: CancelledBy.SYSTEM, code: CancelCode.NO_DRIVERS, note: 'The driver cancelled and no more reassigns are allowed' };
      if (!(await this.markCancelled(trip, ended, c))) return null;
      await this.dispatch.stop(trip.id);
      await this.clearTripJobs(trip.id);
      await this.location.releaseBusy(driverId, trip.id);
      return this.publish(trip.id, 'SYSTEM', driverId);
    }
    const judged = await this.judge(trip, c);
    const applied = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.trip.updateMany({
        where: { id: trip.id, status: trip.status, driverId },
        data: {
          status: TripStatus.SEARCHING,
          driverId: null,
          assignedAt: null,
          arrivedAt: null,
          noShowAt: null,
          acceptDistanceM: null,
          arrivedDistanceM: null,
          arrivedFarReason: null,
          reassignCount: { increment: 1 },
        },
      });
      if (count === 0) return false;
      await this.recordCancellation(tx, trip, c, true, judged);
      return true;
    });
    if (!applied) return null;
    this.checkCancelRate(trip, judged);
    await this.clearTripJobs(trip.id);
    await this.location.releaseBusy(driverId, trip.id);
    await this.dispatch.restart(trip.id, driverId);
    // The dropped driver still gets this update in their own room, then nothing more from the trip.
    this.events.leaveTrip(trip.id, driverId);
    return this.publish(trip.id, c.by === CancelledBy.SYSTEM ? 'SYSTEM' : 'DRIVER', driverId);
  }

  /**
   * The system cancels [trip] (e.g. never started long after accept): guarded like a user cancel, frees the driver.
   * Null when the trip had moved on.
   */
  async systemCancel(trip: Trip, code: CancelCode, note: string): Promise<Trip | null> {
    if (isFinished(trip.status) || !canTransition({ kind: trip.kind, from: trip.status, to: TripStatus.CANCELLED })) return null;
    if (!(await this.markCancelled(trip, { by: CancelledBy.SYSTEM, code, note }))) return null;
    await this.dispatch.stop(trip.id);
    await this.clearTripJobs(trip.id);
    if (trip.driverId) await this.location.releaseBusy(trip.driverId, trip.id);
    return this.publish(trip.id, 'SYSTEM', trip.driverId ?? undefined);
  }

  /** Drops every pending timeout, the GPS breadcrumbs and the ride safety state of the trip (it ended, or changed driver). */
  private async clearTripJobs(tripId: string): Promise<void> {
    await Promise.all([...ALL_TRIP_JOBS.map((kind) => this.jobs.cancel(kind, tripId)), this.track.clear(tripId), this.safety.clear(tripId)]);
  }

  /**
   * CANCELLED with who / why / when ([c]), guarded on [trip]'s status, plus its history row ([history], default [c]),
   * in one transaction. False when the trip had moved on (nothing written).
   */
  private async markCancelled(trip: Trip, c: CancelInfo, history: CancelInfo = c): Promise<boolean> {
    const judged = await this.judge(trip, history);
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.trip.updateMany({
        where: { id: trip.id, status: trip.status },
        data: { status: TripStatus.CANCELLED, cancelledBy: c.by, cancelCode: c.code, cancelReason: c.note, cancelledAt: new Date() },
      });
      if (count === 0) return false;
      await this.recordCancellation(tx, trip, history, false, judged);
      return true;
    }).then((applied) => {
      if (applied) this.checkCancelRate(trip, judged);
      return applied;
    });
  }

  /** A cancellation held against the driver: their rate may now call for a nudge or a pause (in the background). */
  private checkCancelRate(trip: Trip, judged: Judged): void {
    if (!trip.driverId || judged.verdict.fault !== CancelFault.DRIVER) return;
    const driverId = trip.driverId;
    void this.dispatch.driverCancelled(driverId);
    this.blocks.afterCancel(driverId).catch((e: Error) => this.logger.warn(`Cancel rate check for ${driverId} failed: ${e.message}`));
  }

  /** Who was at fault for [c] on [trip] as it is now ([faultVerdict]); the driver's distance comes from their last fix. */
  private async judge(trip: Trip, c: CancelInfo, now = new Date()): Promise<Judged> {
    const s = await this.settings.all();
    const at = trip.driverId ? await this.location.position(trip.driverId).catch(() => null) : null;
    const nowM = at ? Math.round(haversineMeters(at, { lat: trip.pickupLat, lng: trip.pickupLng })) : null;
    const signals = cancelSignals({ by: c.by, code: c.code, trip, nowM, now, noShowWaitMin: s.noShowWaitMin, freeWaitMin: s.freeWaitMin });
    const verdict = faultVerdict(signals);
    const due = cancellationDueAmount({ enabled: s.cancellationFeeEnabled, fee: s.cancellationFee, verdict, signals });
    return { signals, verdict, due };
  }

  /** The history row of a cancel and, when the passenger owes a cancellation fee, the due (owed to the driver). */
  private async recordCancellation(tx: Prisma.TransactionClient, trip: Trip, c: CancelInfo, reassigned: boolean, judged: Judged): Promise<void> {
    const row = await tx.tripCancellation.create({ data: this.cancellationRow(trip, c, reassigned, judged) });
    if (judged.due > 0 && trip.driverId) {
      await tx.cancellationDue.create({
        data: { passengerId: trip.passengerId, tripId: trip.id, cancellationId: row.id, owedToDriverId: trip.driverId, amount: judged.due },
      });
    }
  }

  private cancellationRow(trip: Trip, c: CancelInfo, reassigned: boolean, judged: Judged): Prisma.TripCancellationUncheckedCreateInput {
    return {
      tripId: trip.id,
      driverId: trip.driverId,
      passengerId: trip.passengerId,
      by: c.by,
      code: c.code,
      note: c.note,
      fromStatus: trip.status,
      reassigned,
      isDriverFault: trip.driverId !== null && judged.verdict.fault === CancelFault.DRIVER,
      fault: judged.verdict.fault,
      faultRule: judged.verdict.rule,
      signals: judged.signals as unknown as Prisma.InputJsonValue,
    };
  }

  /**
   * Passenger rates the driver: the trip's rating is set only while it is still empty (a second tap → 409), and
   * the driver's rating becomes ratingSum / ratingCount, in one transaction.
   */
  async rate(passengerId: string, tripId: string, rating: number): Promise<Trip> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip || trip.passengerId !== passengerId) throw new NotFoundException('Trip not found');
    if (!isFinished(trip.status) || trip.status === TripStatus.CANCELLED || !trip.driverId) throw new BadRequestException('Only finished trips can be rated');
    const driverId = trip.driverId;
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.trip.updateMany({ where: { id: tripId, rating: null }, data: { rating } });
      if (count === 0) throw new ConflictException('Already rated');
      // The increment locks the driver row, so ratings of two trips at once both count.
      const d = await tx.driver.update({
        where: { id: driverId },
        data: { ratingSum: { increment: rating }, ratingCount: { increment: 1 } },
        select: { ratingSum: true, ratingCount: true },
      });
      await tx.driver.update({ where: { id: driverId }, data: { rating: averageRating({ sum: d.ratingSum, count: d.ratingCount }) } });
      return tx.trip.findUniqueOrThrow({ where: { id: tripId } });
    });
  }

  private async driverTrip(driverId: string, tripId: string): Promise<Trip> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip || trip.driverId !== driverId) throw new NotFoundException('Trip not found');
    return trip;
  }

  /**
   * Moves the driver's trip to [to]. The update is guarded on the status it was checked in (like [accept]), so it
   * can't overwrite a change made at the same moment (e.g. the passenger cancelling). A retry of a step that
   * already went through returns the trip as it is. [after] runs in the same transaction, only if the move applied.
   */
  private async move(params: {
    driverId: string;
    tripId: string;
    to: TripStatus;
    data?: Prisma.TripUpdateManyMutationInput;
    after?: (tx: Prisma.TransactionClient) => Promise<unknown>;
  }): Promise<Trip> {
    const trip = await this.driverTrip(params.driverId, params.tripId);
    if (trip.status === params.to) return this.current(trip.id);
    if (!canTransition({ kind: trip.kind, from: trip.status, to: params.to })) {
      throw new BadRequestException(`Cannot go from ${trip.status} to ${params.to}`);
    }
    const applied = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.trip.updateMany({
        where: { id: trip.id, driverId: params.driverId, status: trip.status },
        data: { ...params.data, status: params.to },
      });
      if (count === 0) return false;
      await params.after?.(tx);
      return true;
    });
    if (!applied) {
      const now = await this.driverTrip(params.driverId, params.tripId);
      if (now.status === params.to) return this.current(trip.id);
      throw new ConflictException(now.status === TripStatus.CANCELLED ? 'This trip was cancelled' : 'This trip has changed. Please refresh');
    }
    return hideOtp(await this.publish(trip.id, 'DRIVER'));
  }

  /** The trip as it is now, for the driver (no OTP, nothing emitted). */
  private async current(tripId: string): Promise<Trip> {
    return hideOtp(await this.prisma.trip.findUniqueOrThrow({ where: { id: tripId }, include: TRIP_INCLUDE }));
  }

  /**
   * Emits the fresh trip to both sides (socket + push) and returns it. [by] caused the change. [formerDriverId]: the
   * driver the trip was just taken off (they still hear about it).
   */
  private async publish(tripId: string, by: 'PASSENGER' | 'DRIVER' | 'SYSTEM', formerDriverId?: string): Promise<Trip> {
    const trip = await this.prisma.trip.findUniqueOrThrow({ where: { id: tripId }, include: TRIP_INCLUDE });
    // Also the driver's own room: a cancel must reach the driver even if their trip-room join was lost.
    this.events.toTrip(tripId, 'trip.updated', { ...trip, otp: '' }, trip.driverId ?? formerDriverId);
    this.events.toUser(trip.passengerId, 'trip.updated', trip);
    this.notifier.tripChanged(trip as TripWithPeople, by);
    return trip;
  }
}
