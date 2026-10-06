import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Env } from '../../core/config/env.js';
import { ENV } from '../../core/config/env.token.js';
import { FileStorageService, type UploadedBlob } from '../../core/storage/file-storage.service.js';
import { DriverEarningsService } from './driver-earnings.service.js';
import type { UpdateDriverDto } from './dto/update-driver.dto.js';
import type { BookingPrefsDto, ServiceDto } from './dto/booking-prefs.dto.js';
import {
  type Area,
  type BookingPrefs,
  DEFAULT_HELPERS,
  type GoTo,
  GO_TO_HOURS,
  readPrefs,
  type ServiceKey,
  servicesFor,
  type StayIn,
  STAY_IN_HOURS,
} from './booking-prefs.js';
import { PARCEL_TWO_WHEELERS } from './vehicle-match.js';
import { isGoodsTruck } from '../fares/goods-modes.js';

import { DriverStateCache } from '../../core/driver-state/driver-state.cache.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { RedisService } from '../../core/redis/redis.service.js';
import type { Driver, KycDocument, Prisma } from '../../generated/prisma/client.js';
import { DriverStatus, Gender, IdentityStatus, KycDocType, KycStatus, PlanPeriod, Role, SubscriptionStatus, TripStatus, type VehicleKind } from '../../generated/prisma/enums.js';
import { AuthService } from '../auth/auth.service.js';
import { TRIAL_DAYS } from '../subscriptions/plan-prices.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { nearbyVehicles, type NearbyVehicle } from './nearby-vehicles.js';
import { DriverLocationService } from './driver-location.service.js';
import type { RegisterDriverDto } from './dto/register-driver.dto.js';
import { NotifierService } from '../notifications/notifier.service.js';
import { DriverApprovalService } from '../kyc/driver-approval.service.js';
import { DiditClient } from '../kyc/didit.client.js';
import { REQUIRED_DOCS } from '../kyc/driver-approval.js';
import { isSelfieCheckRequired, SELFIE_TRIES_PER_DAY, selfieTriesKey } from '../kyc/selfie-check.js';
import { SettingsService } from '../settings/settings.service.js';

const PLATE_TAKEN = 'This number plate is already registered';
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** GET /drivers/me: the driver with their account, and whether today's selfie check is still to do. */
export type DriverProfile = Driver & { selfieCheckRequired: boolean };
/** A driver on one of these is on a trip. */
const ON_TRIP: TripStatus[] = [TripStatus.DRIVER_ASSIGNED, TripStatus.DRIVER_ARRIVED, TripStatus.IN_PROGRESS, TripStatus.PICKED_UP];

/** "TN 37 AB 4521" and "tn37ab4521" are the same plate. */
export function samePlate(a: string, b: string): boolean {
  return a.toUpperCase().replace(/\s+/g, '') === b.toUpperCase().replace(/\s+/g, '');
}
export const ADMIN_CANT_REGISTER = "An admin account can't register as a driver. Use another number";

