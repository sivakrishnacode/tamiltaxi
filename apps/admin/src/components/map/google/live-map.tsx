"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { useEffect, useRef } from "react";

import { vehicleLabel } from "@/lib/format";
import type { DemandCell, HeatmapMetric, LiveData, ServiceArea } from "@/lib/types";

import { SERVICE_AREA_EDGE, SERVICE_AREA_STYLE, VEHICLE_COLORS } from "../colors";
import { DemandLayer, type DemandHover } from "./demand-layer";
import { HeatOverlay } from "./heat-overlay";
import { HexLayer, HexOutline } from "./hex-layer";
import { TtMap } from "./tamiltaxi-map";

function LiveLayers({ data, focus, compact }: { data: LiveData; focus: { lat: number; lng: number } | null; compact: boolean }) {
  const map = useMap();
  const fitted = useRef(false);

  // Drivers (colour by vehicle, busy = coral ring) and pickups as Data points; trips as dashed polylines.
  useEffect(() => {
    if (!map) return;
    const points = new google.maps.Data({ map });
    points.setStyle((f) => {
      const isPickup = f.getProperty("pickup") === true;
      const isBusy = f.getProperty("busy") === true;
      return {
        clickable: !compact,
        title: String(f.getProperty("title") ?? ""),
        zIndex: isPickup ? 5 : 10,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: isPickup ? 4 : compact ? 5 : 7,
          fillColor: String(f.getProperty("color")),
          fillOpacity: 1,
          strokeColor: isBusy ? "#F4511E" : "#FFFFFF",
          strokeWeight: isBusy ? 4 : 2,
        },
      };
    });
    for (const d of data.drivers) {
      points.add({
        geometry: { lat: d.lat, lng: d.lng },
        properties: {
          color: VEHICLE_COLORS[d.vehicleKind] ?? "#1E293B",
          busy: !!d.activeTripId,
          title: `${d.name ?? "Driver"} · ${vehicleLabel(d.vehicleKind)} · ${d.plate}${d.activeTripId ? " · on a trip" : " · available"}`,
        },
      });
    }
    const lines = data.trips.map((t) => {
      points.add({ geometry: { lat: t.pickupLat, lng: t.pickupLng }, properties: { pickup: true, color: "#16A34A", title: `Pickup: ${t.pickupName}` } });
      return new google.maps.Polyline({
        map,
        path: [
          { lat: t.pickupLat, lng: t.pickupLng },
          { lat: t.dropLat, lng: t.dropLng },
        ],
        strokeOpacity: 0,
        clickable: false,
        icons: [
          {
            icon: { path: "M 0,-1 0,1", strokeOpacity: 0.85, strokeColor: t.status === "SEARCHING" ? "#F59E0B" : "#334155", scale: 2.5 },
            offset: "0",
            repeat: "12px",
          },
        ],
      });
    });
    return () => {
      points.setMap(null);
      lines.forEach((l) => l.setMap(null));
    };
  }, [map, data, compact]);

  // Fit once to whatever is live.
  useEffect(() => {
    if (!map || fitted.current) return;
    const pts = [
      ...data.drivers.map((d) => ({ lat: d.lat, lng: d.lng })),
      ...data.trips.flatMap((t) => [
        { lat: t.pickupLat, lng: t.pickupLng },
        { lat: t.dropLat, lng: t.dropLng },
      ]),
    ];
    if (pts.length === 0) return;
    fitted.current = true;
    if (pts.length === 1) {
      map.setCenter(pts[0]);
      map.setZoom(14);
      return;
    }
    const b = new google.maps.LatLngBounds();
    pts.forEach((p) => b.extend(p));
    map.fitBounds(b, 40);
  }, [map, data]);

  useEffect(() => {
    if (!map || !focus) return;
    map.panTo(focus);
    if ((map.getZoom() ?? 0) < 14) map.setZoom(14);
  }, [map, focus]);

  return null;
}

/** Online drivers and active trips on Google Maps; optional city hex overlay. */
export function LiveMap({
  data,
  area,
  center,
  focus,
  compact = false,
  className,
  heat = null,
  demand = null,
  onDemandHover,
  overlay,
}: {
  data: LiveData;
  area?: ServiceArea | null;
  center: [number, number];
  focus?: [number, number] | null;
  compact?: boolean;
  className?: string;
  /** Optional demand-heat background (last 30 days). */
  heat?: HeatmapMetric | null;
  /** Demand vs supply hexes (res 7); null = layer off. */
  demand?: readonly DemandCell[] | null;
  onDemandHover?: (h: DemandHover | null) => void;
  overlay?: React.ReactNode;
}) {
  return (
    <TtMap
      center={{ lat: center[0], lng: center[1] }}
      zoom={compact ? 11 : 12}
      className={className}
      options={compact ? { gestureHandling: "cooperative", zoomControl: false } : undefined}
      overlay={overlay}
    >
      {demand && <DemandLayer cells={demand} onHover={onDemandHover} />}
      {heat && <HeatOverlay metric={heat} opacity={0.45} />}
      {area && <HexLayer cells={area.cells} style={SERVICE_AREA_STYLE} />}
      {area && <HexOutline cells={area.cells} {...SERVICE_AREA_EDGE} />}
      <LiveLayers data={data} focus={focus ? { lat: focus[0], lng: focus[1] } : null} compact={compact} />
    </TtMap>
  );
}

