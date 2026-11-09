import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Announcement, Trip } from '../../generated/prisma/client.js';
import { AnnouncementAudience, AppKind, RideMode, Role, TripKind, TripStatus, WelcomeTrigger } from '../../generated/prisma/enums.js';
import { SettingsService } from '../settings/settings.service.js';
import { CANCEL_CODE_LABEL } from '../trips/cancel-codes.js';
import { extraOf } from '../trips/extra-fare.js';
import { WelcomeService } from '../whatsapp/welcome.service.js';
import { PUSH_TOPICS, PushService } from './push.service.js';

type Party = { name: string | null; phone?: string | null };
/** A trip with its people, as `TripsService` loads it. */
export type TripWithPeople = Trip & {
  driver?: ({ userId: string; plate: string; vehicleModel: string; user: Party } & object) | null;
  passenger?: ({ id: string } & Party) | null;
};

const DOC_LABEL: Record<string, string> = {
  DRIVING_LICENCE: 'Driving licence',
  AADHAAR: 'Aadhaar',
  VEHICLE_RC: 'Vehicle RC',
  INSURANCE: 'Vehicle insurance',
  POLICE_VERIFICATION: 'Police verification',
};

/** The passenger's note, else the label of their cancel code (nothing for OTHER without a note). */
function cancelWhy(trip: Trip): string | null {
  if (trip.cancelReason) return trip.cancelReason;
  return trip.cancelCode && trip.cancelCode !== 'OTHER' ? CANCEL_CODE_LABEL[trip.cancelCode] : null;
}

function first(name: string | null | undefined, fallback: string): string {
  return (name ?? '').trim().split(/\s+/)[0] || fallback;
}

/**
 * What each event says, and to whom. Passenger app: trip progress, no drivers, chat. Driver app: ride requests
 * (urgent), cancellations, chat, KYC decisions. Both: admin announcements on topics.
 *
 * Fire-and-forget: callers use `void this.notifier.x(...)`, so no method ever throws or rejects. A failed lookup or
 * push is logged and dropped (a missed notification must never fail the request or crash the process).
 */
@Injectable()
export class NotifierService {
  private readonly logger = new Logger(NotifierService.name);

  constructor(
    private readonly push: PushService,
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly welcome: WelcomeService,
  ) {}

  /** Runs [send], logging instead of throwing. */
  private safe(event: string, send: () => void): void {
    try {
      send();
    } catch (e) {
      this.fail(event, e);
    }
  }

  /** Async [safe]: the returned promise always resolves. */
  private async safeAsync(event: string, send: () => Promise<void>): Promise<void> {
    try {
      await send();
    } catch (e) {
      this.fail(event, e);
    }
  }

  private fail(event: string, e: unknown): void {
    this.logger.warn(`Notification "${event}" not sent: ${e instanceof Error ? e.message : String(e)}`);
  }

  /** After a status change. [by] = who caused it (a cancellation is only pushed to the other side). */
  tripChanged(trip: TripWithPeople, by: 'PASSENGER' | 'DRIVER' | 'SYSTEM'): void {
    this.safe(`trip ${trip.status}`, () => this.sendTripChanged(trip, by));
  }

