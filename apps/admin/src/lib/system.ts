// Pure helpers for Admin › System › Server health (unit-tested).
import type { SystemHealth, UsageMetric } from "./types";

/** "1.4 GB", "820 MB", "12 KB". */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "–";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = Math.max(0, bytes);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** "3 days 4 h", "5 h 12 min", "8 min". */
export function formatUptime(sec: number): string {
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${min % 60} min`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ${h % 24} h`;
}

/** How full something is: under 70% fine, to 90% watch, above that act. */
export type Level = "ok" | "watch" | "act";
export function levelOf(share: number): Level {
  return share >= 0.9 ? "act" : share >= 0.7 ? "watch" : "ok";
}

/** The Google calls the API makes, cost order (Route Matrix first: it runs out first). */
export const MAPS_ROWS: readonly { metric: UsageMetric; label: string; what: string }[] = [
  { metric: "maps.matrix_elements", label: "Route Matrix", what: "Driver ETAs on P-10 and in dispatch, per element" },
  { metric: "maps.routes_pro", label: "Routes Pro", what: "Fare route with traffic" },
  { metric: "maps.routes", label: "Routes", what: "Offer card and trip ETAs" },
  { metric: "maps.place_details", label: "Place Details", what: "A place picked in search" },
  { metric: "maps.geocode", label: "Geocoding", what: "Pin to address" },
  { metric: "maps.autocomplete", label: "Autocomplete", what: "Search keystrokes, free when a place is picked" },
];

/**
 * This month's use of one call against its free monthly calls, and where the month is heading at its pace so far
 * (`projected`: the month's count scaled to the whole month; null in its first 2 days, too early to tell).
 */
export function mapsUse(health: SystemHealth, metric: UsageMetric, now: Date = new Date()): { today: number; month: number; free: number | null; share: number | null; projected: number | null } {
  const month = health.usage.month[metric] ?? 0;
  const free = health.usage.freePerMonth[metric] ?? null;
  // IST calendar month, like the API's counters.
  const ist = new Date(now.getTime() + 330 * 60_000);
  const daysInMonth = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + 1, 0)).getUTCDate();
  const daysGone = ist.getUTCDate() - 1 + (ist.getUTCHours() * 60 + ist.getUTCMinutes()) / 1440;
  return {
    today: health.usage.today[metric] ?? 0,
    month,
    free,
    share: free ? month / free : null,
    projected: daysGone >= 2 ? Math.round((month / daysGone) * daysInMonth) : null,
  };
}

/** How old the newest backup is: under 2 days fine, to 7 days watch, older (or none) act. */
export function backupLevel(at: string | null | undefined, now: Date = new Date()): Level {
  if (!at) return "act";
  const days = (now.getTime() - new Date(at).getTime()) / 86_400_000;
  return days < 2 ? "ok" : days < 7 ? "watch" : "act";
}
