import type { Settings } from "./types";

export type SettingValue = number | boolean | string;
export type SettingsInput = Partial<Record<keyof Settings, SettingValue>> & Record<string, SettingValue>;
export type SettingsErrors = Partial<Record<string, string>>;

function inRange(v: unknown, min: number, max: number, isInteger = false): boolean {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max && (!isInteger || Number.isInteger(v));
}

/** Rules for the known settings keys (apps/api/src/modules/settings/settings.defaults.ts). */
const RULES: Record<string, (v: SettingValue) => string | null> = {
  maxMultiplier: (v) => (inRange(v, 1, 1.5) ? null : "Maximum multiplier must be 1.0–1.5"),
  currentMultiplier: (v) => (inRange(v, 1, 1.5) ? null : "Current multiplier must be 1.0–1.5"),
  searchRadiusKm: (v) => (inRange(v, 0.5, 30) ? null : "Search radius must be 0.5–30 km"),
  maxSearchRadiusKm: (v) => (inRange(v, 0.5, 30) ? null : "Maximum search radius must be 0.5–30 km"),
  searchExpandSeconds: (v) => (inRange(v, 0, 600, true) ? null : "Widen over must be 0–600 whole seconds"),
  offerSeconds: (v) => (inRange(v, 5, 120, true) ? null : "Offer time must be 5–120 whole seconds"),
  maxOpenOffers: (v) => (inRange(v, 1, 4, true) ? null : "Open requests per driver must be 1–4"),
  maxCandidates: (v) => (inRange(v, 1, 20, true) ? null : "Drivers per booking must be 1–20"),
  maxReassigns: (v) => (inRange(v, 0, 5, true) ? null : "Reassigns per trip must be 0–5"),
  notMovingMinMin: (v) => (inRange(v, 1, 60, true) ? null : "First check must be 1–60 whole minutes"),
  notMovingEtaFactor: (v) => (inRange(v, 1, 5) ? null : "ETA factor must be 1–5"),
  notMovingMinProgressM: (v) => (inRange(v, 0, 5000, true) ? null : "Progress must be 0–5,000 whole metres"),
  notMovingRecheckMin: (v) => (inRange(v, 1, 30, true) ? null : "Check again after must be 1–30 whole minutes"),
  noShowWaitMin: (v) => (inRange(v, 1, 30, true) ? null : "No-show wait must be 1–30 whole minutes"),
  freeWaitMin: (v) => (inRange(v, 0, 30, true) ? null : "Free waiting must be 0–30 whole minutes"),
  waitMaxCharge: (v) => (inRange(v, 0, 1000, true) ? null : "Waiting cap must be ₹0–₹1,000 (whole rupees)"),
  cancellationFeeEnabled: (v) => (typeof v === "boolean" ? null : "Cancellation fee must be on or off"),
  cancellationFee: (v) => (inRange(v, 0, 500, true) ? null : "Cancellation fee must be ₹0–₹500 (whole rupees)"),
  cancelRateMinTrips: (v) => (inRange(v, 1, 100, true) ? null : "Minimum trips must be 1–100"),
  cancelRateNudge: (v) => (inRange(v, 0.05, 1) ? null : "Warn at must be 0.05–1 (e.g. 0.3 = 30 %)"),
  cancelRateBlock: (v) => (inRange(v, 0.05, 1) ? null : "Pause at must be 0.05–1 (e.g. 0.5 = 50 %)"),
  cancelBlockHours: (v) => (inRange(v, 1, 720, true) ? null : "Pause length must be 1–720 whole hours"),
  cancelBlockRepeatHours: (v) => (inRange(v, 1, 720, true) ? null : "Repeat pause length must be 1–720 whole hours"),
  rankEnabled: (v) => (typeof v === "boolean" ? null : "Ranking must be on or off"),
  rankWeightAccept: (v) => (inRange(v, 0, 3) ? null : "Ignored-offer weight must be 0–3"),
  rankWeightCancel: (v) => (inRange(v, 0, 3) ? null : "Cancel weight must be 0–3"),
  rankMaxPenalty: (v) => (inRange(v, 0, 3) ? null : "Most penalty must be 0–3 (e.g. 0.5 = at most ETA × 1.5)"),
  rankIdleMaxBoost: (v) => (inRange(v, 0, 0.3) ? null : "Idle bonus must be 0–0.3 (e.g. 0.15 = 15 % of the ETA)"),
  rankIdleFullMin: (v) => (inRange(v, 1, 240, true) ? null : "Full idle bonus after must be 1–240 whole minutes"),
  rankMinOffers: (v) => (inRange(v, 1, 200, true) ? null : "Judge after must be 1–200 offers"),
  stuckTripMinMin: (v) => (inRange(v, 30, 720, true) ? null : "Stuck trip must be 30–720 whole minutes"),
  stuckDurationFactor: (v) => (inRange(v, 1, 10) ? null : "Stuck factor must be 1–10"),
  pickupHardCapMin: (v) => (inRange(v, 15, 240, true) ? null : "Cancel after must be 15–240 whole minutes"),
  arrivalRadiusM: (v) => (inRange(v, 50, 2000, true) ? null : "Arrived radius must be 50–2,000 whole metres"),
  dropRadiusM: (v) => (inRange(v, 50, 5000, true) ? null : "End-trip radius must be 50–5,000 whole metres"),
  trialDays: (v) => (inRange(v, 0, 365, true) ? null : "Trial must be 0–365 days"),
  graceDays: (v) => (inRange(v, 0, 30, true) ? null : "Grace period must be 0–30 days"),
  batchWindowMs: (v) => (inRange(v, 0, 10_000, true) ? null : "Batch window must be 0–10,000 ms"),
  surgeSensitivity: (v) => (inRange(v, 0, 1) ? null : "Sensitivity must be 0–1 (e.g. 0.1)"),
  demandWindowMin: (v) => (inRange(v, 1, 120, true) ? null : "Demand window must be 1–120 whole minutes"),
  surgeMinRequests: (v) => (inRange(v, 0, 1000, true) ? null : "Minimum requests must be a whole number 0–1,000"),
  historicalEtaMinTrips: (v) => (inRange(v, 0, 10_000, true) ? null : "Minimum trips must be a whole number (0 = off)"),
  useRoadEta: (v) => (typeof v === "boolean" ? null : "Road ETA must be on or off"),
  dynamicSurgeEnabled: (v) => (typeof v === "boolean" ? null : "Dynamic surge must be on or off"),
  driverPlansEnabled: (v) => (typeof v === "boolean" ? null : "Paid driver plans must be on or off"),
  driverAutoApprove: (v) => (typeof v === "boolean" ? null : "Auto-approval must be on or off"),
  dailySelfieCheckEnabled: (v) => (typeof v === "boolean" ? null : "The daily selfie check must be on or off"),
  sosAdminAlert: (v) => (typeof v === "boolean" ? null : "SOS push must be on or off"),
  stopRadiusM: (v) => (inRange(v, 10, 200, true) ? null : "Stop radius must be 10–200 whole metres"),
  stopMinutes: (v) => (inRange(v, 1, 60, true) ? null : "Stop time must be 1–60 whole minutes"),
  stopDedupeMin: (v) => (inRange(v, 1, 120, true) ? null : "Ask again after must be 1–120 whole minutes"),
  deviationM: (v) => (inRange(v, 50, 2000, true) ? null : "Off-route distance must be 50–2,000 whole metres"),
  nightStartHour: (v) => (inRange(v, 0, 23, true) ? null : "Night starts must be an hour 0–23"),
  nightEndHour: (v) => (inRange(v, 0, 23, true) ? null : "Night ends must be an hour 0–23"),
  supportPhone: (v) => (typeof v === "string" && /^\+?[\d\s-]{8,20}$/.test(v.trim()) ? null : "Enter a phone number like +91 422 000 0000"),
};