  private sendTripChanged(trip: TripWithPeople, by: 'PASSENGER' | 'DRIVER' | 'SYSTEM'): void {
    const isParcel = trip.kind === TripKind.PARCEL;
    const driver = first(trip.driver?.user.name, 'Your driver');
    const data = { type: 'trip', tripId: trip.id, status: trip.status, kind: trip.kind };
    const toPassenger = (title: string, body: string): void =>
      this.push.toUser(trip.passengerId, AppKind.PASSENGER, { title, body, channel: 'trip_updates', data });

    switch (trip.status) {
      case TripStatus.SEARCHING:
        // Back to searching after a driver dropped it (reassign).
        if (trip.reassignCount === 0) return;
        return toPassenger(
          'Finding you another driver',
          by === 'SYSTEM' ? "Your driver wasn't on the way, so we're finding you another one at the same fare" : "Your driver cancelled. We're finding you another one at the same fare",
        );
      case TripStatus.DRIVER_ASSIGNED:
        return toPassenger(
          isParcel ? 'Delivery partner assigned' : 'Driver on the way',
          `${driver} · ${trip.driver?.plate ?? ''} is coming to ${trip.pickupName}. ${isParcel ? 'Delivery' : 'Ride'} OTP ${trip.otp}`,
        );
      case TripStatus.DRIVER_ARRIVED:
        return toPassenger(`${driver} has arrived`, isParcel ? `At ${trip.pickupName} to collect the parcel` : `At ${trip.pickupName}. Share OTP ${trip.otp} to start`);
      case TripStatus.IN_PROGRESS:
        return toPassenger('Ride started', `On the way to ${trip.dropName}`);
      case TripStatus.PICKED_UP:
        return toPassenger('Parcel picked up', `On the way to ${trip.dropName}. The receiver needs OTP ${trip.otp}`);
      case TripStatus.COMPLETED:
        return toPassenger("You've arrived", `Pay ₹${trip.fareTotal} to ${driver}. Tap to rate your ride`);
      case TripStatus.DELIVERED:
        return toPassenger('Parcel delivered', `Delivered at ${trip.dropName}`);
      case TripStatus.NO_DRIVERS:
        return toPassenger('No drivers nearby', 'Please try again in a minute or pick another vehicle');
      case TripStatus.CANCELLED:
        if (by === 'DRIVER') return toPassenger(`${isParcel ? 'Delivery' : 'Ride'} cancelled`, `${driver} cancelled. Please book again`);
        if (by === 'SYSTEM') {
          return toPassenger(
            `${isParcel ? 'Delivery' : 'Ride'} cancelled`,
            trip.cancelCode === 'NO_DRIVERS' ? "Your driver couldn't make it and no other driver is free. Please book again" : "It didn't start in time. Please book again",
          );
        }
        if (by === 'PASSENGER' && trip.driver) {
          this.push.toUser(trip.driver.userId, AppKind.DRIVER, {
            title: `${isParcel ? 'Delivery' : 'Ride'} cancelled`,
            body: `${first(trip.passenger?.name, 'The customer')} cancelled${cancelWhy(trip) ? `: ${cancelWhy(trip)}` : ''}`,
            channel: 'trip_updates',
            data,
          });
        }
        return;
      default:
        return;
    }
  }

  /** New request for a driver: urgent (wakes the phone), dropped by FCM once the offer has expired. */
  offer(params: { driverId: string; trip: Trip; pickupEtaMin: number | null; expiresInSeconds: number }): Promise<void> {
    return this.safeAsync('offer', async () => {
      const driver = await this.prisma.driver.findUnique({ where: { id: params.driverId }, select: { userId: true } });
      if (!driver) return;
      const t = params.trip;
      const eta = params.pickupEtaMin ? ` · ${params.pickupEtaMin} min away` : '';
      // The rider's extra shows as "₹50 + ₹20", like the request card.
      const extra = extraOf(t.fare);
      const fare = extra > 0 ? `₹${t.fareTotal - extra} + ₹${extra}` : `₹${t.fareTotal}`;
      const what =
        t.kind === TripKind.PARCEL
          ? t.shifting
            ? 'Packers & Movers'
            : t.rideMode === RideMode.OUTSTATION
              ? 'outstation delivery'
              : 'delivery'
          : t.rideMode === RideMode.RENTAL
            ? 'rental'
            : t.rideMode === RideMode.OUTSTATION
              ? 'outstation'
              : 'ride';
      // A trip booked ahead says when: "· Tue 6:00 am".
      const when = t.scheduledAt ? ` · ${formatIstShort(t.scheduledAt)}` : '';
      this.push.toUser(driver.userId, AppKind.DRIVER, {
        title: `New ${what} request · ${fare}${when}`,
        body: `${t.pickupName} → ${t.dropName}${eta}`,
        channel: 'ride_requests',
        data: { type: 'offer', tripId: t.id },
        isUrgent: true,
        ttlSeconds: params.expiresInSeconds,
      });
    });
  }

  /**
   * A trip reminder from a timeout job (driver not moving, no-show wait over, trip running too long, trip taken off
   * the driver) to the driver's or the passenger's app. [kind] goes in the data (`type: 'nudge'`).
   */
  tripNudge(params: { to: 'DRIVER' | 'PASSENGER'; tripId: string; driverId?: string; passengerId?: string; kind: string; title: string; body: string }): Promise<void> {
    return this.safeAsync(`nudge ${params.kind}`, async () => {
      const data = { type: 'nudge', tripId: params.tripId, kind: params.kind };
      if (params.to === 'PASSENGER') {
        if (params.passengerId) this.push.toUser(params.passengerId, AppKind.PASSENGER, { title: params.title, body: params.body, channel: 'trip_updates', data });
        return;
      }
      if (!params.driverId) return;
      const driver = await this.prisma.driver.findUnique({ where: { id: params.driverId }, select: { userId: true } });
      if (driver) this.push.toUser(driver.userId, AppKind.DRIVER, { title: params.title, body: params.body, channel: 'trip_updates', data });
    });
  }

