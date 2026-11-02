"use client";

import {
  CheckIcon,
  KeyboardIcon,
  LayersIcon,
  Maximize2Icon,
  Minimize2Icon,
  MinusIcon,
  PlusIcon,
  ScanIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { HeatOverlay } from "@/components/map/google/heat-overlay";
import { HexLayer, HexOutline, type HexLayerDef, type OutlineStyle } from "@/components/map/google/hex-layer";
import { PlaceSearch, type FoundPlace } from "@/components/map/google/place-search";
import { TtMap, type MapType } from "@/components/map/google/tamiltaxi-map";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCount } from "@/lib/format";
import { BRUSH_SIZES, MAX_POLYGON_CELLS, applyCells, circleCells, polygonAreaKm2, polygonCells } from "@/lib/hex";
import { cellsToKm2 } from "@/lib/validation";
import { METRIC_LABEL } from "@/lib/heat";
import { HEATMAP_METRICS, type HeatmapMetric } from "@/lib/types";
import { cn } from "@/lib/utils";

import { EditorInteractions, type BrushPreview } from "./editor-interactions";
import { PaintToolbar, type Tool } from "./paint-tools";
import type { CellEditor } from "./use-cell-editor";
import { ZoneLabels, type ZoneLabel } from "./zone-labels";

export interface LayerGroup {
  readonly key: "service" | "zones";
  readonly label: string;
  readonly layers: readonly HexLayerDef[];
}

const SHORTCUTS: [string, string][] = [
  ["P", "Paint (add hexagons)"],
  ["E", "Erase (remove hexagons)"],
  ["D", "Draw area (polygon)"],
  ["C", "Circle fill"],
  ["H / hold Space", "Pan the map"],
  ["[ and ]", "Smaller / bigger brush"],
  ["Esc", "Cancel the polygon or circle"],
  ["Ctrl+Z / Ctrl+Shift+Z", "Undo / redo"],
];

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

/**
 * Google map workbench for H3 cell sets: search + fly-to, brush painting with hover preview, polygon and circle
 * fills, layer toggles, grid, satellite, fit, fullscreen and keyboard shortcuts. [editor] null = view only.
 */
