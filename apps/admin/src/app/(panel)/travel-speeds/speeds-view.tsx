"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { ArrowRightIcon, GaugeIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/page";
import { HeatLayer, type HeatHover } from "@/components/map/google/heat-layer";
import { HexLayer } from "@/components/map/google/hex-layer";
import { TtMap } from "@/components/map/google/tamiltaxi-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCount, formatDateTime } from "@/lib/format";
import { heatColor } from "@/lib/heat";
import { cellCentre, cellsBounds } from "@/lib/hex";
import { ETA_SOURCE_LABEL, hourLabel, PEAK_HOURS, peakVsOffPeak, vsHourAvg } from "@/lib/speeds";
import type { HeatCell, HexStatRow, HexStats, HexStatsSort } from "@/lib/types";
import { cn } from "@/lib/utils";
import { cityView } from "@/lib/map-view";

import { rebuildHexStats } from "../actions";

const chartConfig = {
  speed: { label: "Avg km/h", color: "var(--chart-1)" },
  trips: { label: "Trips", color: "var(--chart-2)" },
} satisfies ChartConfig;

const SORT_LABEL: Record<HexStatsSort, string> = { busiest: "Busiest first", slowest: "Slowest first", fastest: "Fastest first" };

function FitPair({ row }: { row: HexStatRow | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !row) return;
    const b = cellsBounds([row.fromCell, row.toCell]);
    // Margin scales with the hex size (res 7 ≈ 2.5 km across, res 9 ≈ 0.4 km).
    const pad = { 7: 0.02, 8: 0.008, 9: 0.003 }[row.res] ?? 0.02;
    if (b) map.fitBounds({ south: b.south - pad, north: b.north + pad, west: b.west - pad, east: b.east + pad }, 40);
    const line = new google.maps.Polyline({
      map,
      path: [cellCentre(row.fromCell), cellCentre(row.toCell)],
      clickable: false,
      strokeColor: "#1E293B",
      strokeWeight: 2,
      icons: [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, strokeColor: "#1E293B" }, offset: "100%" }],
      zIndex: 10,
    });
    return () => line.setMap(null);
  }, [map, row]);
  return null;
}

function FitCells({ cells }: { cells: readonly string[] }) {
  const map = useMap();
  useEffect(() => {
    const b = cellsBounds(cells);
    if (map && b) map.fitBounds(b, 24);
  }, [map, cells]);
  return null;
}

/** Filters bound to the URL; the server page re-fetches on change. */
function useUrlFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const set = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  return { set, isPending };
}

