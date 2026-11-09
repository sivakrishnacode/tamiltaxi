import { describe, expect, it } from "vitest";

import { validateSettings } from "@/lib/validation";
import {
  WELCOME_DEFAULTS,
  WELCOME_TRIGGERS,
  fillTemplate,
  isTemplateName,
  isWelcomeKey,
  personHref,
  readWelcomeSettings,
  welcomeStatus,
} from "@/lib/whatsapp";

describe("readWelcomeSettings", () => {
  it("reads the welcome keys, or the defaults (read-only) from an older API", () => {
    const settings = { ...WELCOME_DEFAULTS, welcomeRiderEnabled: true, welcomeRiderTemplate: "hello_rider", maxMultiplier: 1.5 };
    expect(readWelcomeSettings(settings)).toEqual({ values: { ...WELCOME_DEFAULTS, welcomeRiderEnabled: true, welcomeRiderTemplate: "hello_rider" }, isSupported: true });
    expect(readWelcomeSettings({ maxMultiplier: 1.5 })).toEqual({ values: WELCOME_DEFAULTS, isSupported: false });
    expect(readWelcomeSettings(null).isSupported).toBe(false);
  });

  it("starts with every welcome off", () => {
    expect(WELCOME_TRIGGERS.every((t) => WELCOME_DEFAULTS[t.enabledKey] === false)).toBe(true);
  });

  it("knows its own keys only", () => {
    expect(isWelcomeKey("welcomeDriverApprovedTemplate")).toBe(true);
    expect(isWelcomeKey("searchReminderEnabled")).toBe(false);
  });
});

describe("template names", () => {
  it("are WATX names: lowercase letters, digits and _", () => {
    expect(isTemplateName("welcome_rider_2")).toBe(true);
    expect(isTemplateName("Welcome Rider")).toBe(false);
    expect(isTemplateName("")).toBe(false);
    expect(validateSettings({ welcomeRiderTemplate: "welcome-rider" }).welcomeRiderTemplate).toMatch(/lowercase/);
    expect(validateSettings({ welcomeRiderTemplate: "welcome_rider", welcomeRiderEnabled: true })).toEqual({});
  });

  it("every suggested body follows Meta's rules: one variable, words before and after it", () => {
    for (const t of WELCOME_TRIGGERS) {
      expect(isTemplateName(WELCOME_DEFAULTS[t.templateKey] as string)).toBe(true);
      expect(t.body.match(/\{\{\d+\}\}/g)).toEqual(["{{1}}"]);
      expect(t.body.startsWith("{{")).toBe(false);
      expect(t.body.endsWith("}}")).toBe(false);
      expect(t.body.length).toBeLessThanOrEqual(1024);
      expect(fillTemplate(t.body, t.sample)).toContain(`Vanakkam ${t.sample},`);
    }
  });
});

describe("recent welcomes", () => {
  it("reads sent, failed or still sending", () => {
    expect(welcomeStatus({ sentAt: "2026-11-09T10:00:00Z", error: null })).toBe("SENT");
    expect(welcomeStatus({ sentAt: null, error: "Template not found" })).toBe("FAILED");
    expect(welcomeStatus({ sentAt: null, error: null })).toBe("SENDING");
  });

  it("opens driver welcomes on the driver page and the rider welcome on the rider page", () => {
    expect(personHref({ trigger: "DRIVER_APPROVED", userId: "u1", driverId: "d1" })).toBe("/drivers/d1");
    expect(personHref({ trigger: "RIDER_SIGNUP", userId: "u1", driverId: "d1" })).toBe("/users/u1");
    expect(personHref({ trigger: "DRIVER_REGISTERED", userId: "u1", driverId: null })).toBe("/users/u1");
  });
});