export function HexWorkbench({
  center,
  resolution,
  fitCells,
  editor,
  editStyle,
  editOutline,
  targetLabel,
  groups,
  warnCells = [],
  zoneLabels = [],
  status,
}: {
  center: { lat: number; lng: number };
  resolution: number;
  fitCells: readonly string[];
  editor: CellEditor | null;
  editStyle: HexLayerDef["style"];
  /** A line around the cells being edited. */
  editOutline?: OutlineStyle;
  /** "service area" or "zone": used in button labels. */
  targetLabel: string;
  groups: readonly LayerGroup[];
  /** Cells to outline in amber (e.g. zone cells outside the service area). */
  warnCells?: readonly string[];
  zoneLabels?: readonly ZoneLabel[];
  /** Extra text on the right of the toolbar (counts). */
  status?: React.ReactNode;
}) {
  const [brush, setBrush] = useState(0);
  const [visible, setVisible] = useState({ service: true, zones: true, labels: true, grid: false });
  const [mapType, setMapType] = useState<MapType>("roadmap");
  const [heat, setHeat] = useState<HeatmapMetric | "off">("off");
  const [isFullscreen, setFullscreen] = useState(false);
  const [fitKey, setFitKey] = useState(0);
  const [zoom, setZoom] = useState(12);
  const [preview, setPreview] = useState<BrushPreview | null>(null);
  const [place, setPlace] = useState<FoundPlace | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; key: number } | null>(null);
  const [polygon, setPolygon] = useState<[number, number][]>([]);
  const [closedPolygon, setClosedPolygon] = useState<[number, number][] | null>(null);
  const [circleCentre, setCircleCentre] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState("1");
  const heldTool = useRef<Tool | null>(null);

  const tool: Tool | null = editor ? editor.tool : null;
  const cellSet = useMemo(() => new Set(editor?.cells ?? []), [editor?.cells]);
  // Estimate first: a polygon drawn while zoomed out can cover tens of thousands of hexagons.
  const pendingEstimate = closedPolygon ? Math.round(polygonAreaKm2(closedPolygon) / cellsToKm2(1, resolution)) : 0;
  const isPendingTooLarge = pendingEstimate > MAX_POLYGON_CELLS;
  const pendingCells = useMemo(
    () => (closedPolygon && !isPendingTooLarge ? polygonCells(closedPolygon, resolution) : []),
    [closedPolygon, resolution, isPendingTooLarge],
  );
  // Preview fill only for moderate sizes; larger ones show the outline.
  const pendingPreview = pendingCells.length <= 5_000 ? pendingCells : [];
  const radiusKm = Number(radius);
  const isRadiusValid = radiusKm > 0 && radiusKm <= 30;
  const circleTarget = circleCentre ?? (place ? { lat: place.lat, lng: place.lng } : null);

  function setTool(t: Tool) {
    if (!editor) return;
    if (t !== "polygon") setPolygon([]);
    if (t !== "circle") setCircleCentre(null);
    editor.setTool(t);
  }

  function applyPending(mode: "add" | "remove") {
    if (!editor || pendingCells.length === 0) return;
    editor.commit(applyCells(editor.cells, pendingCells, mode));
    setClosedPolygon(null);
  }

  function applyCircle(mode: "add" | "remove") {
    if (!editor || !circleTarget || !isRadiusValid) return;
    editor.commit(applyCells(editor.cells, circleCells(circleTarget.lat, circleTarget.lng, radiusKm, resolution), mode));
  }

  // Keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z live in useCellEditor).
  const keyState = useRef({ editor, tool, polygon, closedPolygon, isFullscreen });
  useEffect(() => {
    keyState.current = { editor, tool, polygon, closedPolygon, isFullscreen };
  });
  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const s = keyState.current;
      if (e.key === "Escape") {
        if (s.polygon.length > 0 || s.closedPolygon) {
          setPolygon([]);
          setClosedPolygon(null);
        } else if (s.isFullscreen) setFullscreen(false);
        setCircleCentre(null);
        return;
      }
      if (!s.editor) return;
      const k = e.key.toLowerCase();
      if (e.key === " " && !e.repeat && s.tool !== "pan") {
        e.preventDefault();
        heldTool.current = s.tool;
        s.editor.setTool("pan");
        return;
      }
      const map: Record<string, Tool> = { p: "add", e: "remove", d: "polygon", h: "pan", c: "circle" };
      if (map[k]) {
        e.preventDefault();
        if (map[k] !== "polygon") setPolygon([]);
        s.editor.setTool(map[k]);
      } else if (e.key === "[") setBrush((b) => Math.max(0, b - 1));
      else if (e.key === "]") setBrush((b) => Math.min(BRUSH_SIZES.length - 1, b + 1));
    }
    function up(e: KeyboardEvent) {
      if (e.key === " " && heldTool.current) {
        keyState.current.editor?.setTool(heldTool.current);
        heldTool.current = null;
      }
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const showGroups = { service: visible.service, zones: visible.zones };

  const overlay = (
    <>
      <div className="pointer-events-none absolute inset-x-2 top-2 z-10 flex items-start justify-between gap-2">
        <PlaceSearch
          className="pointer-events-auto"
          onSelect={(p) => {
            setPlace(p);
            setCircleCentre(null);
            setFocus({ lat: p.lat, lng: p.lng, key: Date.now() });
          }}
        />
        <div className="pointer-events-auto flex flex-wrap justify-end gap-1.5">
          <div className="inline-flex rounded-lg border bg-card p-0.5 shadow-md">
            {(["roadmap", "hybrid"] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={mapType === t}
                onClick={() => setMapType(t)}
                className={cn("rounded-md px-2.5 py-1 text-xs font-medium text-navy-700", mapType === t && "bg-coral-50 text-coral-600")}
              >
                {t === "roadmap" ? "Map" : "Satellite"}
              </button>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="bg-card shadow-md">
                <LayersIcon /> <span className="hidden sm:inline">Layers</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Show on map</DropdownMenuLabel>
              {groups.map((g) => (
                <DropdownMenuCheckboxItem
                  key={g.key}
                  checked={visible[g.key]}
                  onCheckedChange={(v) => setVisible((s) => ({ ...s, [g.key]: !!v }))}
                  onSelect={(e) => e.preventDefault()}
                >
                  {g.label}
                </DropdownMenuCheckboxItem>
              ))}
              {zoneLabels.length > 0 && (
                <DropdownMenuCheckboxItem
                  checked={visible.labels}
                  onCheckedChange={(v) => setVisible((s) => ({ ...s, labels: !!v }))}
                  onSelect={(e) => e.preventDefault()}
                >
                  Labels (zones)
                </DropdownMenuCheckboxItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={visible.grid}
                onCheckedChange={(v) => setVisible((s) => ({ ...s, grid: !!v }))}
                onSelect={(e) => e.preventDefault()}
              >
                Hex grid (zoom ≥ 13)
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Demand heat (30 days)</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={heat} onValueChange={(v) => setHeat(v as HeatmapMetric | "off")}>
                <DropdownMenuRadioItem value="off" onSelect={(e) => e.preventDefault()}>
                  Off
                </DropdownMenuRadioItem>
                {HEATMAP_METRICS.map((m) => (
                  <DropdownMenuRadioItem key={m} value={m} onSelect={(e) => e.preventDefault()}>
                    {METRIC_LABEL[m]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="icon-sm" className="bg-card shadow-md" aria-label="Fit to service area" title="Fit to service area" onClick={() => setFitKey((k) => k + 1)}>
            <ScanIcon />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon-sm" className="bg-card shadow-md" aria-label="Keyboard shortcuts">
                <KeyboardIcon />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              <p className="mb-2 text-sm font-semibold text-navy-900">Shortcuts</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                {SHORTCUTS.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt>
                      <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">{k}</kbd>
                    </dt>
                    <dd className="text-navy-700">{v}</dd>
                  </div>
                ))}
              </dl>
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="icon-sm"
            className="bg-card shadow-md"
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={() => setFullscreen((f) => !f)}
          >
            {isFullscreen ? <Minimize2Icon /> : <Maximize2Icon />}
          </Button>
        </div>
      </div>

      {visible.grid && zoom < 13 && (
        <p className="pointer-events-none absolute top-14 left-1/2 z-10 -translate-x-1/2 rounded-full bg-navy-900/85 px-3 py-1 text-xs text-white">
          Zoom in to see the hex grid
        </p>
      )}

      {preview && tool && (tool === "add" || tool === "remove") && (
        <span
          className={cn(
            "pointer-events-none absolute z-20 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-white tabular-nums shadow",
            preview.mode === "add" ? "bg-coral-600" : "bg-error",
          )}
          style={{ left: preview.x + 14, top: preview.y + 14 }}
        >
          {preview.mode === "add" ? "+" : "−"}
          {preview.count}
        </span>
      )}

      {editor && tool === "polygon" && !closedPolygon && (
        <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-navy-900/85 px-3 py-1.5 text-xs text-white">
          {polygon.length === 0
            ? "Click to start drawing the area"
            : polygon.length < 3
              ? `${polygon.length} point${polygon.length > 1 ? "s" : ""} · keep clicking`
              : "Double-click or click the first point to close · Esc to cancel"}
        </p>
      )}

      {(closedPolygon || (editor && tool === "circle") || place) && (
        <div className="absolute inset-x-2 bottom-3 z-10 flex justify-center">
          <div className="flex max-w-full flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm shadow-lg">
            {closedPolygon ? (
              <>
                <span className={cn("font-medium", isPendingTooLarge ? "text-error" : "text-navy-900")}>
                  {isPendingTooLarge
                    ? `Too large: about ${formatCount(pendingEstimate)} hexagons (max ${formatCount(MAX_POLYGON_CELLS)}). Zoom in and draw a smaller area.`
                    : `Drawn area: ${formatCount(pendingCells.length)} hexagons`}
                </span>
                <Button size="sm" onClick={() => applyPending("add")} disabled={!editor || pendingCells.length === 0}>
                  <PlusIcon /> Add to {targetLabel}
                </Button>
                <Button size="sm" variant="outline" onClick={() => applyPending("remove")} disabled={!editor || pendingCells.length === 0}>
                  <MinusIcon /> Remove from {targetLabel}
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Discard drawn area" onClick={() => setClosedPolygon(null)}>
                  <XIcon />
                </Button>
              </>
            ) : (
              <>
                <span className="max-w-56 truncate font-medium text-navy-900">
                  {tool === "circle" && circleCentre ? "Circle centre" : place ? place.name : "Click the map to set a centre"}
                </span>
                {editor && circleTarget && (
                  <>
                    <span className="flex items-center gap-1">
                      <Input
                        aria-label="Radius in km"
                        inputMode="decimal"
                        value={radius}
                        onChange={(e) => setRadius(e.target.value)}
                        className="h-8 w-16"
                      />
                      <span className="text-xs text-muted-foreground">km</span>
                    </span>
                    <Button size="sm" onClick={() => applyCircle("add")} disabled={!isRadiusValid}>
                      <PlusIcon /> Add area around here
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => applyCircle("remove")} disabled={!isRadiusValid}>
                      <MinusIcon /> Remove
                    </Button>
                  </>
                )}
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Close"
                  onClick={() => {
                    setPlace(null);
                    setCircleCentre(null);
                  }}
                >
                  <XIcon />
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-xl border bg-card", isFullscreen && "fixed inset-0 z-50 rounded-none border-0")}>
      {editor && (
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <PaintToolbar
            tool={editor.tool}
            onTool={setTool}
            brush={brush}
            onBrush={setBrush}
            canUndo={editor.canUndo}
            canRedo={editor.canRedo}
            onUndo={editor.undo}
            onRedo={editor.redo}
          />
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">{status}</div>
        </div>
      )}
      <TtMap
        center={center}
        mapType={mapType}
        className={cn("rounded-none", isFullscreen ? "flex-1" : "h-[calc(100vh-22rem)] min-h-[600px]")}
        overlay={overlay}
      >
        {heat !== "off" && <HeatOverlay metric={heat} />}
        {groups.flatMap((g) =>
          g.layers.flatMap((l) => {
            const isShown = showGroups[g.key] && l.visible !== false;
            const layer = <HexLayer key={l.id} cells={l.cells} style={l.style} zIndex={l.zIndex ?? 2} visible={isShown} />;
            return l.outline ? [layer, <HexOutline key={`${l.id}-edge`} cells={l.cells} {...l.outline} zIndex={l.zIndex ?? 2} visible={isShown} />] : [layer];
          }),
        )}
        {editor && <HexLayer cells={editor.cells} style={editStyle} zIndex={10} />}
        {editor && editOutline && <HexOutline cells={editor.cells} {...editOutline} zIndex={10} />}
        <HexLayer cells={warnCells} style={{ color: "#F59E0B", fillColor: "#FEF3C7", fillOpacity: 0.35, weight: 2 }} zIndex={12} />
        <HexLayer cells={pendingPreview} style={{ color: "#1E293B", fillColor: "#1E293B", fillOpacity: 0.15, weight: 1.5 }} zIndex={20} />
        {visible.labels && zoneLabels.length > 0 && <ZoneLabels labels={zoneLabels} />}
        <EditorInteractions
          resolution={resolution}
          tool={tool}
          brush={brush}
          cells={cellSet}
          onStrokeStart={() => editor?.paint.onStrokeStart()}
          onCells={(c, m) => editor?.paint.onCells(c, m)}
          onStrokeEnd={() => editor?.paint.onStrokeEnd()}
          onPreview={setPreview}
          polygon={polygon}
          onPolygonPoint={(p) => {
            setClosedPolygon(null);
            setPolygon((pts) => [...pts, p]);
          }}
          closedPolygon={closedPolygon}
          onPolygonClose={() => {
            // A double-click adds the same point twice; drop near-duplicates before closing.
            const clean = polygon.filter((p, i) => i === 0 || Math.hypot(p[0] - polygon[i - 1][0], p[1] - polygon[i - 1][1]) > 1e-6);
            if (clean.length >= 3) setClosedPolygon(clean);
            setPolygon([]);
          }}
          onPick={(lat, lng) => setCircleCentre({ lat, lng })}
          circle={editor && tool === "circle" && circleTarget && isRadiusValid ? { ...circleTarget, radiusKm } : null}
          place={place ? { lat: place.lat, lng: place.lng } : null}
          focus={focus}
          fitCells={fitCells}
          fitKey={fitKey}
          showGrid={visible.grid}
          onZoom={setZoom}
        />
      </TtMap>
      {editor && tool !== "pan" && (
        <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">
          <CheckIcon className="mr-1 inline size-3" />
          {tool === "add" || tool === "remove"
            ? `Brush ${BRUSH_SIZES[brush].cells} hexagon${brush ? "s" : ""}: click or drag to ${tool === "add" ? "add" : "remove"}. Scroll to zoom; hold Space to pan.`
            : tool === "polygon"
              ? "Draw area: click points around a neighbourhood, then add it or remove it."
              : "Circle: click the map (or search a place) to set the centre."}
        </p>
      )}
    </div>
  );
}