/** Client + server validation for PUT /admin/settings. Only the keys present are checked; unknown numbers must be finite. */
export function validateSettings(s: SettingsInput): SettingsErrors {
  const e: SettingsErrors = {};
  for (const [key, value] of Object.entries(s)) {
    const rule = RULES[key];
    const error = rule ? rule(value) : typeof value === "number" && !Number.isFinite(value) ? "Enter a number" : null;
    if (error) e[key] = error;
  }
  const cur = s.currentMultiplier;
  const max = s.maxMultiplier;
  if (!e.currentMultiplier && !e.maxMultiplier && typeof cur === "number" && typeof max === "number" && cur > max) {
    e.currentMultiplier = "Current multiplier can't exceed the maximum";
  }
  const r0 = s.searchRadiusKm;
  const r1 = s.maxSearchRadiusKm;
  if (!e.searchRadiusKm && !e.maxSearchRadiusKm && typeof r0 === "number" && typeof r1 === "number" && r1 < r0) {
    e.maxSearchRadiusKm = "Maximum search radius can't be below the start radius";
  }
  const nudge = s.cancelRateNudge;
  const pause = s.cancelRateBlock;
  if (!e.cancelRateNudge && !e.cancelRateBlock && typeof nudge === "number" && typeof pause === "number" && nudge > pause) {
    e.cancelRateNudge = "Warn at can't be above Pause at";
  }
  return e;
}

