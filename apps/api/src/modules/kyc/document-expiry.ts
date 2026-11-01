import { KycDocType } from '../../generated/prisma/enums.js';

/** Reminders go out this many days before a document expires (one each). */
export const EXPIRY_NOTICE_DAYS: readonly number[] = [30, 7];
/** The expiring list (admin Documents › Expiring soon, dashboard) looks this far ahead. */
export const EXPIRING_WITHIN_DAYS = 30;

export const EXPIRY_SCAN_JOB = 'kyc.expiry-scan';
export const EXPIRY_SCAN_ID = 'all';
export const EXPIRY_SCAN_EVERY_MS = 60 * 60_000;

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;
/** Reminders only go out between these IST hours (from, to exclusive): never at night. */
const REMIND_HOURS = [9, 20] as const;

const DOC_NAME: Partial<Record<KycDocType, string>> = { VEHICLE_RC: 'RC', INSURANCE: 'insurance' };
const docName = (type: KycDocType): string => DOC_NAME[type] ?? 'document';

/** Today's date in India as a UTC-midnight Date, the way Postgres DATE columns come back. */
export function istToday(now: Date): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

/** "2026-12-12" → that date as a UTC-midnight Date (a DATE column value). */
export function parseDay(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/** Whole days from [today] to [expiresOn]: 0 = valid until today, negative = expired. */
export function daysLeft(expiresOn: Date, today: Date): number {
  return Math.round((expiresOn.getTime() - today.getTime()) / DAY_MS);
}

/** The reminder due now (30 or 7 days before), or null when none is due or it was already sent. */
export function noticeDue(left: number, notified: number | null): number | null {
  if (left < 0) return null;
  const due = [...EXPIRY_NOTICE_DAYS].sort((a, b) => a - b).find((d) => left <= d);
  if (due === undefined) return null;
  return notified === null || notified > due ? due : null;
}

/** Reminders wait for the day (9 am to 8 pm IST). */
export function isReminderHour(now: Date): boolean {
  const hour = new Date(now.getTime() + IST_OFFSET_MS).getUTCHours();
  return hour >= REMIND_HOURS[0] && hour < REMIND_HOURS[1];
}

/** "12 Dec 2026". */
export function formatDay(day: Date): string {
  return day.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** The reminder push before a document expires. */
export function expiryReminderText(type: KycDocType, expiresOn: Date, left: number): { title: string; body: string } {
  const when = left === 0 ? 'today' : left === 1 ? 'tomorrow' : `in ${left} days`;
  return {
    title: `Your ${docName(type)} expires ${when}`,
    body: `Valid until ${formatDay(expiresOn)}. Renew it in time: the app asks you to upload the new one when it expires.`,
  };
}

/** The reject reason the driver sees (push and app) once a document has expired. */
export function expiredReason(type: KycDocType, expiresOn: Date): string {
  return `Expired on ${formatDay(expiresOn)}. Please upload the renewed ${docName(type)}`;
}
