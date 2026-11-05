import { BadRequestException } from '@nestjs/common';

import { RideMode } from '../../generated/prisma/enums.js';
import { MAX_DAYS_AHEAD } from '../fares/ride-modes.js';

const DAY_MS = 86_400_000;
/** A pickup time this close counts as "now" (the trip searches at once). */
const NOW_SLACK_MS = 60_000;
/** A house shift needs a mover with helpers: its slot starts at least this far ahead. */
export const SHIFTING_LEAD_MS = 60 * 60_000;

/**
 * The booking's pickup time ([scheduledAt]: null = now) and an outstation round trip's return, checked: booking for
 * later is for rentals and outstation trips, up to [MAX_DAYS_AHEAD] days ahead; a round trip comes back after it
 * leaves and within [MAX_DAYS_AHEAD] days, or straight back when it has no return time. A house shift ([opts.shifting]) is always for a slot, at least an hour
 * ahead. Throws 400 with what to fix.
 */
export function bookingTimes(
  dto: { scheduledAt?: string; returnAt?: string; roundTrip?: boolean },
  mode: RideMode,
  now: Date,
  opts: { shifting?: boolean } = {},
): { scheduledAt: Date | null; returnAt: Date | null } {
  if (opts.shifting) {
    if (!dto.scheduledAt) throw new BadRequestException('Choose a day and time slot for the move');
    const at = new Date(dto.scheduledAt);
    if (at.getTime() < now.getTime() + SHIFTING_LEAD_MS - NOW_SLACK_MS) throw new BadRequestException('Choose a slot at least an hour from now');
    if (at.getTime() > now.getTime() + MAX_DAYS_AHEAD * DAY_MS) throw new BadRequestException(`You can book up to ${MAX_DAYS_AHEAD} days ahead`);
    return { scheduledAt: at, returnAt: null };
  }
  let scheduledAt: Date | null = null;
  if (dto.scheduledAt) {
    if (mode === RideMode.LOCAL) throw new BadRequestException('Booking for later is for rentals and outstation trips');
    const at = new Date(dto.scheduledAt);
    if (at.getTime() < now.getTime() - NOW_SLACK_MS) throw new BadRequestException('Choose a pickup time in the future');
    if (at.getTime() > now.getTime() + MAX_DAYS_AHEAD * DAY_MS) throw new BadRequestException(`You can book up to ${MAX_DAYS_AHEAD} days ahead`);
    scheduledAt = at.getTime() <= now.getTime() + NOW_SLACK_MS ? null : at;
  }
  let returnAt: Date | null = null;
  // No return time: straight back (the fare sets it to leaving + the drive both ways).
  if (mode === RideMode.OUTSTATION && dto.roundTrip && dto.returnAt) {
    returnAt = new Date(dto.returnAt);
    const leave = scheduledAt ?? now;
    if (returnAt.getTime() <= leave.getTime()) throw new BadRequestException('Come back after you leave');
    if (returnAt.getTime() > leave.getTime() + MAX_DAYS_AHEAD * DAY_MS) throw new BadRequestException(`A round trip can be up to ${MAX_DAYS_AHEAD} days`);
  }
  return { scheduledAt, returnAt };
}
