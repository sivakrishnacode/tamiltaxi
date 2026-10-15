import type { VehicleKind } from '../../generated/prisma/enums.js';
import { cellAt } from '../geo/h3.util.js';
import { isNightIst } from '../safety/night-window.js';
import type { Settings } from '../settings/settings.defaults.js';

/** Durable job: "Siva, Ooty?" after a quote (id = the rider; a newer quote replaces the older one). */
export const SEARCH_REMINDER_JOB = 'reminder.search';
/** Repeating job (one fixed id) that looks for usual trips coming up. */
export const ROUTINE_SCAN_JOB = 'reminder.routine-scan';
export const ROUTINE_SCAN_ID = 'scan';
export const ROUTINE_SCAN_EVERY_MS = 5 * 60_000;
/** A usual trip is booked within this many minutes of the same time of day. */
export const ROUTINE_WINDOW_MIN = 20;
export const ROUTINE_LOOKBACK_DAYS = 28;
/** The latest trip of a usual trip must be this recent (a habit the rider dropped stops). */
export const ROUTINE_RECENT_DAYS = 14;
/** A reminder counts as booked when the rider books within this long; a usual-trip reminder also waits this long after any booking. */
export const BOOKED_WITHIN_MIN = 60;
/** H3 resolution of a reminder's place (~350 m across): trips to the same building or street share a cell. */
const PLACE_RES = 9;

const DAY_MS = 86_400_000;
/** IST = UTC + 5:30 (no daylight saving). */
const IST_MS = 330 * 60_000;

/** A pickup or drop as the push carries it (name and address may be empty). */
export interface ReminderPoint {
  readonly name: string;
  readonly address: string;
  readonly lat: number;
  readonly lng: number;
}

/** The dedupe key of a drop: its H3 cell. */
export const placeKey = (p: { lat: number; lng: number }): string => cellAt(p.lat, p.lng, PLACE_RES);

/** Midnight IST of the day [now] is in. */
export const istDayStart = (now: Date): Date => new Date(Math.floor((now.getTime() + IST_MS) / DAY_MS) * DAY_MS - IST_MS);

/** Minutes since midnight IST at [at] (0–1439). */
export const istMinuteOfDay = (at: Date): number => Math.floor(((at.getTime() + IST_MS) % DAY_MS) / 60_000);

/** The IST date of [at], "2026-10-15". */
export const istDateOf = (at: Date): string => new Date(at.getTime() + IST_MS).toISOString().slice(0, 10);

/** Signed minutes from clock time [b] to [a] the short way round the clock: −720 … 719. */
export const clockDiff = (a: number, b: number): number => ((((a - b) % 1440) + 1440 + 720) % 1440) - 720;

