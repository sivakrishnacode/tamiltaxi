import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { MeterTripDto } from './dto/meter-trip.dto.js';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** A phone sends a trip when it is back online: up to this old. */
const MAX_AGE_MS = 60 * DAY_MS;
/** Phone clocks run a little off. */
const MAX_CLOCK_AHEAD_MS = 60 * MINUTE_MS;
/** Longer than this is a meter left running. */
const MAX_TRIP_MS = DAY_MS;

/**
 * Trips drivers measure with the app's meter (D-42) for passengers picked up off the app. The phone prices them (the
 * same fare engine as the API) and sends each one once it is back online; they count in the driver's earnings.
 */
@Injectable()
export class MeterTripsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Stores a finished meter trip; the same [MeterTripDto.clientId] again returns the stored one. */
  async record(driverId: string, dto: MeterTripDto, now = new Date()): Promise<{ id: string }> {
    const startedAt = new Date(dto.startedAt);
    const endedAt = new Date(dto.endedAt);
    if (endedAt.getTime() < startedAt.getTime()) throw new BadRequestException('A meter trip ends after it starts');
    if (endedAt.getTime() - startedAt.getTime() > MAX_TRIP_MS) throw new BadRequestException('A meter trip is under a day long');
    if (endedAt.getTime() > now.getTime() + MAX_CLOCK_AHEAD_MS) throw new BadRequestException('This meter trip ends in the future');
    if (now.getTime() - endedAt.getTime() > MAX_AGE_MS) throw new BadRequestException('This meter trip is too old to add');
    const key = { driverId_clientId: { driverId, clientId: dto.clientId } };
    try {
      return await this.prisma.meterTrip.upsert({
        where: key,
        update: {},
        create: {
          driverId,
          clientId: dto.clientId,
          vehicleKind: dto.vehicleKind,
          startedAt,
          endedAt,
          distanceKm: Math.round(dto.distanceKm * 10) / 10,
          durationMin: Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / MINUTE_MS)),
          fare: dto.fare,
          night: dto.night ?? 1,
          startLat: dto.startLat,
          startLng: dto.startLng,
          startName: dto.startName?.trim() || null,
        },
        select: { id: true },
      });
    } catch (e) {
      // Two sends at once: the other one stored it.
      if ((e as { code?: string }).code !== 'P2002') throw e;
      return this.prisma.meterTrip.findUniqueOrThrow({ where: key, select: { id: true } });
    }
  }
}