  /** Chat message to the other side of the trip. */
  chat(params: { tripId: string; from: 'PASSENGER' | 'DRIVER'; text: string }): Promise<void> {
    return this.safeAsync('chat', async () => {
      const trip = await this.prisma.trip.findUnique({
        where: { id: params.tripId },
        include: { driver: { select: { userId: true, user: { select: { name: true } } } }, passenger: { select: { name: true } } },
      });
      if (!trip) return;
      const data = { type: 'chat', tripId: trip.id };
      const body = params.text.length > 140 ? `${params.text.slice(0, 137)}…` : params.text;
      if (params.from === 'PASSENGER' && trip.driver) {
        this.push.toUser(trip.driver.userId, AppKind.DRIVER, { title: first(trip.passenger.name, 'Customer'), body, channel: 'chat', data });
      } else if (params.from === 'DRIVER') {
        this.push.toUser(trip.passengerId, AppKind.PASSENGER, { title: first(trip.driver?.user.name, 'Your driver'), body, channel: 'chat', data });
      }
    });
  }

  /** Account notices to a driver: cancellation-rate nudge, pause, pause over ([kind] in the data). */
  driverAccount(params: { driverId: string; kind: string; title: string; body: string }): Promise<void> {
    return this.safeAsync(`driver ${params.kind}`, async () => {
      const driver = await this.prisma.driver.findUnique({ where: { id: params.driverId }, select: { userId: true } });
      if (!driver) return;
      this.push.toUser(driver.userId, AppKind.DRIVER, { title: params.title, body: params.body, channel: 'account', data: { type: 'account', kind: params.kind } });
    });
  }

  /** An admin changed the driver's status by hand (approve, reactivate, hold, reject). PENDING is not pushed. */
  driverStatus(params: { driverId: string; from: string; to: string; reason?: string | null }): Promise<void> {
    if (params.to === 'APPROVED' && params.from !== 'ON_HOLD') return this.kycReviewed({ driverId: params.driverId, status: 'APPROVED' });
    const why = params.reason?.trim();
    const msg =
      params.to === 'APPROVED'
        ? { title: 'Your account is active again', body: 'Go online to take rides' }
        : params.to === 'ON_HOLD'
          ? { title: 'Your account is on hold', body: why ? `${why}. Contact support if you have questions` : 'Contact support to know more' }
          : params.to === 'REJECTED'
            ? { title: "Your application wasn't approved", body: why ? `${why}. Open the app to see what to fix` : 'Open the app to see what to fix' }
            : null;
    if (!msg) return Promise.resolve();
    return this.driverAccount({ driverId: params.driverId, kind: `status_${params.to.toLowerCase()}`, ...msg });
  }

  /** A profile photo went to admin review: tell the driver it is being checked. */
  photoSubmitted(driverId: string): Promise<void> {
    return this.safeAsync('photo submitted', async () => {
      const driver = await this.prisma.driver.findUnique({ where: { id: driverId }, select: { userId: true } });
      if (!driver) return;
      this.push.toUser(driver.userId, AppKind.DRIVER, {
        title: 'Photo received',
        body: "We're checking your profile photo. You can go online once it's approved",
        channel: 'account',
        data: { type: 'photo', status: 'IN_REVIEW' },
      });
    });
  }

  photoReviewed(params: { driverId: string; isApproved: boolean; reason: string }): Promise<void> {
    return this.safeAsync('photo reviewed', async () => {
      const driver = await this.prisma.driver.findUnique({ where: { id: params.driverId }, select: { userId: true } });
      if (!driver) return;
      this.push.toUser(driver.userId, AppKind.DRIVER, {
        title: params.isApproved ? 'Profile photo approved' : 'Please retake your photo',
        body: params.isApproved ? 'Riders will see it on their trip. You can go online now' : `${params.reason}. Tap to retake`,
        channel: 'account',
        data: { type: 'photo', status: params.isApproved ? 'APPROVED' : 'REJECTED' },
      });
    });
  }

