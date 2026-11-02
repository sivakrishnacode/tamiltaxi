import type { VehicleKind } from "@/lib/types";

/** Marker colour per vehicle kind (legend on the Live page uses the same map). */
export const VEHICLE_COLORS: Record<VehicleKind, string> = {
  BIKE: "#D84315",
  SCOOTY: "#EA580C",
  AUTO: "#F59E0B",
  AUTO_PRIORITY: "#CA8A04",
  CAB: "#1E293B",
  SEDAN: "#334155",
  SUV: "#0F766E",
  GOODS_BIKE: "#16A34A",
  SCOOTY_PARCEL: "#15803D",
  AUTO_PARCEL: "#B45309",
  THREE_WHEELER: "#0EA5E9",
  MINI_TRUCK: "#7C3AED",
  PICKUP: "#DB2777",
  TRUCK: "#64748B",
};

/** The service area under other data (zones, heat, drivers): a faint slate wash and one slate edge, no hexagon grid. */
export const SERVICE_AREA_STYLE = { color: "#475569", fillColor: "#64748B", fillOpacity: 0.06, weight: 0 } as const;
export const SERVICE_AREA_EDGE = { color: "#475569", weight: 2, opacity: 0.8 } as const;
