import type { HeatmapMetric, HeatmapQuery } from "./types";

/**
 * Sequential, colour-blind-safe ramp (light yellow → orange → coral → deep red → navy-plum), close to ColorBrewer
 * YlOrRd with a dark end so the hottest cells stand out on both the roadmap and satellite.
 */
export const HEAT_STOPS = ["#FFF3C4", "#FDD28A", "#F9A05C", "#F4511E", "#B91C1C", "#5B1A3A"] as const;

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Colour for an intensity 0–1 (linear between the stops). */
export function heatColor(intensity: number): string {
  const t = Math.min(1, Math.max(0, Number.isFinite(intensity) ? intensity : 0)) * (HEAT_STOPS.length - 1);
  const i = Math.min(HEAT_STOPS.length - 2, Math.floor(t));
  const f = t - i;
  const a = hexToRgb(HEAT_STOPS[i]);
  const b = hexToRgb(HEAT_STOPS[i + 1]);
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Legend rows: 5 equal intensity bands with their value ranges. */
export function heatLegend(max: number, bands = 5): { color: string; from: number; to: number }[] {
  return Array.from({ length: bands }, (_, i) => ({
    color: heatColor((i + 0.5) / bands),
    from: Math.floor((max * i) / bands) + (i === 0 ? 0 : 1),
    to: Math.floor((max * (i + 1)) / bands),
  }));
}

export const METRIC_LABEL: Record<HeatmapMetric, string> = {
  pickups: "Pickups",
  drops: "Drops",
  unmet: "Unmet demand",
  fares: "Fares ₹",
};

export const METRIC_HINT: Record<HeatmapMetric, string> = {
  pickups: "Where trips start",
  drops: "Where finished trips end",
  unmet: "No driver found, or the rider gave up while searching: where more drivers are needed",
  fares: "₹ earned by drivers on finished trips (by pickup)",
};

/** Date-range presets → ISO from/to (to = now). */
export function presetRange(preset: "today" | "7d" | "30d", now = new Date()): { from: string; to: string } {
  const to = now.toISOString();
  if (preset === "today") {
    // Midnight IST (UTC+5:30), since Tamil Taxi runs in India.
    const ist = new Date(now.getTime() + 330 * 60_000);
    ist.setUTCHours(0, 0, 0, 0);
    return { from: new Date(ist.getTime() - 330 * 60_000).toISOString(), to };
  }
  const days = preset === "7d" ? 7 : 30;
  return { from: new Date(now.getTime() - days * 86_400_000).toISOString(), to };
}

/** Query string for /api/heatmap (drops empty values). */
export function heatQuery(q: HeatmapQuery): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  return params.toString();
}
