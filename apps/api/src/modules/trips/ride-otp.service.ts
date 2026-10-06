import { Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'node:crypto';

import { PrismaService } from '../../core/prisma/prisma.service.js';
import { TripKind, TripStatus } from '../../generated/prisma/enums.js';
import { TripEventsService } from '../realtime/trip-events.service.js';
import { TRIP_INCLUDE } from './trip-include.js';

/** A random 4-digit code (1000–9999, so no leading zero to misread). */
export const newTripOtp = (): string => String(randomInt(1000, 10000));

/** Rides that haven't started yet: their OTP can still be used, so a new code must reach them. */
const NOT_STARTED = [TripStatus.SCHEDULED, TripStatus.SEARCHING, TripStatus.DRIVER_ASSIGNED, TripStatus.DRIVER_ARRIVED];

/**
 * Each rider's one ride OTP (Rapido style): every ride they take themselves starts with the same code, so they learn it
 * and needn't open the app at the car. The owner chose speed over a new code per ride (6 Oct 2026,
 * docs/tech-docs/system-design-notes.md); when a code was overheard an admin changes it ([change]).
 * Parcels (the receiver's code) and rides booked for someone else get a one-time code instead, so the rider's own
 * code is never passed on.
 */
@Injectable()
export class RideOtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: TripEventsService,
  ) {}

  /** The rider's code, made the first time it is needed. */
  async forRider(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { rideOtp: true } });
    if (!user) throw new NotFoundException('Account not found');
    if (user.rideOtp) return user.rideOtp;
    // Only if still unset, so two bookings at once can't end up with different codes.
    await this.prisma.user.updateMany({ where: { id: userId, rideOtp: null }, data: { rideOtp: newTripOtp() } });
    return (await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { rideOtp: true } })).rideOtp!;
  }

  /**
   * Gives the rider a new code ([otp], else a random one unlike the old) and moves their own rides that haven't
   * started to it, telling the rider's app (drivers never get the code). Returns the new code.
   */
  async change(userId: string, otp?: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId, deletedAt: null }, select: { rideOtp: true } });
    if (!user) throw new NotFoundException('Account not found');
    let code = otp ?? newTripOtp();
    while (!otp && code === user.rideOtp) code = newTripOtp();
    const open = { passengerId: userId, kind: TripKind.RIDE, riderPhone: null, status: { in: NOT_STARTED } };
    const trips = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { rideOtp: code } });
      await tx.trip.updateMany({ where: open, data: { otp: code } });
      return tx.trip.findMany({ where: open, include: TRIP_INCLUDE });
    });
    for (const trip of trips) this.events.toUser(userId, 'trip.updated', trip);
    return code;
  }
}
