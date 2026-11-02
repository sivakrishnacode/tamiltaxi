import type { CSSProperties } from "react";

import { humanize } from "./format";
import { cellsCentre } from "./hex";
import type { Zone, ZoneKind } from "./types";
import { zoneState } from "./zone-rules";

/**
 * One colour per zone kind, chosen to differ from each other and from the grey map, its white roads and the coral
 * service area. The kind decides the colour, so the map reads the same in every city.
 */
export const ZONE_COLORS: Record<ZoneKind, string> = {
  SURGE: "#DC2626",
  DEMAND: "#7C3AED",
  PICKUP_POINT: "#0891B2",
  NO_SERVICE: "#1F2937",
};

/** Swatch for a zone in a list or legend: its colour, hatched for no-service zones. */
export function zoneSwatch(kind: ZoneKind): CSSProperties {
  return kind === "NO_SERVICE" ? { background: `repeating-linear-gradient(45deg,${ZONE_COLORS.NO_SERVICE} 0 2px,#E5E7EB 2px 5px)` } : { background: ZONE_COLORS[kind] };
}

/** Map label for a zone: short name, surge badge, full text on hover; placed at its largest cluster's centre. */
export function zoneLabel(z: Zone) {
  const c = cellsCentre(z.cells);
  if (!c) return null;
  const name = z.name.replace(/^high demand:\s*/i, "").trim() || z.name;
  const isSurge = z.kind === "SURGE";
  return {
    id: z.id,
    ...c,
    text: name,
    badge: isSurge ? `${Number(z.surgeMultiplier.toFixed(2))}×` : undefined,
    title: `${z.name} · ${humanize(z.kind)}${isSurge ? ` ${z.surgeMultiplier.toFixed(2)}×` : ""}${z.isActive ? "" : " · paused"}`,
    color: ZONE_COLORS[z.kind],
    // Live zones win label space, then ones outside their hours; ended or paused ones only where there's room.
    priority: { live: 200_000, off: 100_000, upcoming: 100_000, ended: 0, paused: 0 }[zoneState(z)] + z.cells.length,
  };
}
