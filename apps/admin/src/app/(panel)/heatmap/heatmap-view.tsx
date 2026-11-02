"use client";

import { FlameIcon, HexagonIcon, Loader2Icon, MapPlusIcon, MousePointerClickIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Bar, BarChart, XAxis } from "recharts";
import { toast } from "sonner";

import { SERVICE_AREA_EDGE, SERVICE_AREA_STYLE } from "@/components/map/colors";
import { DashedOutlines, FitCells, FlyTo } from "@/components/map/google/map-helpers";
import { HeatLayer, type HeatHover } from "@/components/map/google/heat-layer";
import { HexLayer, HexOutline } from "@/components/map/google/hex-layer";
import { TtMap, type MapType } from "@/components/map/google/tamiltaxi-map";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { formatCount, formatInr, vehicleLabel } from "@/lib/format";
import { METRIC_HINT, METRIC_LABEL, heatLegend, heatQuery, presetRange } from "@/lib/heat";
import { applyCells, cellAt, cellCentre, toResolution } from "@/lib/hex";
import { HEATMAP_METRICS, VEHICLE_KINDS, type Heatmap, type HeatmapMetric, type HeatmapQuery, type TripKind, type VehicleKind } from "@/lib/types";
import { useHeatmap } from "@/lib/use-heatmap";
import { cn } from "@/lib/utils";
import { cityView } from "@/lib/map-view";
import { ZONE_COLORS } from "@/lib/zone-label";

import { createZone, saveServiceCells } from "../actions";

export interface HeatCity {
  readonly id: string;
  readonly name: string;
  readonly h3Resolution: number;
  readonly centerLat: number;
  readonly centerLng: number;
  readonly serviceCells: string[];
}

type Preset = "today" | "7d" | "30d" | "custom";

const RESOLUTIONS = [
  { value: 8, label: "Street (res 8)" },
  { value: 7, label: "Area (res 7)" },
  { value: 6, label: "District (res 6)" },
];

const HOUR_PRESETS: { label: string; range: [number, number] }[] = [
  { label: "All day", range: [0, 23] },
  { label: "Morning peak", range: [7, 10] },
  { label: "Evening peak", range: [17, 20] },
];

const chartConfig = { value: { label: "Total", color: "var(--chart-1)" } } satisfies ChartConfig;

function fmtValue(metric: HeatmapMetric, v: number): string {
  return metric === "fares" ? formatInr(v) : formatCount(v);
}

/** Which active city a cell belongs to (by its centre), if any. */
function cityOf(cell: string, cities: readonly HeatCity[], sets: ReadonlyMap<string, Set<string>>): HeatCity | null {
  const { lat, lng } = cellCentre(cell);
  for (const c of cities) if (sets.get(c.id)?.has(cellAt(lat, lng, c.h3Resolution))) return c;
  return null;
}

