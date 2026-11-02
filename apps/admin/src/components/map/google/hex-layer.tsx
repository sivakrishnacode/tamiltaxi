"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { useEffect, useRef } from "react";

import { cellsOutline, hexBoundary } from "@/lib/hex";

export interface HexStyle {
  readonly color: string;
  readonly fillColor?: string;
  readonly fillOpacity: number;
  readonly weight: number;
  readonly opacity?: number;
}

/** One line around the whole cell set, so an area reads as one shape instead of a grid of hexagons. */
export interface OutlineStyle {
  readonly color: string;
  readonly weight: number;
  readonly opacity?: number;
}

export interface HexLayerDef {
  readonly id: string;
  readonly cells: readonly string[];
  readonly style: HexStyle;
  readonly outline?: OutlineStyle;
  readonly zIndex?: number;
  readonly visible?: boolean;
}

/** GeoJSON polygon for an H3 cell ([lng, lat] order, closed ring). */
interface PolygonFeature {
  readonly type: "Feature";
  readonly id: string;
  readonly properties: Record<string, never>;
  readonly geometry: { readonly type: "Polygon"; readonly coordinates: number[][][] };
}

function cellFeature(cell: string): PolygonFeature {
  const ring = hexBoundary(cell).map(([lat, lng]) => [lng, lat]);
  ring.push(ring[0]);
  return { type: "Feature", id: cell, properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

/**
 * One google.maps.Data layer per hex layer. Cell lists are diffed, so painting one hex adds one feature instead of
 * rebuilding thousands; bulk additions go through a single addGeoJson call.
 */
export function HexLayer({ cells, style, zIndex = 1, visible = true }: Omit<HexLayerDef, "id">) {
  const map = useMap();
  const layer = useRef<google.maps.Data | null>(null);
  const features = useRef(new Map<string, google.maps.Data.Feature>());

  useEffect(() => {
    if (!map) return;
    const data = new google.maps.Data();
    layer.current = data;
    const current = features.current;
    return () => {
      data.setMap(null);
      current.clear();
      layer.current = null;
    };
  }, [map]);

  useEffect(() => {
    layer.current?.setMap(visible && map ? map : null);
  }, [map, visible]);

  useEffect(() => {
    layer.current?.setStyle({
      clickable: false,
      fillColor: style.fillColor ?? style.color,
      fillOpacity: style.fillOpacity,
      strokeColor: style.color,
      strokeOpacity: style.opacity ?? 1,
      strokeWeight: style.weight,
      zIndex,
    });
  }, [map, style.color, style.fillColor, style.fillOpacity, style.weight, style.opacity, zIndex]);

  useEffect(() => {
    const data = layer.current;
    if (!data) return;
    const next = new Set(cells);
    for (const [cell, feature] of features.current) {
      if (!next.has(cell)) {
        data.remove(feature);
        features.current.delete(cell);
      }
    }
    const added = [...next].filter((c) => !features.current.has(c));
    if (added.length > 0) {
      const created = data.addGeoJson({ type: "FeatureCollection", features: added.map(cellFeature) });
      for (const f of created) features.current.set(String(f.getId()), f);
    }
  }, [map, cells]);

  return null;
}

/** The outer edge (and holes) of [cells] as one line, drawn above the cells' own fill. */
export function HexOutline({ cells, color, weight, opacity = 1, zIndex = 1, visible = true }: OutlineStyle & { cells: readonly string[]; zIndex?: number; visible?: boolean }) {
  const map = useMap();
  const layer = useRef<google.maps.Data | null>(null);

  useEffect(() => {
    if (!map) return;
    const data = new google.maps.Data();
    layer.current = data;
    return () => {
      data.setMap(null);
      layer.current = null;
    };
  }, [map]);

  useEffect(() => {
    layer.current?.setMap(visible && map ? map : null);
  }, [map, visible]);

  useEffect(() => {
    layer.current?.setStyle({ clickable: false, fillOpacity: 0, strokeColor: color, strokeOpacity: opacity, strokeWeight: weight, zIndex });
  }, [map, color, opacity, weight, zIndex]);

  useEffect(() => {
    const data = layer.current;
    if (!data) return;
    const old: google.maps.Data.Feature[] = [];
    data.forEach((f) => old.push(f));
    for (const f of old) data.remove(f);
    const coordinates = cellsOutline(cells);
    if (coordinates.length) data.addGeoJson({ type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates } });
  }, [map, cells]);

  return null;
}