/** Driver registration, KYC and online status. */
@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly subs: SubscriptionsService,
    private readonly location: DriverLocationService,
    private readonly earnings: DriverEarningsService,
    private readonly files: FileStorageService,
    private readonly notifier: NotifierService,
    private readonly approval: DriverApprovalService,
    private readonly didit: DiditClient,
    private readonly state: DriverStateCache,
    private readonly settings: SettingsService,
    private readonly redis: RedisService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Free vehicles around [at] for the rider's map (nearby-vehicles.ts); marker ids keyed with the JWT secret. */
  async nearbyVehicles(at: { lat: number; lng: number }, kinds: readonly VehicleKind[]): Promise<{ vehicles: NearbyVehicle[] }> {
    return { vehicles: await nearbyVehicles(this.location, at, kinds, { key: this.env.jwtSecret }) };
  }

  /**
   * Creates the driver, the RC + insurance rows and a 30-day free trial in one transaction; returns a token with the
   * DRIVER role. Idempotent: a user who already has a driver (an app retrying after a lost answer) gets that driver
   * and a fresh token, [isNew] false (200 instead of 201). Admin accounts can't register (it would demote them);
   * a plate another driver has → 409.
   */
  async register(userId: string, dto: RegisterDriverDto): Promise<{ driver: Driver; accessToken: string; isNew: boolean }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true, driver: true } });
    if (user.role === Role.ADMIN) throw new ForbiddenException(ADMIN_CANT_REGISTER);
    if (user.driver) return this.registered(userId, user.driver, user.role);
    const { name, gender, ...vehicle } = dto;
    const plate = vehicle.plate.toUpperCase();
    if (await this.prisma.driver.count({ where: { plate } })) throw new ConflictException(PLATE_TAKEN);
    let driver: Driver;
    try {
      driver = await this.prisma.$transaction(async (tx) => {
        // The trial's plan first: a missing plan fails the whole registration, never leaves a driver without one.
        const plan = await tx.plan.findUniqueOrThrow({ where: { vehicleKind_period: { vehicleKind: vehicle.vehicleKind, period: PlanPeriod.MONTHLY } } });
        await tx.user.update({ where: { id: userId }, data: { name, gender, role: Role.DRIVER } });
        return tx.driver.create({
          data: {
            ...vehicle,
            plate,
            userId,
            documents: { create: REQUIRED_DOCS.map((type) => ({ type })) },
            subscriptions: { create: { planId: plan.id, status: SubscriptionStatus.TRIAL, endsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000) } },
          },
        });
      });
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
      // Two registrations at once: the other one created this user's driver. Otherwise the plate was just taken.
      const existing = await this.prisma.driver.findUnique({ where: { userId } });
      if (existing) return this.registered(userId, existing, Role.DRIVER);
      throw new ConflictException(PLATE_TAKEN);
    }
    return { driver, accessToken: await this.auth.issueToken({ sub: userId, role: Role.DRIVER, driverId: driver.id }), isNew: true };
  }

  /** The answer to a repeated registration: the driver as stored, with a fresh token. */
  private async registered(userId: string, driver: Driver, role: Role): Promise<{ driver: Driver; accessToken: string; isNew: false }> {
    return { driver, accessToken: await this.auth.issueToken({ sub: userId, role, driverId: driver.id }), isNew: false };
  }

  /** With `selfieCheckRequired` (today's selfie check is due, see [selfieCheck]) and `selfieCheckedAt`. */
  async me(driverId: string): Promise<DriverProfile> {
    const driver = await this.prisma.driver.findUniqueOrThrow({ where: { id: driverId }, include: { user: true } });
    return { ...driver, selfieCheckRequired: await this.isSelfieCheckDue(driver) };
  }

  private async isSelfieCheckDue(driver: Pick<Driver, 'selfieFile' | 'selfieCheckedAt'>): Promise<boolean> {
    return isSelfieCheckRequired({
      isEnabled: await this.settings.get('dailySelfieCheckEnabled'),
      isDiditEnabled: this.didit.isEnabled,
      hasReferenceFace: !!driver.selfieFile,
      checkedAt: driver.selfieCheckedAt,
      now: new Date(),
    });
  }

  /**
   * The daily selfie check (setting `dailySelfieCheckEnabled`): a live selfie matched (Didit 1:1 face match) to the
   * reference face kept from the approved identity check, the same match as the profile photo. Passed → today's
   * check is done. No face, several faces or another person → 422 (retake); no reference face yet → 409; more than
   * [SELFIE_TRIES_PER_DAY] tries in an IST day → 429. Without Didit (dev) there is nothing to match against: it passes.
   */
  async selfieCheck(params: { driverId: string; file?: UploadedBlob }): Promise<{ passed: true; checkedAt: string }> {
    if (!params.file?.buffer?.length || !IMAGE_TYPES.includes(params.file.mimetype)) throw new BadRequestException('Take a selfie (JPG, PNG or WebP)');
    const driver = await this.prisma.driver.findUniqueOrThrow({ where: { id: params.driverId }, select: { id: true, userId: true, selfieFile: true } });
    const passed = async (): Promise<{ passed: true; checkedAt: string }> => {
      const { selfieCheckedAt } = await this.prisma.driver.update({ where: { id: driver.id }, data: { selfieCheckedAt: new Date() }, select: { selfieCheckedAt: true } });
      return { passed: true, checkedAt: selfieCheckedAt!.toISOString() };
    };
    if (!this.didit.isEnabled) return passed();
    if (!driver.selfieFile) throw new ConflictException('Finish your identity check first: your selfie is matched to it');
    const triesKey = selfieTriesKey(driver.id, new Date());
    const tries = await this.redis.incr(triesKey);
    if (tries === 1) await this.redis.expire(triesKey, 26 * 3600);
    if (tries > SELFIE_TRIES_PER_DAY) {
      throw new HttpException({ message: 'Too many selfie tries today. Contact support', code: 'SELFIE_TOO_MANY_TRIES' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    let match: { score: number | null; faces: number; isMatch: boolean };
    try {
      match = await this.didit.faceMatch({
        photo: { buffer: params.file.buffer, type: params.file.mimetype },
        reference: await this.files.read(driver.selfieFile),
        vendorData: driver.userId,
      });
    } catch (e) {
      // Didit unreachable: not the driver's fault, the try isn't counted (503 from faceMatch).
      await this.redis.decr(triesKey);
      throw e;
    }
    if (match.faces !== 1) {
      throw new UnprocessableEntityException({
        message: match.faces === 0 ? "We couldn't find your face. Retake it facing the camera in good light" : 'Only you should be in the selfie. Retake it alone',
        code: match.faces === 0 ? 'SELFIE_NO_FACE' : 'SELFIE_MANY_FACES',
      });
    }
    if (!match.isMatch) {
      throw new UnprocessableEntityException({ message: "This doesn't look like the verified driver. Retake it facing the camera", code: 'SELFIE_NO_MATCH' });
    }
    return passed();
  }

  /** The documents still uploaded by hand (RC, insurance). Older rows (licence, Aadhaar, police) are hidden. */
  documents(driverId: string): Promise<KycDocument[]> {
    return this.prisma.kycDocument.findMany({ where: { driverId, type: { in: [...REQUIRED_DOCS] } }, orderBy: { type: 'asc' } });
  }

  /**
   * Profile edits (D-25). Name and gender live on the user; the rest on the driver. Name, model, colour and UPI change
   * freely; gender only while PENDING. A new plate is a new vehicle: an uploaded RC goes back to "upload" with the
   * reason, and an APPROVED / ON_HOLD driver goes back to PENDING and offline (out of dispatch), all in one
   * transaction with a row in their admin history. Not while they are on a trip (409).
   */
  async update(driverId: string, dto: UpdateDriverDto): Promise<DriverProfile> {
    const { name, gender, ...vehicle } = dto;
    const current = await this.prisma.driver.findUniqueOrThrow({
      where: { id: driverId },
      select: {
        status: true,
        plate: true,
        userId: true,
        user: { select: { gender: true } },
        documents: { where: { type: KycDocType.VEHICLE_RC }, select: { status: true } },
      },
    });
    if (gender) {
      // Gender decides who gets Butterfly (women-only) rides: set at sign-up, then changed only by support.
      // None stored reads as "prefer not to say" in the app, which sends that back on every profile save.
      const stored = current.user.gender ?? Gender.PREFER_NOT_TO_SAY;
      if (stored !== gender && current.status !== DriverStatus.PENDING) {
        throw new ForbiddenException('Contact support to change your gender');
      }
    }
    // The same plate typed with other spacing is not a change.
    const plate = vehicle.plate && !samePlate(vehicle.plate, current.plate) ? vehicle.plate.toUpperCase() : undefined;
    const leavesApproval = plate !== undefined && (current.status === DriverStatus.APPROVED || current.status === DriverStatus.ON_HOLD);
    const isRcUploaded = current.documents.some((d) => d.status !== KycStatus.NOT_UPLOADED);
    const resetsRc = plate !== undefined && (leavesApproval || isRcUploaded);
    if (leavesApproval && (await this.prisma.trip.count({ where: { driverId, status: { in: ON_TRIP } } }))) {
      throw new ConflictException('Finish your trip before changing the vehicle');
    }
    const user = name || gender ? { user: { update: { name, gender } } } : {};
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.driver.update({
          where: { id: driverId },
          data: { ...vehicle, plate, ...user, ...(leavesApproval ? { status: DriverStatus.PENDING, isOnline: false } : {}) },
        });
        if (!resetsRc) return;
        const rc = { status: KycStatus.NOT_UPLOADED, fileUrl: null, rejectReason: `Upload the RC of your new vehicle (${plate})` };
        await tx.kycDocument.upsert({
          where: { driverId_type: { driverId, type: KycDocType.VEHICLE_RC } },
          create: { driverId, type: KycDocType.VEHICLE_RC, ...rc },
          update: rc,
        });
        await tx.auditLog.create({
          data: {
            actorId: current.userId,
            action: 'PATCH /v1/drivers/me',
            entity: 'drivers',
            entityId: driverId,
            data: { body: { plate }, from: { plate: current.plate, status: current.status }, to: { status: leavesApproval ? DriverStatus.PENDING : current.status } },
          },
        });
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw new ConflictException(PLATE_TAKEN);
      throw e;
    }
    // Out of dispatch now, like going offline (the row is already offline).
    if (leavesApproval) await this.goOffline(driverId);
    await this.state.invalidate(driverId);
    return this.me(driverId);
  }

  async bookingPrefs(driverId: string): Promise<BookingPrefs> {
    const d = await this.prisma.driver.findUniqueOrThrow({ where: { id: driverId }, select: { bookingPrefs: true } });
    return readPrefs(d.bookingPrefs, new Date());
  }

  /**
   * Replaces the preferences. A go-to switches itself off after [GO_TO_HOURS], a stay-in after [STAY_IN_HOURS]; one
   * of the two at a time (turning one on turns off the other one stored).
   */
  async setBookingPrefs(driverId: string, dto: BookingPrefsDto): Promise<BookingPrefs> {
    if (dto.minTripKm && dto.maxTripKm && dto.minTripKm > dto.maxTripKm) {
      throw new BadRequestException('Shortest trip must be less than the longest trip');
    }
    if (dto.goTo && dto.stayIn) throw new BadRequestException('Turn off Go To to use Stay In');
    const { vehicleKind } = await this.prisma.driver.findUniqueOrThrow({ where: { id: driverId }, select: { vehicleKind: true } });
    if (dto.shifting && !isGoodsTruck(vehicleKind)) {
      throw new BadRequestException('Packers & Movers jobs are for three-wheeler, mini truck, pickup and truck drivers');
    }
    const now = new Date();
    const current = await this.bookingPrefs(driverId);
    const until = (hours: number): string => new Date(now.getTime() + hours * 3_600_000).toISOString();
    const place = (a: Area): Area => ({ name: a.name, lat: a.lat, lng: a.lng });
    const same = (a: Area, b: Area): boolean => a.lat === b.lat && a.lng === b.lng;
    // A go-to / stay-in already running stays as it is when the app sends the same place back (its timer goes on).
    let goTo: GoTo | null = null;
    if (dto.goTo) goTo = current.goTo && same(current.goTo, dto.goTo) ? current.goTo : { ...place(dto.goTo), until: until(GO_TO_HOURS) };
    let stayIn: StayIn | null = null;
    if (dto.stayIn) {
      const kept = current.stayIn && same(current.stayIn, dto.stayIn) && current.stayIn.radiusKm === dto.stayIn.radiusKm;
      stayIn = kept ? current.stayIn! : { ...place(dto.stayIn), radiusKm: dto.stayIn.radiusKm, until: until(STAY_IN_HOURS) };
    } else if (dto.stayIn === undefined && !goTo) {
      // Not sent (an older app): the stored one stays, unless this save turns a go-to on.
      stayIn = current.stayIn ?? null;
    }
    const prefs: BookingPrefs = {
      maxPickupKm: dto.maxPickupKm ?? null,
      minTripKm: dto.minTripKm ?? null,
      maxTripKm: dto.maxTripKm ?? null,
      goTo,
      stayIn,
      // Older apps send parcels for bikes only; an auto takes parcels only when switched on in Services.
      parcels: PARCEL_TWO_WHEELERS.includes(vehicleKind) ? (dto.parcels ?? current.parcels) : current.parcels,
      rentals: current.rentals,
      outstation: current.outstation,
      areas: dto.areas === undefined ? (current.areas ?? []) : (dto.areas ?? []).map(place),
      // Not sent (an older app): what is stored stays.
      shifting: dto.shifting ?? current.shifting ?? false,
      helpers: dto.helpers ?? current.helpers ?? DEFAULT_HELPERS,
      pauses: current.pauses,
    };
    await this.prisma.driver.update({ where: { id: driverId }, data: { bookingPrefs: prefs as Prisma.InputJsonValue } });
    return prefs;
  }

  /**
   * Services: switches [service] on (a pause ends), or off for [dto.pauseMinutes] (then it comes back on by itself) or
   * until the driver starts it again. Only the services their vehicle has (servicesFor); the main one can't go off.
   */
  async setService(driverId: string, service: ServiceKey, dto: ServiceDto): Promise<BookingPrefs> {
    const { vehicleKind } = await this.prisma.driver.findUniqueOrThrow({ where: { id: driverId }, select: { vehicleKind: true } });
    if (!servicesFor(vehicleKind).includes(service)) throw new BadRequestException("Your vehicle doesn't have this service");
    const now = new Date();
    const current = await this.bookingPrefs(driverId);
    const pauses = { ...current.pauses };
    delete pauses[service];
    const timed = dto.on ? null : (dto.pauseMinutes ?? null);
    if (!dto.on) {
      pauses[service] = {
        until: timed === null ? null : new Date(now.getTime() + timed * 60_000).toISOString(),
        reason: dto.reason?.trim() || null,
      };
    }
    // A timed pause leaves the service on underneath (it comes back by itself); "until I start it" switches it off.
    const on = dto.on || timed !== null;
    const prefs: BookingPrefs = { ...current, [service]: on, pauses };
    if (service === 'shifting' && dto.on) prefs.helpers = dto.helpers ?? current.helpers ?? DEFAULT_HELPERS;
    await this.prisma.driver.update({ where: { id: driverId }, data: { bookingPrefs: prefs as Prisma.InputJsonValue } });
    return prefs;
  }

  /** Stores the photo / PDF and puts the document under review. `fileUrl` holds the stored file name. */
  async uploadDocument(params: { driverId: string; type: KycDocType; file?: UploadedBlob }): Promise<KycDocument> {
    if (!REQUIRED_DOCS.includes(params.type)) throw new BadRequestException('This document is checked in the identity step');
    const fileUrl = await this.files.save(params.file);
    const data = { status: KycStatus.UNDER_REVIEW, fileUrl, rejectReason: null };
    const doc = await this.prisma.kycDocument.upsert({
      where: { driverId_type: { driverId: params.driverId, type: params.type } },
      create: { driverId: params.driverId, type: params.type, ...data },
      update: data,
    });
    await this.approval.recompute(params.driverId);
    return doc;
  }

  async goOnline(params: { driverId: string; lat: number; lng: number }): Promise<Driver> {
    const driver = await this.prisma.driver.findUniqueOrThrow({ where: { id: params.driverId } });
    if (driver.status !== DriverStatus.APPROVED) throw new ForbiddenException(`Account is ${driver.status.toLowerCase()}`);
    // Paused for too many cancellations (trips/driver-blocks.service.ts).
    if (driver.blockedUntil && driver.blockedUntil.getTime() > Date.now()) {
      const until = driver.blockedUntil.toISOString();
      throw new ForbiddenException({
        code: 'DRIVER_TEMP_BLOCKED',
        message: `You cancelled too many rides, so you can't go online until ${driver.blockedUntil.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true, day: 'numeric', month: 'short' })}`,
        details: { until },
      });
    }
    if (!(await this.subs.canGoOnline(driver.id))) throw new ForbiddenException('Plan expired. Renew to go online again');
    // Riders see the driver's photo (the verified selfie), so it is required once identity checks are on.
    if (this.didit.isEnabled && !driver.photoFile) {
      throw new ForbiddenException({
        message: driver.pendingPhotoFile
          ? "Your profile photo is being checked. You can go online once it's approved"
          : 'Add your profile photo first: Account › Documents',
        code: 'PHOTO_REQUIRED',
      });
    }
    // The daily selfie check, except for a driver on a trip (the app may call this on resume mid-trip, past midnight).
    if ((await this.isSelfieCheckDue(driver)) && !(await this.prisma.trip.count({ where: { driverId: driver.id, status: { in: ON_TRIP } } }))) {
      // Still online from yesterday (the app was closed without going offline): offline until the check is done.
      if (driver.isOnline) await this.goOffline(driver.id);
      throw new ForbiddenException({ code: 'SELFIE_CHECK_REQUIRED', message: 'Take your daily selfie to go online' });
    }
    await this.freeIfStale(driver.id);
    await this.location.update({ driverId: driver.id, kind: driver.vehicleKind, lat: params.lat, lng: params.lng });
    await this.earnings.sessionStarted(driver.id);
    // Only a real offline → online (the app repeats this call on resume): keeps the driver's wait for the idle bonus.
    if (!driver.isOnline) await this.location.markOnline(driver.id);
    const online = await this.prisma.driver.update({ where: { id: driver.id }, data: { isOnline: true }, include: { user: { select: { isBlocked: true } } } });
    await this.state.set(driver.id, { isOnline: true, vehicleKind: online.vehicleKind, isBlocked: online.user.isBlocked });
    return online;
  }

  /**
   * D-07 profile photo (riders see it). With Didit on, it must be the verified person: the photo is matched
   * against the live selfie of the approved identity check. A clear match goes live at once; no face or several
   * faces → 422 (retake); a low score or Didit unreachable → waits for an admin.
   */
  async uploadPhoto(params: { driverId: string; file?: UploadedBlob }): Promise<{ status: 'APPROVED' | 'IN_REVIEW' }> {
    if (!params.file || !IMAGE_TYPES.includes(params.file.mimetype)) {
      throw new BadRequestException('Take a photo (JPG, PNG or WebP)');
    }
    const driver = await this.prisma.driver.findUniqueOrThrow({
      where: { id: params.driverId },
      select: { id: true, userId: true, selfieFile: true, user: { select: { identityStatus: true } } },
    });
    const live = async (photoFile: string, score: number | null): Promise<{ status: 'APPROVED' }> => {
      await this.prisma.driver.update({
        where: { id: driver.id },
        data: { photoFile, photoUpdatedAt: new Date(), pendingPhotoFile: null, photoMatchScore: score, photoRejectReason: null },
      });
      return { status: 'APPROVED' };
    };
    if (!this.didit.isEnabled) return live(await this.files.save(params.file), null);
    if (driver.user.identityStatus !== IdentityStatus.APPROVED) {
      throw new ConflictException('Verify your licence, Aadhaar and selfie first');
    }
    const name = await this.files.save(params.file);
    const review = async (score: number | null): Promise<{ status: 'IN_REVIEW' }> => {
      await this.prisma.driver.update({ where: { id: driver.id }, data: { pendingPhotoFile: name, photoMatchScore: score, photoRejectReason: null } });
      void this.notifier.photoSubmitted(driver.id);
      return { status: 'IN_REVIEW' };
    };
    if (!driver.selfieFile) return review(null);
    let match: { score: number | null; faces: number; isMatch: boolean };
    try {
      match = await this.didit.faceMatch({
        photo: { buffer: params.file.buffer, type: params.file.mimetype },
        reference: await this.files.read(driver.selfieFile),
        vendorData: driver.userId,
      });
    } catch {
      return review(null);
    }
    if (match.faces !== 1) {
      throw new UnprocessableEntityException(
        match.faces === 0 ? "We couldn't find your face. Retake it facing the camera in good light" : 'Only you should be in the photo. Retake it alone',
      );
    }
    return match.isMatch ? live(name, match.score) : review(match.score);
  }

  /** Admin decision on a photo that waits for review (low face-match score). */
  async reviewPhoto(params: { driverId: string; isApproved: boolean; reason?: string }): Promise<Driver> {
    const driver = await this.prisma.driver.findUniqueOrThrow({ where: { id: params.driverId } });
    if (!driver.pendingPhotoFile) throw new BadRequestException('No photo is waiting for review');
    const reason = params.reason?.trim() || 'Please take a clear photo of your face';
    const updated = await this.prisma.driver.update({
      where: { id: driver.id },
      data: params.isApproved
        ? { photoFile: driver.pendingPhotoFile, photoUpdatedAt: new Date(), pendingPhotoFile: null, photoRejectReason: null }
        : { pendingPhotoFile: null, photoRejectReason: reason },
    });
    void this.notifier.photoReviewed({ driverId: driver.id, isApproved: params.isApproved, reason });
    return updated;
  }

  /**
   * The driver's photo, for the driver, admins, and riders who have (or had) a trip with them. Others get 404,
   * so photos can't be browsed by id.
   */
  async photo(params: { driverId: string; viewer: { userId: string; role: Role; driverId?: string } }): Promise<string> {
    const { viewer } = params;
    const driverId = params.driverId === 'me' ? (viewer.driverId ?? '') : params.driverId;
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId }, select: { photoFile: true } });
    if (!driver?.photoFile) throw new NotFoundException('No photo');
    const canSee =
      viewer.role === Role.ADMIN ||
      viewer.driverId === driverId ||
      (await this.prisma.trip.count({ where: { driverId, passengerId: viewer.userId } })) > 0;
    if (!canSee) throw new NotFoundException('No photo');
    return driver.photoFile;
  }

  /** A busy flag left over from a trip that has ended (or isn't theirs) would hide the driver from every search. */
  private async freeIfStale(driverId: string): Promise<void> {
    const tripId = await this.location.activeTrip(driverId);
    if (!tripId) return;
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, select: { driverId: true, status: true } });
    if (trip?.driverId !== driverId || !ON_TRIP.includes(trip.status)) await this.location.releaseBusy(driverId, tripId);
  }

  async goOffline(driverId: string): Promise<Driver> {
    const driver = await this.prisma.driver.update({ where: { id: driverId }, data: { isOnline: false } });
    await this.state.set(driverId, { isOnline: false, vehicleKind: driver.vehicleKind, isBlocked: false });
    await this.location.remove({ driverId, kind: driver.vehicleKind });
    await this.earnings.sessionEnded(driverId);
    return driver;
  }
}