function nearestCity(cell: string, cities: readonly HeatCity[]): HeatCity | null {
  const { lat, lng } = cellCentre(cell);
  let best: HeatCity | null = null;
  let bestD = Infinity;
  for (const c of cities) {
    const d = (c.centerLat - lat) ** 2 + (c.centerLng - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Hour-of-day totals in 3-hour buckets (8 small requests at district resolution). */
function useHourBuckets(base: HeatmapQuery) {
  const [buckets, setBuckets] = useState<{ label: string; value: number }[] | null>(null);
  const key = heatQuery({ ...base, hourFrom: undefined, hourTo: undefined, resolution: 5 });
  useEffect(() => {
    let isCancelled = false;
    const timer = setTimeout(async () => {
      try {
        const rows = await Promise.all(
          Array.from({ length: 8 }, async (_, i) => {
            const res = await fetch(`/api/heatmap?${key}&hourFrom=${i * 3}&hourTo=${i * 3 + 2}`, { cache: "no-store" });
            const body = (await res.json()) as Heatmap;
            return { label: `${String(i * 3).padStart(2, "0")}–${String(i * 3 + 2).padStart(2, "0")}`, value: res.ok ? body.total : 0 };
          }),
        );
        if (!isCancelled) setBuckets(rows);
      } catch {
        if (!isCancelled) setBuckets(null);
      }
    }, 600);
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [key]);
  return buckets;
}

export function HeatmapView({
  initial,
  initialPreset = "30d",
  cities,
}: {
  /** The first layer: its metric and range open selected. */
  initial: Heatmap;
  initialPreset?: Exclude<Preset, "custom">;
  cities: HeatCity[];
}) {
  const router = useRouter();
  const [metric, setMetric] = useState<HeatmapMetric>(initial.metric);
  const [preset, setPreset] = useState<Preset>(initialPreset);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [hours, setHours] = useState<[number, number]>([0, 23]);
  const [kind, setKind] = useState<TripKind | "ALL">("ALL");
  const [vehicle, setVehicle] = useState<VehicleKind | "ALL">("ALL");
  const [resolution, setResolution] = useState(8);
  const [mapType, setMapType] = useState<MapType>("roadmap");
  const [showService, setShowService] = useState(true);
  const [hover, setHover] = useState<HeatHover | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [focus, setFocus] = useState<{ lat: number; lng: number; key: number } | null>(null);
  const [dialog, setDialog] = useState<"zone" | "service" | null>(null);

  // Date range is computed when the filter changes (not on every render) so the query key stays stable.
  const [range, setRange] = useState(() => ({ from: initial.from, to: initial.to }));
  function choosePreset(p: Preset) {
    setPreset(p);
    if (p !== "custom") setRange(presetRange(p));
  }
  useEffect(() => {
    if (preset !== "custom" || !customFrom || !customTo) return;
    const from = new Date(`${customFrom}T00:00:00+05:30`);
    const to = new Date(`${customTo}T23:59:59+05:30`);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to) {
      const t = setTimeout(() => setRange({ from: from.toISOString(), to: to.toISOString() }), 0);
      return () => clearTimeout(t);
    }
  }, [preset, customFrom, customTo]);

  const base: HeatmapQuery = {
    metric,
    from: range.from,
    to: range.to,
    kind: kind === "ALL" ? undefined : kind,
    vehicleKind: vehicle === "ALL" ? undefined : vehicle,
    resolution,
  };
  const query: HeatmapQuery = { ...base, hourFrom: hours[0] === 0 && hours[1] === 23 ? undefined : hours[0], hourTo: hours[0] === 0 && hours[1] === 23 ? undefined : hours[1] };
  const { data, error, isLoading } = useHeatmap(query, initial);
  const buckets = useHourBuckets(base);
  const heat = data ?? initial;

  const serviceSets = useMemo(() => new Map(cities.map((c) => [c.id, new Set(c.serviceCells)])), [cities]);
  const allService = useMemo(() => cities.flatMap((c) => c.serviceCells), [cities]);
  const outside = useMemo(
    () => new Set(heat.cells.filter((c) => !cityOf(c.cell, cities, serviceSets)).map((c) => c.cell)),
    [heat.cells, cities, serviceSets],
  );
  const outsideUnmet = metric === "unmet" ? [...outside] : [];
  const legend = heatLegend(heat.max);
  const top = heat.cells.slice(0, 10);
  const selectedList = [...selected].filter((c) => heat.cells.some((h) => h.cell === c));
  const selectedTotal = heat.cells.filter((c) => selected.has(c.cell)).reduce((a, c) => a + c.value, 0);

  // Selection resets when the grid changes resolution (cell ids change).
  const [prevRes, setPrevRes] = useState(resolution);
  if (prevRes !== resolution) {
    setPrevRes(resolution);
    setSelected(new Set());
  }

  function toggle(cell: string, isAdditive: boolean) {
    setSelected((s) => {
      const next = new Set(isAdditive ? s : []);
      if (isAdditive && s.has(cell)) next.delete(cell);
      else next.add(cell);
      return next;
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div className="grid content-start gap-3">
        <Card className="gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label="Metric" className="inline-flex rounded-lg bg-muted p-1">
              {HEATMAP_METRICS.map((m) => (
                <button
                  key={m}
                  role="tab"
                  type="button"
                  aria-selected={metric === m}
                  onClick={() => setMetric(m)}
                  className={cn("rounded-md px-3 py-1.5 text-sm font-medium text-navy-700", metric === m && "bg-card text-coral-600 shadow-sm")}
                >
                  {METRIC_LABEL[m]}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-lg bg-muted p-1 text-sm">
              {(["today", "7d", "30d", "custom"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={preset === p}
                  onClick={() => choosePreset(p)}
                  className={cn("rounded-md px-2.5 py-1.5 font-medium text-navy-700", preset === p && "bg-card text-coral-600 shadow-sm")}
                >
                  {p === "today" ? "Today" : p === "7d" ? "7 days" : p === "30d" ? "30 days" : "Custom"}
                </button>
              ))}
            </div>
            {preset === "custom" && (
              <span className="flex items-center gap-1">
                <Input type="date" aria-label="From date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 w-40" />
                <span className="text-muted-foreground">–</span>
                <Input type="date" aria-label="To date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 w-40" />
              </span>
            )}
            {isLoading && <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-64 flex-1 items-center gap-3">
              <span className="w-24 shrink-0 text-xs font-medium text-navy-700 tabular-nums">
                Hours {String(hours[0]).padStart(2, "0")}:00–{String(hours[1]).padStart(2, "0")}:59
              </span>
              <Slider
                min={0}
                max={23}
                step={1}
                value={hours}
                onValueChange={(v) => setHours([v[0], v[1] ?? v[0]] as [number, number])}
                aria-label="Hour of day range"
                className="max-w-72"
              />
              <div className="flex gap-1">
                {HOUR_PRESETS.map((h) => (
                  <Button
                    key={h.label}
                    size="xs"
                    variant={hours[0] === h.range[0] && hours[1] === h.range[1] ? "secondary" : "ghost"}
                    onClick={() => setHours(h.range)}
                  >
                    {h.label}
                  </Button>
                ))}
              </div>
            </div>
            <Select value={kind} onValueChange={(v) => setKind(v as TripKind | "ALL")}>
              <SelectTrigger size="sm" className="w-32" aria-label="Trip kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Rides + parcels</SelectItem>
                <SelectItem value="RIDE">Rides</SelectItem>
                <SelectItem value="PARCEL">Parcels</SelectItem>
              </SelectContent>
            </Select>
            <Select value={vehicle} onValueChange={(v) => setVehicle(v as VehicleKind | "ALL")}>
              <SelectTrigger size="sm" className="w-36" aria-label="Vehicle">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All vehicles</SelectItem>
                {VEHICLE_KINDS.map((v) => (
                  <SelectItem key={v} value={v}>
                    {vehicleLabel(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(resolution)} onValueChange={(v) => setResolution(Number(v))}>
              <SelectTrigger size="sm" className="w-36" aria-label="Hexagon size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOLUTIONS.map((r) => (
                  <SelectItem key={r.value} value={String(r.value)}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-xs text-error">{error}</p>}
        </Card>

        <TtMap
          center={cityView(cities).center}
          zoom={cityView(cities).zoom}
          mapType={mapType}
          className="h-[calc(100vh-19rem)] min-h-[560px] border"
          overlay={
            <>
              <div className="absolute top-2 right-2 z-10 flex gap-1.5">
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
                <Button size="sm" variant="outline" className="bg-card shadow-md" aria-pressed={showService} onClick={() => setShowService((s) => !s)}>
                  <HexagonIcon /> Service area {showService ? "on" : "off"}
                </Button>
              </div>
              <div className="absolute bottom-3 left-2 z-10 rounded-lg border bg-card/95 p-2.5 text-xs shadow-md">
                <p className="mb-1.5 font-semibold text-navy-900">{METRIC_LABEL[metric]} per hexagon</p>
                <ul className="space-y-1">
                  {legend
                    .slice()
                    .reverse()
                    .map((l) => (
                      <li key={l.color} className="flex items-center gap-2 tabular-nums text-navy-700">
                        <span className="size-3 rounded-sm" style={{ background: l.color }} />
                        {fmtValue(metric, l.from)}–{fmtValue(metric, l.to)}
                      </li>
                    ))}
                </ul>
                {metric === "unmet" && outside.size > 0 && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-warning-text">
                    <span className="h-0 w-4 border-t-2 border-dashed border-warning" /> demand outside service area
                  </p>
                )}
              </div>
              {hover && (
                <div
                  className="pointer-events-none absolute z-20 rounded-lg bg-navy-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
                  style={{ left: hover.x + 14, top: hover.y + 14 }}
                >
                  <p className="font-semibold">
                    {fmtValue(metric, hover.cell.value)} {metric === "fares" ? "" : METRIC_LABEL[metric].toLowerCase()}
                  </p>
                  <p className="text-navy-300">
                    #{hover.rank} · {heat.total ? ((hover.cell.value / heat.total) * 100).toFixed(1) : 0}% of total
                    {outside.has(hover.cell.cell) ? " · outside service area" : ""}
                  </p>
                  <p className="font-mono text-[10px] text-navy-300">{hover.cell.cell}</p>
                </div>
              )}
            </>
          }
        >
          {/* The service area as one slate edge and a faint wash (no hexagon grid), so the heat colours read on their own. */}
          {showService && <HexLayer cells={allService} style={SERVICE_AREA_STYLE} zIndex={0} />}
          {showService && <HexOutline cells={allService} {...SERVICE_AREA_EDGE} zIndex={3} />}
          <HeatLayer cells={heat.cells} interactive selected={selected} outside={metric === "unmet" ? outside : undefined} onHover={setHover} onClick={toggle} zIndex={1} />
          <DashedOutlines cells={outsideUnmet} />
          <FitCells cells={heat.cells.length ? heat.cells.map((c) => c.cell) : allService} />
          <FlyTo target={focus} />
        </TtMap>
      </div>

      <div className="grid content-start gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-semibold">
              <FlameIcon className="size-4 text-coral-600" /> {METRIC_LABEL[metric]}
            </CardTitle>
            <CardDescription>{METRIC_HINT[metric]}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-3 gap-2">
              <div>
                <dt className="text-xs text-muted-foreground">Total</dt>
                <dd className="font-heading text-lg font-semibold tabular-nums">{fmtValue(metric, heat.total)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Hexagons</dt>
                <dd className="font-heading text-lg font-semibold tabular-nums">{formatCount(heat.cells.length)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Busiest</dt>
                <dd className="font-heading text-lg font-semibold tabular-nums">{fmtValue(metric, heat.max)}</dd>
              </div>
            </dl>
            {buckets && (
              <ChartContainer config={chartConfig} className="mt-3 aspect-auto h-24 w-full">
                <BarChart data={buckets} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={9} interval={0} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideIndicator />} />
                  <Bar dataKey="value" fill="var(--color-value)" radius={3} />
                </BarChart>
              </ChartContainer>
            )}
            {buckets && <p className="text-center text-[11px] text-muted-foreground">By hour of day (3-hour buckets, IST)</p>}
          </CardContent>
        </Card>

        <Card className="gap-0 pb-0">
          <CardHeader className="border-b">
            <CardTitle className="font-semibold">Selection</CardTitle>
            <CardDescription>Click a hexagon to select it; Shift-click to add more.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 py-3">
            {selectedList.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <MousePointerClickIcon className="size-4" /> Nothing selected
              </p>
            ) : (
              <p className="flex items-center justify-between text-sm text-navy-900">
                <span>
                  <b>{selectedList.length}</b> hexagons · {fmtValue(metric, selectedTotal)}
                </span>
                <Button size="icon-xs" variant="ghost" aria-label="Clear selection" onClick={() => setSelected(new Set())}>
                  <XIcon />
                </Button>
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setSelected(new Set(heat.cells.slice(0, 10).map((c) => c.cell)))} disabled={heat.cells.length === 0}>
                Select top 10
              </Button>
              <Button size="sm" onClick={() => setDialog("zone")} disabled={selectedList.length === 0 || cities.length === 0}>
                <HexagonIcon /> Create zone
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDialog("service")} disabled={selectedList.length === 0 || cities.length === 0}>
                <MapPlusIcon /> Add to service area
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 pb-0">
          <CardHeader className="border-b">
            <CardTitle className="font-semibold">Top 10 hexagons</CardTitle>
          </CardHeader>
          {top.length === 0 ? (
            <CardContent className="py-6 text-center text-sm text-muted-foreground">No trips match these filters.</CardContent>
          ) : (
            <ol className="divide-y">
              {top.map((c, i) => (
                <li key={c.cell}>
                  <button
                    type="button"
                    onClick={() => {
                      const p = cellCentre(c.cell);
                      setFocus({ ...p, key: Date.now() });
                      setSelected(new Set([c.cell]));
                    }}
                    className={cn("flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted/50", selected.has(c.cell) && "bg-coral-50/60")}
                  >
                    <span className="w-5 text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-coral-500" style={{ width: `${Math.max(4, c.intensity * 100)}%` }} />
                    </span>
                    <span className="w-20 text-right text-sm font-medium tabular-nums text-navy-900">{fmtValue(metric, c.value)}</span>
                    {outside.has(c.cell) && <span className="text-[10px] font-medium text-warning-text">outside</span>}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <ZoneFromSelection
        isOpen={dialog === "zone"}
        onClose={() => setDialog(null)}
        cells={selectedList}
        cities={cities}
        serviceSets={serviceSets}
        defaultKind={metric === "unmet" ? "DEMAND" : "SURGE"}
        onDone={(cityId) => {
          setSelected(new Set());
          router.push(`/cities/${cityId}?tab=zones`);
        }}
      />
      <ServiceFromSelection
        isOpen={dialog === "service"}
        onClose={() => setDialog(null)}
        cells={selectedList}
        outside={outside}
        cities={cities}
        onDone={() => {
          setSelected(new Set());
          router.refresh();
        }}
      />
    </div>
  );
}

function CityPicker({ cities, value, onChange }: { cities: readonly HeatCity[]; value: string; onChange: (id: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full" aria-label="City">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {cities.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ZoneFromSelection({
  isOpen,
  onClose,
  cells,
  cities,
  serviceSets,
  defaultKind,
  onDone,
}: {
  isOpen: boolean;
  onClose: () => void;
  cells: string[];
  cities: HeatCity[];
  serviceSets: ReadonlyMap<string, Set<string>>;
  defaultKind: "SURGE" | "DEMAND";
  onDone: (cityId: string) => void;
}) {
  const guess = cells.map((c) => cityOf(c, cities, serviceSets)).find(Boolean) ?? (cells[0] ? nearestCity(cells[0], cities) : cities[0]);
  const [cityId, setCityId] = useState(guess?.id ?? cities[0]?.id ?? "");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"SURGE" | "DEMAND">(defaultKind);
  const [mult, setMult] = useState("1.2");
  const [isPending, startTransition] = useTransition();
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setCityId(guess?.id ?? cities[0]?.id ?? "");
      setKind(defaultKind);
    }
  }
  const city = cities.find((c) => c.id === cityId);
  const zoneCells = city ? toResolution(cells, city.h3Resolution) : [];
  const m = Number(mult);
  const isValid = !!city && name.trim().length >= 2 && zoneCells.length > 0 && zoneCells.length <= 5000 && (kind !== "SURGE" || (m >= 1 && m <= 1.5));

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isValid || !city) return;
            startTransition(async () => {
              const res = await createZone(city.id, {
                name,
                kind,
                cells: zoneCells,
                surgeMultiplier: kind === "SURGE" ? m : 1,
                color: ZONE_COLORS[kind],
              });
              if (res.ok) {
                toast.success(res.message);
                onClose();
                onDone(city.id);
              } else toast.error(res.error);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Create a zone from {cells.length} hexagons</DialogTitle>
            <DialogDescription>
              {zoneCells.length} cells at the city&apos;s resolution. Edit the shape afterwards in Zones.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>City</Label>
              <CityPicker cities={cities} value={cityId} onChange={setCityId} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="hz-name">Zone name</Label>
              <Input id="hz-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gandhipuram evening rush" maxLength={60} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label>Kind</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as "SURGE" | "DEMAND")}>
                  <SelectTrigger className="w-full" aria-label="Zone kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SURGE">Surge</SelectItem>
                    <SelectItem value="DEMAND">Demand hotspot</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {kind === "SURGE" && (
                <div className="grid gap-1.5">
                  <Label htmlFor="hz-mult">Multiplier</Label>
                  <Input id="hz-mult" type="number" min="1" max="1.5" step="0.05" value={mult} onChange={(e) => setMult(e.target.value)} />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!isValid || isPending}>
              {isPending && <Loader2Icon className="animate-spin" />} Create zone
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ServiceFromSelection({
  isOpen,
  onClose,
  cells,
  outside,
  cities,
  onDone,
}: {
  isOpen: boolean;
  onClose: () => void;
  cells: string[];
  outside: ReadonlySet<string>;
  cities: HeatCity[];
  onDone: () => void;
}) {
  const [cityId, setCityId] = useState(cities[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen && cells[0]) setCityId(nearestCity(cells[0], cities)?.id ?? cities[0]?.id ?? "");
  }
  const city = cities.find((c) => c.id === cityId);
  const outsideSelected = cells.filter((c) => outside.has(c));
  const toAdd = city ? toResolution(outsideSelected.length ? outsideSelected : cells, city.h3Resolution) : [];
  const next = city ? applyCells(city.serviceCells, toAdd, "add") : [];
  const added = city ? next.length - city.serviceCells.length : 0;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add demand to a service area</DialogTitle>
          <DialogDescription>
            {outsideSelected.length > 0
              ? `${outsideSelected.length} of the selected hexagons are outside every service area.`
              : "All selected hexagons are already inside a service area; nothing new will be added."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label>City</Label>
          <CityPicker cities={cities} value={cityId} onChange={setCityId} />
          <p className="text-sm text-navy-700">
            Adds <b>{formatCount(added)}</b> hexagons to {city?.name ?? "the city"} ({formatCount(city?.serviceCells.length ?? 0)} →{" "}
            {formatCount(next.length)}).
          </p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={!city || added === 0 || isPending}
            onClick={() =>
              city &&
              startTransition(async () => {
                const res = await saveServiceCells(city.id, next);
                if (res.ok) {
                  toast.success(res.message);
                  onClose();
                  onDone();
                } else toast.error(res.error);
              })
            }
          >
            {isPending && <Loader2Icon className="animate-spin" />} Add {formatCount(added)} hexagons
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
