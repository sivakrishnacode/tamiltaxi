// Engage › Automations: reminder settings and festival/weekend campaigns. Pure helpers shared by the pages, their
// Server Actions and the tests.
import type { CampaignStatus, CampaignTarget, ReminderSettings } from "./types";

/** The reminder keys of GET/PUT /admin/settings, with the API's defaults. Edited on Automations, not in Settings. */
export const REMINDER_DEFAULTS: ReminderSettings = {
  searchReminderEnabled: true,
  searchReminderDelayMin: 10,
  routineReminderEnabled: true,
  routineMinTrips: 3,
  routineLeadMin: 15,
  reminderQuietStartHour: 22,
  reminderQuietEndHour: 8,
  reminderDailyCap: 2,
};

export const REMINDER_KEYS = Object.keys(REMINDER_DEFAULTS) as (keyof ReminderSettings)[];

export function isReminderKey(key: string): key is keyof ReminderSettings {
  return (REMINDER_KEYS as string[]).includes(key);
}

/** The reminder values from a settings response, and whether this API has them at all (older APIs: defaults, read-only). */
export function readReminderSettings(settings: Record<string, number | boolean | string> | null): { values: ReminderSettings; isSupported: boolean } {
  const isSupported = !!settings && REMINDER_KEYS.every((k) => typeof settings[k] === typeof REMINDER_DEFAULTS[k]);
  if (!settings || !isSupported) return { values: REMINDER_DEFAULTS, isSupported };
  return { values: Object.fromEntries(REMINDER_KEYS.map((k) => [k, settings[k]])) as unknown as ReminderSettings, isSupported };
}

/** Booked ÷ sent as a whole percentage ("25 %"), "–" before anything was sent. */
export function conversionLabel(sent: number, booked: number): string {
  if (!(sent > 0)) return "–";
  return `${Math.round((Math.max(0, booked) / sent) * 100)} %`;
}

/** "22:00" style hour for quiet-hour hints. */
export function hourLabel(hour: number): string {
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? `${String(hour).padStart(2, "0")}:00` : "–";
}

// Campaigns ---------------------------------------------------------------------------------------------------------

export const CAMPAIGN_TARGETS: readonly CampaignTarget[] = ["HOME", "OUTSTATION", "RENTAL", "PARCEL"];

/** Which screen the push opens in the passenger app. */
export const TARGET_LABEL: Record<CampaignTarget, string> = {
  HOME: "Home",
  OUTSTATION: "Outstation",
  RENTAL: "Rentals",
  PARCEL: "Parcel",
};

export const STATUS_LABEL: Record<CampaignStatus, string> = { SCHEDULED: "Scheduled", SENT: "Sent", CANCELLED: "Cancelled" };

export const CAMPAIGN_TITLE_MAX = 65;
export const CAMPAIGN_BODY_MAX = 180;

export interface CampaignPreset {
  readonly label: string;
  readonly title: string;
  readonly body: string;
  readonly target: CampaignTarget;
}

/** Quick starts: they only fill the form (no dates built in). */
export const CAMPAIGN_PRESETS: readonly CampaignPreset[] = [
  {
    label: "Festival trip home",
    title: "Native poga plan ah?",
    body: "Going home for the festival? Book a one-way outstation cab in a tap.",
    target: "OUTSTATION",
  },
  {
    label: "Weekend getaway",
    title: "Weekend plans?",
    body: "Ooty, Kodai or Valparai: book an outstation cab for the weekend.",
    target: "OUTSTATION",
  },
  { label: "Airport run", title: "Flight to catch?", body: "Book your airport cab now and travel stress free.", target: "HOME" },
  { label: "Day out", title: "Day out with family?", body: "Book a cab by the hour and keep it as long as you need.", target: "RENTAL" },
];

/** A date ("2026-10-20") and time ("09:30") in India time as an ISO instant, or null when either is invalid. */
export function istToIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const d = new Date(`${date}T${time}:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export interface CampaignInput {
  readonly title: string;
  readonly body: string;
  readonly target: string;
  /** ISO; absent = send now. */
  readonly sendAt?: string;
}

/** The first problem with a new campaign, or null. The API checks again. */
export function campaignInputError(input: CampaignInput, now = Date.now()): string | null {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) return "Add a title";
  if (title.length > CAMPAIGN_TITLE_MAX) return `Keep the title within ${CAMPAIGN_TITLE_MAX} characters`;
  if (!body) return "Add a message";
  if (body.length > CAMPAIGN_BODY_MAX) return `Keep the message within ${CAMPAIGN_BODY_MAX} characters`;
  if (!CAMPAIGN_TARGETS.includes(input.target as CampaignTarget)) return "Choose the screen it opens";
  if (input.sendAt !== undefined) {
    const at = new Date(input.sendAt).getTime();
    if (Number.isNaN(at)) return "Choose a valid date and time";
    if (at <= now) return "Pick a time in the future, or send it now";
  }
  return null;
}