/** multiplier = 1 + sensitivity × (ratio − 1), capped, rounded down to 0.05 (apps/api/src/modules/geo/surge.ts). */
export function surgeExample(ratio: number, sensitivity: number, maxMultiplier: number): number {
  if (!(ratio > 1)) return 1;
  const raw = Math.min(maxMultiplier, 1 + sensitivity * (ratio - 1));
  return Math.floor(raw * 20 + 1e-9) / 20;
}

/** H3 resolution 8 hexagon ≈ 0.737 km² (average area). */
export const KM2_PER_CELL: Record<number, number> = { 7: 5.161, 8: 0.737, 9: 0.105 };

export function cellsToKm2(count: number, resolution = 8): number {
  return count * (KM2_PER_CELL[resolution] ?? 0.737);
}

const EPS = 1e-9;
const floorRupee = (v: number): number => Math.floor(v + EPS);

export interface FarePreview {
  readonly base: number;
  readonly distanceCharge: number;
  readonly timeCharge: number;
  readonly minFareTopUp: number;
  readonly subtotal: number;
  readonly multiplier: number;
  readonly peakCharge: number;
  readonly total: number;
}

/**
 * Mirrors apps/api/src/modules/fares/fare-engine.ts: each line floored to the rupee,
 * total = max(minFare, floor((base + perKm×km + perMin×min) × multiplier)), multiplier 1.0–[maxMultiplier] (≤ 1.5).
 * The multiplier never applies to the minimum-fare top-up.
 */
export function previewFare(
  rule: { base: number; perKm: number; perMin: number; minFare: number },
  km: number,
  minutes: number,
  multiplier = 1,
  maxMultiplier = 1.5,
): FarePreview {
  const cap = Math.max(1, Number.isFinite(maxMultiplier) ? maxMultiplier : 1.5);
  const m = Math.min(cap, Math.max(1, Number.isFinite(multiplier) ? multiplier : 1));
  const distanceCharge = floorRupee(rule.perKm * Math.max(0, km));
  const timeCharge = floorRupee(rule.perMin * Math.max(0, minutes));
  const raw = rule.base + distanceCharge + timeCharge;
  const surged = floorRupee(raw * m);
  const minFareTopUp = Math.max(0, rule.minFare - surged);
  const subtotal = raw + minFareTopUp;
  const total = surged + minFareTopUp;
  return { base: rule.base, distanceCharge, timeCharge, minFareTopUp, subtotal, multiplier: m, peakCharge: total - subtotal, total };
}
