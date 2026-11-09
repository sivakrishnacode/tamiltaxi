// Engage › Automations: WhatsApp welcome messages sent through WATX when a trigger happens. Pure helpers shared by the
// page, its Server Actions and the tests.
import type { WelcomeLog, WelcomeSettings, WelcomeTrigger } from "./types";

/** The welcome keys of GET/PUT /admin/settings, with the API's defaults (all off until the templates are approved). */
export const WELCOME_DEFAULTS: WelcomeSettings = {
  welcomeRiderEnabled: false,
  welcomeRiderTemplate: "welcome_rider",
  welcomeDriverRegisteredEnabled: false,
  welcomeDriverRegisteredTemplate: "welcome_driver_registered",
  welcomeDriverApprovedEnabled: false,
  welcomeDriverApprovedTemplate: "welcome_driver_approved",
};

export const WELCOME_KEYS = Object.keys(WELCOME_DEFAULTS) as (keyof WelcomeSettings)[];

export function isWelcomeKey(key: string): key is keyof WelcomeSettings {
  return (WELCOME_KEYS as string[]).includes(key);
}

/** The welcome values from a settings response, and whether this API has them at all (older APIs: defaults, read-only). */
export function readWelcomeSettings(settings: Record<string, number | boolean | string> | null): { values: WelcomeSettings; isSupported: boolean } {
  const isSupported = !!settings && WELCOME_KEYS.every((k) => typeof settings[k] === typeof WELCOME_DEFAULTS[k]);
  if (!settings || !isSupported) return { values: WELCOME_DEFAULTS, isSupported };
  return { values: Object.fromEntries(WELCOME_KEYS.map((k) => [k, settings[k]])) as unknown as WelcomeSettings, isSupported };
}

/** WATX / Meta template names: lowercase letters, digits and underscores. */
export function isTemplateName(name: string): boolean {
  return /^[a-z0-9_]{1,512}$/.test(name);
}

export interface WelcomeTriggerInfo {
  readonly trigger: WelcomeTrigger;
  readonly title: string;
  /** When it goes out, in a sentence. */
  readonly when: string;
  readonly enabledKey: keyof WelcomeSettings;
  readonly templateKey: keyof WelcomeSettings;
  /** The text submitted to WATX for this template ({{1}} = first name), shown as the preview with [sample]. */
  readonly body: string;
  readonly sample: string;
}

/** The three moments a welcome can go out, in the order they happen. Each account gets each one at most once. */
export const WELCOME_TRIGGERS: readonly WelcomeTriggerInfo[] = [
  {
    trigger: "RIDER_SIGNUP",
    title: "New rider",
    when: "A rider finishes sign-up in the rider app (saves their name).",
    enabledKey: "welcomeRiderEnabled",
    templateKey: "welcomeRiderTemplate",
    body:
      "Vanakkam {{1}}, welcome to Tamil Taxi! Your account is set up with this number.\n\n" +
      "You can now book rides and send parcels in the app. Your trips and your ride OTP are under Account.\n\n" +
      "Any doubts? Reply to this message, or tap Help & support in the app.",
    sample: "Priya",
  },
  {
    trigger: "DRIVER_REGISTERED",
    title: "Driver registered",
    when: "Someone registers as a driver in the driver app.",
    enabledKey: "welcomeDriverRegisteredEnabled",
    templateKey: "welcomeDriverRegisteredTemplate",
    body:
      "Vanakkam {{1}}, thank you for registering with Tamil Taxi Driver. Your application is in.\n\n" +
      "Upload your documents and profile photo in the app. Our team checks them by hand and we will tell you as soon as your account is approved.\n\n" +
      "Any doubts? Reply to this message and our team will help you.",
    sample: "Murugan",
  },
  {
    trigger: "DRIVER_APPROVED",
    title: "Driver approved",
    when: "A driver is approved, by an admin or automatically. Approving them again later doesn't resend it.",
    enabledKey: "welcomeDriverApprovedEnabled",
    templateKey: "welcomeDriverApprovedTemplate",
    body:
      "Vanakkam {{1}}, your Tamil Taxi Driver account is approved.\n\n" +
      "Open the app and go online to start getting ride requests near you. Keep the app running while you are online so no request is missed.\n\n" +
      "Any doubts? Reply to this message and our team will help you.",
    sample: "Murugan",
  },
];

export const TRIGGER_LABEL: Record<WelcomeTrigger, string> = {
  RIDER_SIGNUP: "New rider",
  DRIVER_REGISTERED: "Driver registered",
  DRIVER_APPROVED: "Driver approved",
};

/** The template text with its variable filled in, as the person reads it. */
export function fillTemplate(body: string, name: string): string {
  return body.replaceAll("{{1}}", name);
}

export type WelcomeStatus = "SENT" | "FAILED" | "SENDING";

export function welcomeStatus(m: Pick<WelcomeLog, "sentAt" | "error">): WelcomeStatus {
  if (m.sentAt) return "SENT";
  return m.error ? "FAILED" : "SENDING";
}

/** Where a welcome's person opens: driver welcomes on the driver page, the rider welcome on the rider page (kept apart). */
export function personHref(m: Pick<WelcomeLog, "trigger" | "userId" | "driverId">): string {
  if (m.trigger !== "RIDER_SIGNUP" && m.driverId) return `/drivers/${encodeURIComponent(m.driverId)}`;
  return `/users/${encodeURIComponent(m.userId)}`;
}