  /** An admin verified or rejected a KYC document, or approved the whole application (also its WhatsApp welcome). */
  kycReviewed(params: { driverId: string; type?: string; status: 'VERIFIED' | 'REJECTED' | 'APPROVED'; reason?: string | null }): Promise<void> {
    return this.safeAsync('kyc reviewed', async () => {
      const driver = await this.prisma.driver.findUnique({ where: { id: params.driverId }, select: { userId: true } });
      if (!driver) return;
      const data = { type: 'kyc', status: params.status };
      if (params.status === 'APPROVED') {
        // Paid plans are off (free app): no "Choose a plan" unless they are switched back on.
        const plans = await this.settings.get('driverPlansEnabled').catch(() => false);
        const body = plans ? 'Choose a plan and go online to start earning' : 'Go online to start earning';
        this.push.toUser(driver.userId, AppKind.DRIVER, { title: "You're approved! 🎉", body, channel: 'account', data });
        this.welcome.send(driver.userId, WelcomeTrigger.DRIVER_APPROVED);
      } else if (params.status === 'REJECTED') {
        const doc = DOC_LABEL[params.type ?? ''] ?? 'A document';
        this.push.toUser(driver.userId, AppKind.DRIVER, {
          title: `${doc} needs attention`,
          body: `${params.reason ?? 'Please upload a clearer photo'}. Tap to re-upload`,
          channel: 'account',
          data,
        });
      }
    });
  }

  /**
   * SOS (or "Get help" / "not reached safely") → every admin's phone (the Tamil Taxi apps an admin number is signed in to;
   * the admin web panel has no push and polls its SOS page). Urgent, on the `safety` channel.
   */
  sosAlert(params: { sosId: string; tripId: string; who: 'PASSENGER' | 'DRIVER'; name: string | null; source: string; lat: number | null; lng: number | null }): Promise<void> {
    return this.safeAsync('sos alert', async () => {
      const admins = await this.prisma.user.findMany({ where: { role: Role.ADMIN, isBlocked: false }, select: { id: true } });
      const where = params.lat !== null && params.lng !== null ? ` at ${params.lat.toFixed(5)}, ${params.lng.toFixed(5)}` : '';
      const what = params.source === 'ARRIVAL' ? 'says they did not reach safely' : params.source === 'CHECK' ? 'asked for help' : 'pressed SOS';
      const msg = {
        title: `🚨 SOS: ${params.who === 'DRIVER' ? 'driver' : 'passenger'} ${first(params.name, '')}`.trim(),
        body: `${params.who === 'DRIVER' ? 'The driver' : 'The passenger'} ${what}${where}. Open the admin SOS page`,
        channel: 'safety' as const,
        data: { type: 'sos', sosId: params.sosId, tripId: params.tripId },
        isUrgent: true,
      };
      for (const a of admins) {
        this.push.toUser(a.id, AppKind.PASSENGER, msg);
        this.push.toUser(a.id, AppKind.DRIVER, msg);
      }
    });
  }

  /**
   * A ride safety check to the passenger ("Is everything OK?" after a long stop or a route change at night, "Did
   * you reach safely?" after a night ride). Tapping it opens the I'm OK / Get help sheet (`type: 'safety'`).
   */
  safetyCheck(params: { passengerId: string; tripId: string; kind: string; eventId: string; title: string; message: string }): void {
    this.safe(`safety ${params.kind}`, () =>
      this.push.toUser(params.passengerId, AppKind.PASSENGER, {
        title: params.title,
        body: params.message,
        channel: 'safety',
        data: { type: 'safety', kind: params.kind, tripId: params.tripId, eventId: params.eventId },
        isUrgent: true,
      }),
    );
  }

  /** Admin announcement → the matching topic. */
  announcement(a: Announcement): void {
    this.safe('announcement', () => this.sendAnnouncement(a));
  }

  private sendAnnouncement(a: Announcement): void {
    if (!a.isActive || a.startsAt > new Date()) return;
    const topic = a.audience === AnnouncementAudience.PASSENGER ? PUSH_TOPICS.PASSENGER : a.audience === AnnouncementAudience.DRIVER ? PUSH_TOPICS.DRIVER : PUSH_TOPICS.ALL;
    this.push.toTopic(topic, { title: a.title, body: a.body, channel: 'announcements', data: { type: 'announcement', id: a.id } });
  }
}

/** "Tue 6:00 am" in IST, for a scheduled pickup in a push. */
export function formatIstShort(at: Date): string {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
    .format(at)
    .replace(/\s?(AM|PM)$/i, (m) => ` ${m.trim().toLowerCase()}`)
    .replace(',', '');
}
