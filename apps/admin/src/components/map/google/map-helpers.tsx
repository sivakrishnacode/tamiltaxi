"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { useEffect, useRef } from "react";

import { cellsBounds, hexBoundary } from "@/lib/hex";

/** Pans/zooms to a point whenever [target.key] changes. */
export function FlyTo({ target, zoom = 14 }: { target: { lat: number; lng: number; key: number } | null; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !target) return;
    map.panTo({ lat: target.lat, lng: target.lng });
    if ((map.getZoom() ?? 0) < zoom) map.setZoom(zoom);
  }, [map, target, zoom]);
  return null;
}

/** Closest zoom an automatic fit goes to (a res-8 hexagon is then about 100 px across). */
const MAX_FIT_ZOOM = 14;

/** Fits the map to a set of cells once (and again when [fitKey] changes). */
export function FitCells({ cells, fitKey = 0 }: { cells: readonly string[]; fitKey?: number }) {
  const map = useMap();
  const latest = useRef(cells);
  useEffect(() => {
    latest.current = cells;
  });
  const isDone = useRef(false);
  useEffect(() => {
    if (!map) return;
    if (isDone.current && fitKey === 0) return;
    const b = cellsBounds(latest.current, { trim: true });
    if (!b) return;
    isDone.current = true;
    map.fitBounds(b, 40);
    // A handful of hexagons (one busy cell) would zoom to street level: stop the fit at neighbourhood level.
    google.maps.event.addListenerOnce(map, "idle", () => {
      if ((map.getZoom() ?? 0) > MAX_FIT_ZOOM) map.setZoom(MAX_FIT_ZOOM);
    });
  }, [map, fitKey, cells.length]);
  return null;
}

/** Dashed outlines (Data layers can't dash), e.g. demand outside the service area. Keep to ~a few hundred cells. */
export function DashedOutlines({ cells, color = "#F59E0B" }: { cells: readonly string[]; color?: string }) {
  const map = useMap();
  useEffect(() => {
    if (!map || cells.length === 0) return;
    const lines = cells.slice(0, 500).map((c) => {
      const path = hexBoundary(c).map(([lat, lng]) => ({ lat, lng }));
      path.push(path[0]);
      return new google.maps.Polyline({
        map,
        path,
        clickable: false,
        strokeOpacity: 0,
        zIndex: 30,
        icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: color, strokeWeight: 3, scale: 2 }, offset: "0", repeat: "8px" }],
      });
    });
    return () => lines.forEach((l) => l.setMap(null));
  }, [map, cells, color]);
  return null;
}