/** "8:30 am" for a minute of the day. */
export function formatClock(minOfDay: number): string {
  const h = Math.floor(minOfDay / 60) % 24;
  return `${h % 12 || 12}:${String(minOfDay % 60).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** No reminders in the quiet hours: [reminderQuietStartHour] (inclusive) to [reminderQuietEndHour] (exclusive) IST, wrapping past midnight. */
export const isQuietHour = (at: Date, s: Pick<Settings, 'reminderQuietStartHour' | 'reminderQuietEndHour'>): boolean =>
  isNightIst(at, s.reminderQuietStartHour, s.reminderQuietEndHour);

/**
 * Whether a rider's recent reminders ([sent]) stop another one: 'cap' when [dailyCap] already went out today (IST),
 * 'place' when one about the same [place] went out since [placeSince]; null when it may go.
 */
export function dedupeBlock(p: {
  now: Date;
  sent: readonly { place: string | null; sentAt: Date }[];
  place: string;
  placeSince: Date;
  dailyCap: number;
}): 'cap' | 'place' | null {
  const today = istDayStart(p.now).getTime();
  if (p.sent.filter((r) => r.sentAt.getTime() >= today).length >= p.dailyCap) return 'cap';
  if (p.sent.some((r) => r.place === p.place && r.sentAt.getTime() >= p.placeSince.getTime())) return 'place';
  return null;
}

/** First word of a name, or null. */
export const firstName = (name: string | null | undefined): string | null => (name ?? '').trim().split(/\s+/)[0] || null;

/** "Siva, Ooty?" and what to do about it. */
export function searchReminderText(p: { userName: string | null; dropName: string; mode: 'LOCAL' | 'OUTSTATION' }): { title: string; body: string } {
  const first = firstName(p.userName);
  // A map pin without an address is named "Pinned location" by the apps: no place to name.
  const drop = /^pinned location$/i.test(p.dropName.trim()) ? '' : p.dropName.trim();
  const title = !drop ? 'Still planning your trip?' : first ? `${first}, ${drop}?` : `Still going to ${drop}?`;
  const body =
    p.mode === 'OUTSTATION'
      ? 'Drivers are available. Confirm now to get an outstation cab right at your doorstep.'
      : 'Drivers are nearby. Book now and get there on time.';
  return { title, body };
}

/** Ride vehicles as the app names them, with their article. */
const BOOK_A: Partial<Record<VehicleKind, string>> = {
  BIKE: 'a Bike',
  SCOOTY: 'a Scooty',
  AUTO: 'an Auto',
  AUTO_PRIORITY: 'an Auto Priority',
  CAB: 'a Mini',
  SEDAN: 'a Sedan',
  SUV: 'an SUV',
};

/** "Going to Brookefields Mall?" with the usual time and vehicle. */
export function routineReminderText(p: { dropName: string; usualMin: number; vehicle: VehicleKind }): { title: string; body: string } {
  return {
    title: `Going to ${p.dropName.trim()}?`,
    body: `Your usual ${formatClock(p.usualMin)} ride is a tap away. Book ${BOOK_A[p.vehicle] ?? 'a ride'} now.`,
  };
}

/** A completed local ride as the usual-trip scan reads it (already within the time window and day type). */
export interface RoutineTrip {
  readonly passengerId: string;
  readonly createdAt: Date;
  readonly vehicleKind: VehicleKind;
  readonly pickupName: string;
  readonly pickupAddr: string;
  readonly pickupLat: number;
  readonly pickupLng: number;
  readonly dropName: string;
  readonly dropAddr: string;
  readonly dropLat: number;
  readonly dropLng: number;
}

/** A usual trip to remind a rider of. */
export interface Routine {
  readonly passengerId: string;
  readonly place: string;
  /** Median booking time, minutes since midnight IST. */
  readonly usualMin: number;
  /** The most used vehicle (the latest of the tied ones). */
  readonly vehicle: VehicleKind;
  /** The drop and pickup of the latest trip. */
  readonly drop: ReminderPoint;
  readonly pickup: ReminderPoint;
  /** Distinct IST days with such a trip. */
  readonly days: number;
}

/**
 * The usual trips in [trips] (rides booked within ±[ROUTINE_WINDOW_MIN] of [targetMin], the time [leadMin] from now,
 * on the same day type) that are due now: per rider and drop cell, trips on at least [minDays] distinct IST days, the
 * latest within [ROUTINE_RECENT_DAYS], and the median booking time between now and [targetMin] (so the reminder goes
 * about [leadMin] before it; the 5-minute scan sends at the first run that qualifies, the dedupe stops the rest).
 */
export function findRoutines(trips: readonly RoutineTrip[], p: { now: Date; targetMin: number; leadMin: number; minDays: number }): Routine[] {
  const groups = new Map<string, RoutineTrip[]>();
  for (const t of trips) {
    const key = `${t.passengerId}|${placeKey({ lat: t.dropLat, lng: t.dropLng })}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const recentFrom = p.now.getTime() - ROUTINE_RECENT_DAYS * DAY_MS;
  const out: Routine[] = [];
  for (const group of groups.values()) {
    const days = new Set(group.map((t) => istDateOf(t.createdAt))).size;
    const byNewest = [...group].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const latest = byNewest[0];
    if (days < p.minDays || latest.createdAt.getTime() < recentFrom) continue;
    // Median as an offset from the target time, so times either side of midnight stay together.
    const offsets = group.map((t) => clockDiff(istMinuteOfDay(t.createdAt), p.targetMin)).sort((a, b) => a - b);
    const mid = offsets.length >> 1;
    const median = Math.round(offsets.length % 2 ? offsets[mid] : (offsets[mid - 1] + offsets[mid]) / 2);
    if (median > 0 || median < -p.leadMin) continue;
    const counts = new Map<VehicleKind, number>();
    for (const t of group) counts.set(t.vehicleKind, (counts.get(t.vehicleKind) ?? 0) + 1);
    const most = Math.max(...counts.values());
    out.push({
      passengerId: latest.passengerId,
      place: placeKey({ lat: latest.dropLat, lng: latest.dropLng }),
      usualMin: (((p.targetMin + median) % 1440) + 1440) % 1440,
      vehicle: byNewest.find((t) => counts.get(t.vehicleKind) === most)!.vehicleKind,
      drop: { name: latest.dropName, address: latest.dropAddr, lat: latest.dropLat, lng: latest.dropLng },
      pickup: { name: latest.pickupName, address: latest.pickupAddr, lat: latest.pickupLat, lng: latest.pickupLng },
      days,
    });
  }
  return out;
}

/** FCM data fields for a point: `<prefix>Name`, `…Address`, `…Lat`, `…Lng` (strings). */
export function pointData(prefix: 'pickup' | 'drop', p: ReminderPoint): Record<string, string> {
  return { [`${prefix}Name`]: p.name, [`${prefix}Address`]: p.address, [`${prefix}Lat`]: String(p.lat), [`${prefix}Lng`]: String(p.lng) };
}
