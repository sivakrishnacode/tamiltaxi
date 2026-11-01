import type { VehicleKind } from '../../generated/prisma/enums.js';

/** A zone's time window and date range (Zone columns). */
export interface ZoneSchedule {
  /** Days of the week, 0 = Sunday (IST); empty = every day. */
  readonly days: readonly number[];
  /** Minutes of the day (IST), [start, end); both null = all day; start after end runs past midnight. */
  readonly startMinute: number | null;
  readonly endMinute: number | null;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
}

const IST_OFFSET_MS = 330 * 60_000;

/**
 * Whether a zone counts at [now]: inside its date range, on one of its days and within its hours. A window past
 * midnight (22:00–02:00) belongs to the day it starts on, so Friday 22:00–02:00 also covers Saturday 01:00.
 */
export function isZoneLive(z: ZoneSchedule, now: Date = new Date()): boolean {
  if (z.startsAt && now < z.startsAt) return false;
  if (z.endsAt && now >= z.endsAt) return false;
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const day = ist.getUTCDay();
  const minute = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const onDay = (d: number) => z.days.length === 0 || z.days.includes(d);
  if (z.startMinute == null || z.endMinute == null || z.startMinute === z.endMinute) return onDay(day);
  if (z.startMinute < z.endMinute) return onDay(day) && minute >= z.startMinute && minute < z.endMinute;
  if (minute >= z.startMinute) return onDay(day);
  return minute < z.endMinute && onDay((day + 6) % 7);
}

/** Whether a SURGE zone applies to [vehicleKind] (no vehicles listed = all). */
export function surgeAppliesTo(z: { vehicleKinds: readonly VehicleKind[] }, vehicleKind: VehicleKind): boolean {
  return z.vehicleKinds.length === 0 || z.vehicleKinds.includes(vehicleKind);
}
