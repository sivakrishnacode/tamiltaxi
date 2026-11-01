// Zone rules in the admin (unit-tested): the same "live now" rule as the API (geo/zone-schedule.ts) and the words for
// a zone's schedule.
import { vehicleLabel } from "./format";
import { VEHICLE_KINDS, type VehicleKind, type Zone } from "./types";

export type ZoneRules = Pick<Zone, "days" | "startMinute" | "endMinute" | "startsAt" | "endsAt">;

const IST_OFFSET_MS = 330 * 60_000;
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
/** Day chips in the editor, Monday first. */
export const WEEK: readonly { day: number; short: string }[] = [1, 2, 3, 4, 5, 6, 0].map((day) => ({ day, short: DAY[day].slice(0, 1) }));

/** Autos charge the Tamil Nadu government fare: "Surge now" leaves them out unless chosen. */
export const GOVERNMENT_FARE_KINDS: readonly VehicleKind[] = ["AUTO", "AUTO_PRIORITY", "AUTO_PARCEL"];

/** "07:30" → 450. */
export function toMinute(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** 450 → "07:30" (1440 → "24:00"). */
export function toTime(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** "7:30 am", "10 pm", "midnight". */
function clock(minute: number): string {
  const m = minute % 1440;
  if (m === 0) return "midnight";
  const h = Math.floor(m / 60);
  const ampm = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m % 60 ? `${h12}:${String(m % 60).padStart(2, "0")} ${ampm}` : `${h12} ${ampm}`;
}

function istParts(now: Date): { day: number; minute: number } {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return { day: ist.getUTCDay(), minute: ist.getUTCHours() * 60 + ist.getUTCMinutes() };
}

/** Whether a zone counts at [now]: the API's rule (a window past midnight belongs to the day it starts on). */
export function isLiveNow(z: ZoneRules, now: Date = new Date()): boolean {
  if (z.startsAt && now < new Date(z.startsAt)) return false;
  if (z.endsAt && now >= new Date(z.endsAt)) return false;
  const { day, minute } = istParts(now);
  const onDay = (d: number) => z.days.length === 0 || z.days.includes(d);
  if (z.startMinute == null || z.endMinute == null || z.startMinute === z.endMinute) return onDay(day);
  if (z.startMinute < z.endMinute) return onDay(day) && minute >= z.startMinute && minute < z.endMinute;
  if (minute >= z.startMinute) return onDay(day);
  return minute < z.endMinute && onDay((day + 6) % 7);
}

/** "Every day", "Weekdays", "Sat, Sun", "Mon, Wed, Fri". */
export function daysLabel(days: readonly number[]): string {
  const set = new Set(days);
  if (set.size === 0 || set.size === 7) return "Every day";
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return "Weekdays";
  if (set.size === 2 && set.has(0) && set.has(6)) return "Weekends";
  return WEEK.filter((w) => set.has(w.day)).map((w) => DAY[w.day]).join(", ");
}

/** "12 Nov, 6:30 pm" in IST. */
function when(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
}

/**
 * One line for a zone's schedule: "Always", "Weekdays, 7 am–10 am", "Fri, 10 pm–2 am", "Until 12 Nov, 6:30 pm",
 * "12 Nov, 6 pm – 12 Nov, 8 pm".
 */
export function scheduleLabel(z: ZoneRules): string {
  const parts: string[] = [];
  const hasHours = z.startMinute != null && z.endMinute != null && z.startMinute !== z.endMinute;
  if (z.days.length > 0 || hasHours) parts.push(daysLabel(z.days) + (hasHours ? `, ${clock(z.startMinute!)}–${clock(z.endMinute!)}` : ""));
  if (z.startsAt && z.endsAt) parts.push(`${when(z.startsAt)} – ${when(z.endsAt)}`);
  else if (z.endsAt) parts.push(`Until ${when(z.endsAt)}`);
  else if (z.startsAt) parts.push(`From ${when(z.startsAt)}`);
  return parts.length ? parts.join(" · ") : "Always";
}

/** Where a zone stands now: live, off for now (outside its hours), not started, or ended for good. */
export function zoneState(z: ZoneRules & { isActive: boolean }, now: Date = new Date()): "live" | "off" | "upcoming" | "ended" | "paused" {
  if (!z.isActive) return "paused";
  if (z.endsAt && now >= new Date(z.endsAt)) return "ended";
  if (z.startsAt && now < new Date(z.startsAt)) return "upcoming";
  return isLiveNow(z, now) ? "live" : "off";
}

/** A surge's vehicles in a few words: "Bike, Auto", or "All except Auto, Auto Priority" when most are in. */
export function vehiclesLabel(kinds: readonly VehicleKind[]): string {
  if (kinds.length === 0 || kinds.length >= VEHICLE_KINDS.length) return "All vehicles";
  if (kinds.length <= VEHICLE_KINDS.length / 2) return kinds.map(vehicleLabel).join(", ");
  return `All except ${VEHICLE_KINDS.filter((k) => !kinds.includes(k)).map(vehicleLabel).join(", ")}`;
}
