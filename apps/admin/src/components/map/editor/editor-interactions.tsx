"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { HexLayer } from "@/components/map/google/hex-layer";
import { brushCells, cellAt, cellsBounds, viewportCells } from "@/lib/hex";

import type { Tool } from "./paint-tools";

export interface BrushPreview {
  readonly x: number;
  readonly y: number;
  readonly count: number;
  readonly mode: "add" | "remove";
}

export interface EditorInteractionsProps {
  readonly resolution: number;
  readonly tool: Tool | null;
  readonly brush: number;
  /** Current editable cells (the brush preview only shows hexes that would change). */
  readonly cells: ReadonlySet<string>;
  readonly onStrokeStart: () => void;
  readonly onCells: (cells: readonly string[], mode: "add" | "remove") => void;
  readonly onStrokeEnd: () => void;
  readonly onPreview: (p: BrushPreview | null) => void;
  /** Polygon being drawn ([lat, lng]); the parent owns it so Esc / buttons can reset it. */
  readonly polygon: readonly [number, number][];
  readonly onPolygonPoint: (p: [number, number]) => void;
  readonly onPolygonClose: () => void;
  /** A finished polygon waiting for Add / Remove (drawn as a dashed outline). */
  readonly closedPolygon: readonly [number, number][] | null;
  readonly onPick: (lat: number, lng: number) => void;
  readonly circle: { lat: number; lng: number; radiusKm: number } | null;
  readonly place: { lat: number; lng: number } | null;
  readonly focus: { lat: number; lng: number; key: number } | null;
  readonly fitCells: readonly string[];
  readonly fitKey: number;
  /** Cells to move the map to (a zone picked in a list), each time [key] changes. */
  readonly showCells: { readonly cells: readonly string[]; readonly key: number } | null;
  readonly showGrid: boolean;
  readonly onZoom: (zoom: number) => void;
}

const PREVIEW_ADD = { color: "#D84315", fillOpacity: 0.12, weight: 2 } as const;
const PREVIEW_REMOVE = { color: "#B91C1C", fillColor: "#FEE2E2", fillOpacity: 0.35, weight: 2 } as const;
const GRID_STYLE = { color: "#94A3B8", fillOpacity: 0, weight: 0.6, opacity: 0.7 } as const;
/** Closest zoom when moving to picked cells, so a station-sized zone still shows its streets. */
const MAX_SHOW_ZOOM = 16;

