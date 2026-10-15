import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_PRESETS,
  REMINDER_DEFAULTS,
  campaignInputError,
  conversionLabel,
  hourLabel,
  isReminderKey,
  istToIso,
  readReminderSettings,
} from "@/lib/automations";
import { validateSettings } from "@/lib/validation";

describe("reminder settings", () => {
  it("reads the reminder keys, or falls back to read-only defaults on an older API", () => {
    expect(readReminderSettings({ maxMultiplier: 1.5 })).toEqual({ values: REMINDER_DEFAULTS, isSupported: false });
    const live = readReminderSettings({ ...REMINDER_DEFAULTS, searchReminderDelayMin: 20, maxMultiplier: 1.5 });
    expect(live.isSupported).toBe(true);
    expect(live.values.searchReminderDelayMin).toBe(20);
    expect(live.values).not.toHaveProperty("maxMultiplier");
  });

  it("knows which keys belong to Automations", () => {
    expect(isReminderKey("reminderDailyCap")).toBe(true);
    expect(isReminderKey("maxMultiplier")).toBe(false);
  });

  it("accepts the defaults and refuses out-of-range values", () => {
    expect(validateSettings({ ...REMINDER_DEFAULTS })).toEqual({});
    expect(Object.keys(validateSettings({ reminderQuietStartHour: 24, reminderDailyCap: 0, searchReminderDelayMin: 1.5 }))).toEqual([
      "reminderQuietStartHour",
      "reminderDailyCap",
      "searchReminderDelayMin",
    ]);
  });

  it("formats conversion and hours", () => {
    expect(conversionLabel(0, 0)).toBe("–");
    expect(conversionLabel(40, 10)).toBe("25 %");
    expect(hourLabel(8)).toBe("08:00");
    expect(hourLabel(24)).toBe("–");
  });
});

describe("campaigns", () => {
  const now = Date.parse("2026-10-15T10:00:00Z");

  it("reads a date and time as India time", () => {
    expect(istToIso("2026-10-20", "09:30")).toBe("2026-10-20T04:00:00.000Z");
    expect(istToIso("2026-10-20", "")).toBeNull();
    expect(istToIso("20/10/2026", "09:30")).toBeNull();
  });

  it("checks title, message, screen and time", () => {
    const ok = { title: "Weekend plans?", body: "Book a cab.", target: "OUTSTATION" };
    expect(campaignInputError(ok, now)).toBeNull();
    expect(campaignInputError({ ...ok, title: " " }, now)).toBe("Add a title");
    expect(campaignInputError({ ...ok, title: "x".repeat(66) }, now)).toMatch(/65/);
    expect(campaignInputError({ ...ok, body: "x".repeat(181) }, now)).toMatch(/180/);
    expect(campaignInputError({ ...ok, target: "MOON" }, now)).toBe("Choose the screen it opens");
    expect(campaignInputError({ ...ok, sendAt: "2026-10-15T09:00:00Z" }, now)).toMatch(/future/);
    expect(campaignInputError({ ...ok, sendAt: "nope" }, now)).toMatch(/valid/);
    expect(campaignInputError({ ...ok, sendAt: "2026-10-16T09:00:00Z" }, now)).toBeNull();
  });

  it("ships presets that fit the limits", () => {
    for (const p of CAMPAIGN_PRESETS) expect(campaignInputError(p, now), p.label).toBeNull();
  });
});