function Kpi({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <Card className="gap-1">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={cn(
            "font-heading text-3xl font-semibold tabular-nums",
            tone === "good" && "text-success-text",
            tone === "bad" && "text-coral-700",
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>
    </Card>
  );
}

function pct(v: number | null, digits = 0): string {
  return v === null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export function SpeedsView({
  stats,
  names,
  minTrips,
  filters,
  cities,
}: {
  stats: HexStats;
  names: Record<string, string | null>;
  minTrips: number;
  filters: { hour?: number; sort: HexStatsSort; used: boolean };
  /** Active cities, for the map's first view before a hex is picked. */
  cities: readonly { centerLat: number; centerLng: number; placeId: string | null }[];
}) {
  const [selected, setSelected] = useState<HexStatRow | null>(stats.top[0] ?? null);
  const [mapMode, setMapMode] = useState<"pair" | "areas">("pair");
  const [hover, setHover] = useState<HeatHover | null>(null);
  const [isRebuilding, startRebuild] = useTransition();
  const { set, isPending } = useUrlFilter();
  const name = (c: string) => names[c] ?? `${c.slice(0, 9)}…`;

  const { accuracy, byHour } = stats;
  const peak = useMemo(() => peakVsOffPeak(byHour), [byHour]);
  const dayAvg = useMemo(() => peakVsOffPeak(byHour.map((r) => ({ ...r, hour: -1 }))).offPeak, [byHour]);
  const learned = accuracy.sources.filter((s) => s.source !== "fallback").reduce((a, s) => a + s.trips, 0);
  const coveragePct = accuracy.trips ? (learned / accuracy.trips) * 100 : 0;

  // Slow areas: intensity = how slow a hex is between the fastest and slowest one shown.
  const areaCells = useMemo<HeatCell[]>(() => {
    const speeds = stats.areas.map((a) => a.speed);
    const lo = Math.min(...speeds);
    const hi = Math.max(...speeds);
    return stats.areas
      .map((a) => ({ cell: a.cell, value: Math.round(a.speed * 10) / 10, intensity: hi > lo ? (hi - a.speed) / (hi - lo) : 0.5 }))
      .sort((a, b) => b.intensity - a.intensity);
  }, [stats.areas]);
  const areaCellIds = useMemo(() => areaCells.map((c) => c.cell), [areaCells]);
  const areaTrips = useMemo(() => new Map(stats.areas.map((a) => [a.cell, a.trips])), [stats.areas]);
  const speedRange = areaCells.length ? [areaCells[areaCells.length - 1].value, areaCells[0].value] : null;

  return (
    <div className="grid gap-4">
      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select value={filters.hour === undefined ? "ALL" : String(filters.hour)} onValueChange={(v) => set("hour", v === "ALL" ? null : v)}>
          <SelectTrigger className="h-9 w-full bg-card sm:w-40" aria-label="Hour">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All hours</SelectItem>
            {Array.from({ length: 24 }, (_, h) => (
              <SelectItem key={h} value={String(h)}>
                {hourLabel(h)}
                {PEAK_HOURS.includes(h) ? " · rush hour" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.sort} onValueChange={(v) => set("sort", v === "busiest" ? null : v)}>
          <SelectTrigger className="h-9 w-full bg-card sm:w-40" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABEL) as HexStatsSort[]).map((s) => (
              <SelectItem key={s} value={s}>
                {SORT_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex h-9 items-center gap-2 px-1">
          <Switch id="used-only" checked={filters.used} onCheckedChange={(v) => set("used", v ? "true" : null)} disabled={!minTrips} />
          <Label htmlFor="used-only" className="text-sm font-normal text-navy-700">
            Only pairs used for ETAs (≥ {minTrips || "–"} trips)
          </Label>
        </div>
        {isPending && <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-label="Updating" />}
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label={`ETA error (last ${accuracy.days} days)`}
          value={accuracy.trips ? `${accuracy.mapePct.toFixed(0)}%` : "–"}
          tone={accuracy.trips ? (accuracy.mapePct <= 20 ? "good" : "bad") : undefined}
          hint={
            accuracy.trips ? (
              <>
                ±{accuracy.maeMin.toFixed(1)} min on average over {formatCount(accuracy.trips)} trips; ETAs run{" "}
                {Math.abs(accuracy.biasMin).toFixed(1)} min {accuracy.biasMin >= 0 ? "long" : "short"}.
              </>
            ) : (
              "No finished trips yet."
            )
          }
        />
        <Kpi
          label="Trips with a learned ETA"
          value={accuracy.trips ? `${coveragePct.toFixed(0)}%` : "–"}
          tone={accuracy.trips ? (coveragePct >= 70 ? "good" : "bad") : undefined}
          hint={minTrips ? "The rest fall back to Google or a 20 km/h estimate." : "Off: set “Learned ETA after” in Settings."}
        />
        <Kpi
          label="Rush-hour slowdown"
          value={pct(peak.slowdownPct === null ? null : -peak.slowdownPct)}
          hint={
            peak.peak && peak.offPeak
              ? `${peak.peak.toFixed(1)} km/h at 8–10 am / 5–8 pm vs ${peak.offPeak.toFixed(1)} km/h the rest of the day.`
              : "Needs trips in and out of rush hours."
          }
        />
        <Card className="gap-1">
          <CardHeader>
            <CardDescription>Learned hex-pair / hour rows at this size</CardDescription>
            <CardTitle className="font-heading text-3xl font-semibold tabular-nums">{formatCount(stats.rows)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Last rebuilt {stats.lastRun ? formatDateTime(stats.lastRun) : "never"}.
            <Button
              size="sm"
              className="mt-2 w-full"
              disabled={isRebuilding}
              onClick={() =>
                startRebuild(async () => {
                  const res = await rebuildHexStats();
                  if (res.ok) toast.success(res.message);
                  else toast.error(res.error);
                })
              }
            >
              {isRebuilding ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} Rebuild now
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Speed by hour + where ETAs come from */}
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader>
            <CardTitle className="font-semibold">Average speed by hour</CardTitle>
            <CardDescription>
              All learned pairs at this size (IST). Bars: km/h (rush hours darker), line: trips. Dashed: whole-day average.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {byHour.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No data yet. Rebuild after some trips complete.</p>
            ) : (
              <ChartContainer config={chartConfig} className="aspect-auto h-52 w-full">
                <ComposedChart data={byHour.map((r) => ({ ...r, label: hourLabel(r.hour), speed: Math.round(r.speed * 10) / 10 }))} margin={{ left: -16, right: 0, top: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} />
                  <YAxis yAxisId="speed" tickLine={false} axisLine={false} width={40} />
                  <YAxis yAxisId="trips" orientation="right" tickLine={false} axisLine={false} width={36} fontSize={10} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  {dayAvg !== null && <ReferenceLine yAxisId="speed" y={dayAvg} stroke="var(--muted-foreground)" strokeDasharray="4 4" />}
                  <Bar yAxisId="speed" dataKey="speed" radius={4} maxBarSize={28}>
                    {byHour.map((r) => (
                      <Cell
                        key={r.hour}
                        fill="var(--color-speed)"
                        fillOpacity={filters.hour !== undefined && filters.hour !== r.hour ? 0.3 : PEAK_HOURS.includes(r.hour) ? 1 : 0.65}
                      />
                    ))}
                  </Bar>
                  <Line yAxisId="trips" dataKey="trips" type="monotone" stroke="var(--color-trips)" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="font-semibold">Where ETAs come from</CardTitle>
            <CardDescription>
              Recent trips replayed through the learned speeds at their start hour: smallest hex pair with ≥ {minTrips || "–"} trips first.
              These trips are part of the learned data, so real errors are a little higher.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {accuracy.sources.length === 0 ? (
              <p className="px-6 py-4 text-sm text-muted-foreground">No finished trips in the last {accuracy.days} days.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6">Source</TableHead>
                    <TableHead className="text-right">Trips</TableHead>
                    <TableHead className="text-right">± min</TableHead>
                    <TableHead className="pr-6 text-right">Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accuracy.sources.map((s) => (
                    <TableRow key={s.source}>
                      <TableCell className="pl-6 text-sm text-navy-900">{ETA_SOURCE_LABEL[s.source]}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCount(s.trips)}
                        <span className="ml-1 text-[10px] text-muted-foreground">{((s.trips / accuracy.trips) * 100).toFixed(0)}%</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{s.maeMin.toFixed(1)}</TableCell>
                      <TableCell className={cn("pr-6 text-right font-medium tabular-nums", s.mapePct > 30 && "text-coral-700")}>
                        {s.mapePct.toFixed(0)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pairs + map */}
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Card className="gap-0 py-0">
          {stats.top.length === 0 ? (
            <EmptyState
              icon={GaugeIcon}
              title="No learned speeds match"
              description={filters.used || filters.hour !== undefined ? "Try another hour, a larger hex size or turn off “only pairs used”." : "Press Rebuild now once trips have completed."}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">From → to</TableHead>
                  <TableHead>Hour</TableHead>
                  <TableHead className="text-right">Trips</TableHead>
                  <TableHead className="text-right">Avg km/h</TableHead>
                  <TableHead className="text-right" title="Compared with all pairs at the same hour">
                    vs hour avg
                  </TableHead>
                  <TableHead className="pr-4 text-right">Avg min</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.top.map((r) => {
                  const isSel = selected === r;
                  const diff = vsHourAvg(r.avgSpeedKmh, r.hour, byHour);
                  return (
                    <TableRow
                      key={`${r.fromCell}-${r.toCell}-${r.hour}`}
                      className={cn("cursor-pointer", isSel && "bg-coral-50/70 hover:bg-coral-50")}
                      onClick={() => {
                        setSelected(r);
                        setMapMode("pair");
                      }}
                      aria-selected={isSel}
                    >
                      <TableCell className="pl-4">
                        <span className="flex flex-wrap items-center gap-1.5 text-sm text-navy-900">
                          {name(r.fromCell)} <ArrowRightIcon className="size-3.5 text-muted-foreground" /> {name(r.toCell)}
                          {r.fromCell === r.toCell && <Badge variant="outline">same hex</Badge>}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {r.fromCell} → {r.toCell}
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {hourLabel(r.hour)}
                        {PEAK_HOURS.includes(r.hour) && <span className="ml-1 text-[10px] text-coral-700">rush</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.trips}
                        {minTrips > 0 && r.trips >= minTrips && <span className="ml-1 text-[10px] text-success-text">used</span>}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{r.avgSpeedKmh.toFixed(1)}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right text-xs tabular-nums",
                          diff !== null && diff <= -10 && "text-coral-700",
                          diff !== null && diff >= 10 && "text-success-text",
                        )}
                      >
                        {pct(diff)}
                      </TableCell>
                      <TableCell className="pr-4 text-right tabular-nums">{r.avgDurationMin.toFixed(1)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>

        <div className="grid content-start gap-2 xl:sticky xl:top-20">
          <nav aria-label="Map view" className="inline-flex w-fit gap-1 rounded-lg bg-muted p-1 text-sm">
            {(
              [
                ["pair", "Selected pair"],
                ["areas", "Slow areas"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setMapMode(mode)}
                aria-pressed={mapMode === mode}
                className={cn(
                  "rounded-md px-3 py-1 font-medium text-navy-700 hover:text-navy-900",
                  mapMode === mode && "bg-card text-navy-900 shadow-sm",
                )}
              >
                {label}
              </button>
            ))}
          </nav>
          <TtMap center={selected ? cellCentre(selected.fromCell) : cityView(cities).center} zoom={selected ? 12 : cityView(cities).zoom} className="h-[420px] border" boundaries={cities.map((c) => c.placeId)}>
            {mapMode === "pair" && selected && (
              <>
                <HexLayer cells={[selected.fromCell]} style={{ color: "#D84315", fillColor: "#F4511E", fillOpacity: 0.3, weight: 2 }} zIndex={2} />
                <HexLayer
                  cells={selected.toCell === selected.fromCell ? [] : [selected.toCell]}
                  style={{ color: "#1E293B", fillColor: "#334155", fillOpacity: 0.25, weight: 2 }}
                  zIndex={2}
                />
                <FitPair row={selected} />
              </>
            )}
            {mapMode === "areas" && (
              <>
                <HeatLayer cells={areaCells} interactive onHover={setHover} />
                <FitCells cells={areaCellIds} />
              </>
            )}
          </TtMap>
          {mapMode === "pair" && selected && (
            <p className="px-1 text-xs text-muted-foreground">
              <span className="font-medium text-coral-700">■ from</span> {name(selected.fromCell)} ·{" "}
              <span className="font-medium text-navy-900">■ to</span> {name(selected.toCell)} · {hourLabel(selected.hour)} ·{" "}
              {selected.avgSpeedKmh.toFixed(1)} km/h over {selected.trips} trips
            </p>
          )}
          {mapMode === "areas" && (
            <div className="grid gap-1 px-1 text-xs text-muted-foreground">
              <p>
                Average speed of trips leaving each hex
                {filters.hour !== undefined ? ` at ${hourLabel(filters.hour)}` : ""} (hexes with ≥ 2 trips).{" "}
                {hover ? (
                  <b className="text-navy-900">
                    {hover.cell.value} km/h · {areaTrips.get(hover.cell.cell) ?? 0} trips
                  </b>
                ) : (
                  "Hover a hex for details."
                )}
              </p>
              {speedRange && (
                <div className="flex items-center gap-2">
                  <span>{speedRange[0].toFixed(0)} km/h</span>
                  <span
                    className="h-2 flex-1 rounded-full"
                    style={{ background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map((t) => heatColor(t)).join(", ")})` }}
                  />
                  <span>{speedRange[1].toFixed(0)} km/h (slowest)</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