/** Mouse/touch/pen painting, brush hover preview, polygon drawing, circle picking, grid, fit and fly-to. */
export function EditorInteractions(props: EditorInteractionsProps) {
  const map = useMap();
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const projection = useRef<google.maps.OverlayView | null>(null);
  const [previewCells, setPreviewCells] = useState<string[]>([]);
  const [gridCells, setGridCells] = useState<string[]>([]);
  const { tool, showGrid } = props;
  const isBrush = tool === "add" || tool === "remove";

  // Empty OverlayView = access to pixel ↔ lat/lng projection for pointer events.
  useEffect(() => {
    if (!map) return;
    const ov = new google.maps.OverlayView();
    ov.onAdd = () => {};
    ov.draw = () => {};
    ov.onRemove = () => {};
    ov.setMap(map);
    projection.current = ov;
    return () => {
      ov.setMap(null);
      projection.current = null;
    };
  }, [map]);

  // Tool → map behaviour: no panning while painting (wheel zoom is handled below), crosshair cursor, no dbl-click zoom when drawing.
  useEffect(() => {
    if (!map) return;
    map.setOptions({
      gestureHandling: isBrush ? "none" : "greedy",
      draggableCursor: tool && tool !== "pan" ? "crosshair" : null,
      disableDoubleClickZoom: tool === "polygon",
    });
    const div = map.getDiv() as HTMLElement | undefined;
    if (div) div.style.touchAction = isBrush ? "none" : "";
  }, [map, tool, isBrush]);

  // Pointer painting (mouse, touch, pen) with a k-ring brush.
  useEffect(() => {
    const div = map?.getDiv() as HTMLElement | undefined;
    if (!map || !isBrush || !div) return;
    let isPainting = false;
    let last: string | null = null;
    let frame = 0;

    const toCell = (e: PointerEvent): string | null => {
      const proj = projection.current?.getProjection();
      if (!proj) return null;
      const rect = div.getBoundingClientRect();
      const ll = proj.fromContainerPixelToLatLng(new google.maps.Point(e.clientX - rect.left, e.clientY - rect.top));
      return ll ? cellAt(ll.lat(), ll.lng(), latest.current.resolution) : null;
    };
    const mode = (): "add" | "remove" => (latest.current.tool === "remove" ? "remove" : "add");
    const isOnControl = (e: PointerEvent) => !!(e.target as Element | null)?.closest?.(".gmnoprint, .gm-style-cc, button, a");

    const preview = (e: PointerEvent, cell: string | null) => {
      if (!cell) return;
      const m = mode();
      const set = latest.current.cells;
      const changed = brushCells(cell, latest.current.brush).filter((c) => (m === "add" ? !set.has(c) : set.has(c)));
      setPreviewCells(changed);
      const rect = div.getBoundingClientRect();
      latest.current.onPreview({ x: e.clientX - rect.left, y: e.clientY - rect.top, count: changed.length, mode: m });
    };

    const paint = (cell: string | null) => {
      if (!cell || cell === last) return;
      last = cell;
      latest.current.onCells(brushCells(cell, latest.current.brush), mode());
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || isOnControl(e)) return;
      e.preventDefault();
      e.stopPropagation();
      div.setPointerCapture(e.pointerId);
      isPainting = true;
      last = null;
      latest.current.onStrokeStart();
      paint(toCell(e));
    };
    const onMove = (e: PointerEvent) => {
      if (isOnControl(e) && !isPainting) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const cell = toCell(e);
        if (isPainting) paint(cell);
        if (e.pointerType === "mouse" || isPainting) preview(e, cell);
      });
    };
    const onUp = (e: PointerEvent) => {
      if (!isPainting) return;
      isPainting = false;
      last = null;
      if (div.hasPointerCapture(e.pointerId)) div.releasePointerCapture(e.pointerId);
      latest.current.onStrokeEnd();
    };
    const onLeave = () => {
      if (isPainting) return;
      setPreviewCells([]);
      latest.current.onPreview(null);
    };
    // Gesture handling is off while painting, so zoom with the wheel ourselves.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const z = map.getZoom() ?? 12;
      map.setZoom(Math.max(3, Math.min(20, z + (e.deltaY < 0 ? 1 : -1))));
    };

    div.addEventListener("pointerdown", onDown, true);
    div.addEventListener("pointermove", onMove, true);
    div.addEventListener("pointerup", onUp, true);
    div.addEventListener("pointercancel", onUp, true);
    div.addEventListener("pointerleave", onLeave, true);
    div.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      div.removeEventListener("pointerdown", onDown, true);
      div.removeEventListener("pointermove", onMove, true);
      div.removeEventListener("pointerup", onUp, true);
      div.removeEventListener("pointercancel", onUp, true);
      div.removeEventListener("pointerleave", onLeave, true);
      div.removeEventListener("wheel", onWheel);
      setPreviewCells([]);
      latest.current.onPreview(null);
    };
  }, [map, isBrush]);

  // Map clicks: polygon vertices (click near the first point closes) and circle centre.
  useEffect(() => {
    if (!map || (tool !== "polygon" && tool !== "circle")) return;
    const click = map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const p: [number, number] = [e.latLng.lat(), e.latLng.lng()];
      if (latest.current.tool === "circle") {
        latest.current.onPick(p[0], p[1]);
        return;
      }
      const pts = latest.current.polygon;
      const proj = projection.current?.getProjection();
      if (pts.length >= 3 && proj) {
        const a = proj.fromLatLngToContainerPixel(new google.maps.LatLng(pts[0][0], pts[0][1]));
        const b = proj.fromLatLngToContainerPixel(e.latLng);
        if (a && b && Math.hypot(a.x - b.x, a.y - b.y) < 14) {
          latest.current.onPolygonClose();
          return;
        }
      }
      latest.current.onPolygonPoint(p);
    });
    const dbl = map.addListener("dblclick", () => {
      if (latest.current.tool === "polygon" && latest.current.polygon.length >= 3) latest.current.onPolygonClose();
    });
    return () => {
      click?.remove();
      dbl?.remove();
    };
  }, [map, tool]);

  // Polygon drawing: outline + rubber band to the cursor.
  const [hover, setHover] = useState<[number, number] | null>(null);
  useEffect(() => {
    if (!map || tool !== "polygon") return;
    const move = map.addListener("mousemove", (e: google.maps.MapMouseEvent) => e.latLng && setHover([e.latLng.lat(), e.latLng.lng()]));
    return () => {
      move?.remove();
      setHover(null);
    };
  }, [map, tool]);

  const polygonPath = useMemo(() => {
    const pts = props.polygon.map(([lat, lng]) => ({ lat, lng }));
    if (tool === "polygon" && hover && pts.length > 0) pts.push({ lat: hover[0], lng: hover[1] });
    return pts;
  }, [props.polygon, hover, tool]);

  useEffect(() => {
    if (!map || polygonPath.length === 0) return;
    const shape = new google.maps.Polygon({
      map,
      paths: polygonPath,
      strokeColor: "#1E293B",
      strokeWeight: 2,
      fillColor: "#1E293B",
      fillOpacity: 0.08,
      clickable: false,
      zIndex: 50,
    });
    const dots = new google.maps.Data({ map });
    dots.setStyle((f) => ({
      clickable: false,
      zIndex: 60,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: f.getProperty("first") ? 7 : 5,
        fillColor: f.getProperty("first") ? "#D84315" : "#FFFFFF",
        fillOpacity: 1,
        strokeColor: "#1E293B",
        strokeWeight: 2,
      },
    }));
    props.polygon.forEach(([lat, lng], i) => dots.add({ geometry: { lat, lng }, properties: { first: i === 0 } }));
    return () => {
      shape.setMap(null);
      dots.setMap(null);
    };
  }, [map, polygonPath, props.polygon]);

  // Finished polygon outline.
  const { closedPolygon } = props;
  useEffect(() => {
    if (!map || !closedPolygon || closedPolygon.length < 3) return;
    const shape = new google.maps.Polygon({
      map,
      paths: closedPolygon.map(([lat, lng]) => ({ lat, lng })),
      strokeColor: "#1E293B",
      strokeWeight: 2,
      fillColor: "#1E293B",
      fillOpacity: 0.06,
      clickable: false,
      zIndex: 50,
    });
    return () => shape.setMap(null);
  }, [map, closedPolygon]);

  // Circle preview.
  const { circle } = props;
  useEffect(() => {
    if (!map || !circle || !(circle.radiusKm > 0)) return;
    const c = new google.maps.Circle({
      map,
      center: { lat: circle.lat, lng: circle.lng },
      radius: circle.radiusKm * 1000,
      strokeColor: "#1E293B",
      strokeWeight: 1.5,
      strokeOpacity: 0.9,
      fillColor: "#1E293B",
      fillOpacity: 0.05,
      clickable: false,
      zIndex: 40,
    });
    return () => c.setMap(null);
  }, [map, circle]);

  // Search result marker.
  const { place } = props;
  useEffect(() => {
    if (!map || !place) return;
    const layer = new google.maps.Data({ map });
    layer.setStyle({
      clickable: false,
      zIndex: 70,
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: "#D84315", fillOpacity: 1, strokeColor: "#FFFFFF", strokeWeight: 3 },
    });
    layer.add({ geometry: place });
    return () => layer.setMap(null);
  }, [map, place]);

  // Fly to a search result.
  const { focus } = props;
  useEffect(() => {
    if (!map || !focus) return;
    map.panTo({ lat: focus.lat, lng: focus.lng });
    map.setZoom(15);
  }, [map, focus]);

  // Move to cells picked in a list: fit them with room around, never closer than [MAX_SHOW_ZOOM].
  const showKey = props.showCells?.key;
  useEffect(() => {
    const cells = latest.current.showCells?.cells;
    if (!map || showKey === undefined || !cells?.length) return;
    const b = cellsBounds(cells);
    if (!b) return;
    map.fitBounds(b, 96);
    const once = google.maps.event.addListenerOnce(map, "idle", () => {
      if ((map.getZoom() ?? 0) > MAX_SHOW_ZOOM) map.setZoom(MAX_SHOW_ZOOM);
    });
    return () => once.remove();
  }, [map, showKey]);

  // Fit to the service area on open and on "Fit" clicks.
  const { fitKey } = props;
  useEffect(() => {
    if (!map) return;
    const b = cellsBounds(latest.current.fitCells, { trim: true });
    if (b) map.fitBounds(b, 32);
  }, [map, fitKey]);

  // Zoom tracking + viewport grid (zoom ≥ 13, outlines only, capped by viewportCells).
  useEffect(() => {
    if (!map) return;
    const update = () => {
      const zoom = map.getZoom() ?? 0;
      latest.current.onZoom(zoom);
      const b = map.getBounds();
      if (!showGrid || zoom < 13 || !b) {
        setGridCells([]);
        return;
      }
      const ne = b.getNorthEast();
      const sw = b.getSouthWest();
      setGridCells(viewportCells({ south: sw.lat(), west: sw.lng(), north: ne.lat(), east: ne.lng() }, latest.current.resolution) ?? []);
    };
    const first = setTimeout(update, 0);
    const idle = map.addListener("idle", update);
    return () => {
      clearTimeout(first);
      idle?.remove();
    };
  }, [map, showGrid]);

  return (
    <>
      <HexLayer cells={gridCells} style={GRID_STYLE} zIndex={1} />
      <HexLayer cells={isBrush ? previewCells : []} style={tool === "remove" ? PREVIEW_REMOVE : PREVIEW_ADD} zIndex={30} />
    </>
  );
}
