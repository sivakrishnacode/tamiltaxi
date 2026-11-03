"use client";

import { Loader2Icon, RadarIcon, RefreshCwIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/common/page";
import { StatusBadge } from "@/components/common/status";
import { LiveMap } from "@/components/map/google/live-map";
import { VEHICLE_COLORS } from "@/components/map/colors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatInr, formatTime, shortId, vehicleLabel } from "@/lib/format";
import { METRIC_LABEL } from "@/lib/heat";
import { demandColor, type DemandHover } from "@/components/map/google/demand-layer";
import { Switch } from "@/components/ui/switch";
import { HEATMAP_METRICS, type DemandSnapshot, type HeatmapMetric, type LiveData, type ServiceArea, type VehicleKind } from "@/lib/types";
import { cityView } from "@/lib/map-view";

const POLL_MS = 10_000;
/** The API recomputes demand every 60 s; poll a bit faster so the map is never more than ~a minute old. */
const DEMAND_POLL_MS = 30_000;

interface Payload {
  readonly live: LiveData;
  readonly area: ServiceArea | null;
  readonly at: string;
}

/** Polls /api/live every 10 s (paused while the tab is hidden). */
export function LiveView({
  initial,
  initialDemand,
  cities,
}: {
  initial: LiveData;
  initialDemand: DemandSnapshot | null;
  cities: { id: string; name: string; centerLat: number; centerLng: number; placeId: string | null }[];
}) {
  const [data, setData] = useState<LiveData>(initial);
  const [area, setArea] = useState<ServiceArea | null>(null);
  const [cityId, setCityId] = useState<string>(cities[0]?.id ?? "NONE");
  const [updatedAt, setUpdatedAt] = useState<Date>(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [focus, setFocus] = useState<[number, number] | null>(null);
  const areaFor = useRef<string | null>(null);
  const [heat, setHeat] = useState<HeatmapMetric | "off">("off");
  const [demand, setDemand] = useState<DemandSnapshot | null>(initialDemand);
  const [showDemand, setShowDemand] = useState(true);
  const [isDemandLoading, setDemandLoading] = useState(false);
  const [demandHover, setDemandHover] = useState<DemandHover | null>(null);

  const loadDemand = useCallback(async (refresh = false) => {
    setDemandLoading(true);
    try {
      const res = await fetch(`/api/demand${refresh ? "?refresh=true" : ""}`, { cache: "no-store" });
      if (res.ok) setDemand((await res.json()) as DemandSnapshot);
    } finally {
      setDemandLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void loadDemand();
    }, DEMAND_POLL_MS);
    return () => clearInterval(id);
  }, [loadDemand]);

  const surging = (demand?.cells ?? []).filter((c) => c.multiplier > 1).sort((a, b) => b.multiplier - a.multiplier || b.requests - a.requests);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const wantArea = cityId !== "NONE" && areaFor.current !== cityId ? cityId : null;
      const res = await fetch(`/api/live${wantArea ? `?area=${encodeURIComponent(wantArea)}` : ""}`, { cache: "no-store" });
      if (res.status === 401) {
        window.location.replace("/auth/signout?expired=1");
        return;
      }
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? "Update failed");
      const body = (await res.json()) as Payload;
      setData(body.live);
      if (wantArea) {
        areaFor.current = wantArea;
        setArea(body.area);
      }
      setUpdatedAt(new Date(body.at));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setLoading(false);
    }
  }, [cityId]);

  useEffect(() => {
    // First fetch on the next tick (loads the area overlay; live data was server-rendered).
    const first = setTimeout(() => void load(), 0);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load, cityId]);

  const city = cities.find((c) => c.id === cityId);
  const view = cityView(city ? [city] : cities);
  const center: [number, number] = [view.center.lat, view.center.lng];
  const busy = data.drivers.filter((d) => d.activeTripId).length;
  const kinds = [...new Set(data.drivers.map((d) => d.vehicleKind))] as VehicleKind[];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card className="gap-0 overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
          <span className="text-sm text-navy-700">
            <b className="text-navy-900">{data.drivers.length}</b> online · <b className="text-navy-900">{busy}</b> on a trip ·{" "}
            <b className="text-navy-900">{data.trips.length}</b> active trips
          </span>
          <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {error ? <span className="text-error">{error}</span> : <>Updated {formatTime(updatedAt)}</>}
            <Button variant="ghost" size="icon-sm" onClick={() => void load()} aria-label="Refresh now" disabled={isLoading}>
              {isLoading ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
            </Button>
          </span>
          <Select
            value={cityId}
            onValueChange={(v) => {
              if (v === "NONE") {
                areaFor.current = null;
                setArea(null);
              }
              setCityId(v);
            }}
          >
            <SelectTrigger size="sm" className="w-44" aria-label="Service area overlay">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">No area overlay</SelectItem>
              {cities.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} service area
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={heat} onValueChange={(v) => setHeat(v as HeatmapMetric | "off")}>
            <SelectTrigger size="sm" className="w-40" aria-label="Demand heat layer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">No demand heat</SelectItem>
              {HEATMAP_METRICS.map((m) => (
                <SelectItem key={m} value={m}>
                  Heat: {METRIC_LABEL[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="h-[60vh] min-h-96 lg:h-[calc(100vh-220px)]">
          <LiveMap
            data={data}
            area={area}
            center={center}
            focus={focus}
            heat={heat === "off" ? null : heat}
            demand={showDemand ? (demand?.cells ?? []) : null}
            onDemandHover={setDemandHover}
            boundaries={cities.map((c) => c.placeId)}
            className="h-full rounded-none"
            overlay={
              demandHover && (
                <div
                  className="pointer-events-none absolute z-20 rounded-lg bg-navy-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
                  style={{ left: demandHover.x + 14, top: demandHover.y + 14 }}
                >
                  <p className="font-semibold">
                    {demandHover.cell.multiplier > 1 ? `Surge ${demandHover.cell.multiplier.toFixed(2)}×` : "Busy"} · {demandHover.cell.level}
                  </p>
                  <p className="text-navy-300">
                    {demandHover.cell.requests} bookings · {demandHover.cell.freeDrivers} free drivers · ratio {demandHover.cell.ratio}
                  </p>
                </div>
              )
            }
          />
        </div>
        {kinds.length > 0 && (
          <div className="flex flex-wrap gap-3 border-t px-4 py-2 text-xs text-navy-700">
            {kinds.map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: VEHICLE_COLORS[k] }} /> {vehicleLabel(k)}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full border-2 border-coral-500" /> Busy
            </span>
          </div>
        )}
      </Card>

      <div className="grid content-start gap-4">
        <Card className="gap-0 pb-0">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center justify-between gap-2 font-semibold">
              Surging now
              <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                <label className="flex items-center gap-1.5">
                  <Switch checked={showDemand} onCheckedChange={setShowDemand} aria-label="Demand vs supply layer" /> Map layer
                </label>
                <Button variant="ghost" size="icon-sm" aria-label="Recompute demand now" onClick={() => void loadDemand(true)} disabled={isDemandLoading}>
                  {isDemandLoading ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
                </Button>
              </span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Bookings vs free drivers per area, last {demand?.windowMin ?? "–"} min · computed {demand ? formatTime(demand.at) : "–"}
            </p>
          </CardHeader>
          {surging.length === 0 ? (
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No surge right now. {demand?.cells.some((c) => c.level === "busy") ? "Some areas are busy (amber)." : ""}
            </CardContent>
          ) : (
            <ul className="max-h-64 divide-y overflow-y-auto">
              {surging.map((c) => (
                <li key={c.cell}>
                  <button
                    type="button"
                    onClick={() => setFocus([c.lat, c.lng])}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted/50"
                  >
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: demandColor(c) }} />
                    <span className="min-w-0 flex-1 text-xs text-navy-700">
                      {c.requests} bookings · {c.freeDrivers} free · ratio {c.ratio}
                      <span className="block font-mono text-[10px] text-muted-foreground">{c.cell}</span>
                    </span>
                    <span className="font-heading text-sm font-semibold text-coral-700 tabular-nums">{c.multiplier.toFixed(2)}×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="gap-0 pb-0">
          <CardHeader className="border-b">
            <CardTitle className="font-semibold">Drivers online</CardTitle>
          </CardHeader>
          {data.drivers.length === 0 ? (
            <EmptyState icon={RadarIcon} title="Nobody online" description="Drivers show up here when they go online in the app." />
          ) : (
            <ul className="max-h-80 divide-y overflow-y-auto">
              {data.drivers.map((d) => (
                <li key={d.driverId}>
                  <button
                    type="button"
                    onClick={() => setFocus([d.lat, d.lng])}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50"
                  >
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: VEHICLE_COLORS[d.vehicleKind] }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-navy-900">{d.name ?? "Driver"}</span>
                      <span className="block text-xs text-muted-foreground">
                        {vehicleLabel(d.vehicleKind)} · {d.plate}
                      </span>
                    </span>
                    <span className={d.activeTripId ? "text-xs font-medium text-coral-600" : "text-xs text-success-text"}>
                      {d.activeTripId ? "On trip" : "Free"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="gap-0 pb-0">
          <CardHeader className="border-b">
            <CardTitle className="font-semibold">Active trips</CardTitle>
          </CardHeader>
          {data.trips.length === 0 ? (
            <CardContent className="py-6 text-center text-sm text-muted-foreground">No active trips right now.</CardContent>
          ) : (
            <ul className="max-h-80 divide-y overflow-y-auto">
              {data.trips.map((t) => (
                <li key={t.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/trips/${t.id}`} className="font-mono text-xs font-semibold text-navy-900 hover:text-coral-600">
                      #{shortId(t.id)}
                    </Link>
                    <StatusBadge status={t.status} />
                  </div>
                  <button type="button" onClick={() => setFocus([t.pickupLat, t.pickupLng])} className="mt-1 block text-left text-xs text-navy-700 hover:underline">
                    {t.pickupName} → {t.dropName}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    {vehicleLabel(t.vehicleKind)} · {formatInr(t.fareTotal)} · {formatTime(t.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
