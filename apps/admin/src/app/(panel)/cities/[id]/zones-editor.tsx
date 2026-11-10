"use client";

import { getResolution } from "h3-js";
import { HexagonIcon, Loader2Icon, PencilIcon, PlusIcon, SaveIcon, SearchIcon, Trash2Icon, TriangleAlertIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/page";
import { SERVICE_AREA_EDGE, SERVICE_AREA_STYLE } from "@/components/map/colors";
import { HexWorkbench } from "@/components/map/editor/hex-workbench";
import { useCellEditor } from "@/components/map/editor/use-cell-editor";
import type { HexLayerDef, HexStyle, OutlineStyle } from "@/components/map/google/hex-layer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { formatCount, humanize } from "@/lib/format";
import { toResolution } from "@/lib/hex";
import { ZONE_KINDS, type AreaStats, type CityDetail, type Zone, type ZoneKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { cellsToKm2 } from "@/lib/validation";
import { ZONE_COLORS, zoneLabel, zoneSwatch } from "@/lib/zone-label";
import { scheduleLabel, vehiclesLabel, zoneState } from "@/lib/zone-rules";

import { createZone, deleteZone, updateZone } from "../../actions";
import { rulesDraftOf, rulesError, rulesPayload, ZoneRulesFields, type RulesDraft } from "./zone-rules-fields";

const KIND_HINT: Record<ZoneKind, string> = {
  SURGE: "Higher demand: shown to drivers and can raise fares (1.0–1.5×)",
  DEMAND: "Demand hotspot for drivers, no price change",
  NO_SERVICE: "No pickups or drops inside",
  PICKUP_POINT: "Airport / station style pickup point",
};

type ZoneState = ReturnType<typeof zoneState>;

/**
 * A zone's hexagons: a fill in its kind's colour with faint inner lines (the outline marks its edge). Zones that are
 * not working right now (outside their hours, not started, ended, paused) fade back so the live ones stand out.
 */
export function zoneStyle(kind: ZoneKind, state: ZoneState, isSelected = false): HexStyle {
  const color = ZONE_COLORS[kind];
  if (isSelected) return { color, fillOpacity: 0.42, weight: 1, opacity: 0.9 };
  if (state === "live") return { color, fillOpacity: kind === "NO_SERVICE" ? 0.38 : 0.3, weight: 0.5, opacity: 0.45 };
  if (state === "off" || state === "upcoming") return { color, fillOpacity: 0.12, weight: 0 };
  return { color, fillOpacity: 0, weight: 0 };
}

export function zoneOutline(kind: ZoneKind, state: ZoneState): OutlineStyle {
  const color = ZONE_COLORS[kind];
  if (state === "live") return { color, weight: 2.5 };
  if (state === "off" || state === "upcoming") return { color, weight: 2, opacity: 0.7 };
  return { color, weight: 1.5, opacity: 0.4 };
}

/** Live zones draw above the ones that are not working now; the one picked on the map above all. */
const zoneLayer = (z: Zone, isSelected = false): HexLayerDef => {
  const state = zoneState(z);
  return { id: z.id, cells: z.cells, style: zoneStyle(z.kind, state, isSelected), outline: zoneOutline(z.kind, state), zIndex: isSelected ? 5 : state === "live" ? 4 : 3 };
};

/** Whether [z] matches a search ([q] trimmed, lower case): part of its name or its kind ("pickup point", "surge"). */
const matches = (z: Zone, q: string) => !q || z.name.toLowerCase().includes(q) || humanize(z.kind).toLowerCase().includes(q);

/** How long a zone picked on the map stays highlighted in the list and on the map. */
const FOCUS_MS = 2500;

/** A thin scrollbar that stays visible (overlay scrollbars hide until scrolled, so a long list looked cut off). */
const SCROLLBAR = "[scrollbar-color:#CBD5E1_transparent] [scrollbar-width:thin]";

/** The zone being edited: a navy edge on top of its own colour. */
const EDIT_OUTLINE: OutlineStyle = { color: "#0F172A", weight: 3 };

interface Draft {
  readonly id?: string;
  name: string;
  kind: ZoneKind;
  surgeMultiplier: string;
  rules: RulesDraft;
  /** The zone's hexagon size: the city's resolution or finer (the API takes up to [MAX_ZONE_RES]). */
  resolution: number;
}

/** Finest hexagons a zone may use (res 10 ≈ 150 m across: a gate, a bus stand). */
const MAX_ZONE_RES = 10;

/** Hexagon sizes a zone may use in a city at [cityRes]: the city's, then up to two finer, as people see them. */
function zoneSizes(cityRes: number): { res: number; label: string }[] {
  const across = (res: number) => {
    const m = [0, 0, 0, 0, 0, 0, 0, 2600, 1000, 400, 150][res] ?? 0;
    return m >= 1000 ? `~${(m / 1000).toFixed(m % 1000 ? 1 : 0)} km` : `~${m} m`;
  };
  return [cityRes, cityRes + 1, cityRes + 2]
    .filter((res) => res <= MAX_ZONE_RES)
    .map((res, i) => ({ res, label: `${["City size", "Fine", "Finest"][i]} (${across(res)} across)` }));
}

/** A zone's hexagon resolution: its cells', or the city's for a new zone. */
function zoneRes(cells: readonly string[], cityRes: number): number {
  return cells.length ? getResolution(cells[0]) : cityRes;
}

const STATE_BADGE: Record<ReturnType<typeof zoneState>, { label: string; className: string } | null> = {
  live: { label: "Live now", className: "bg-success-tint text-success-text" },
  off: { label: "Off now", className: "bg-muted text-muted-foreground" },
  upcoming: { label: "Starts later", className: "bg-info-tint text-navy-700" },
  ended: { label: "Ended", className: "bg-muted text-muted-foreground" },
  paused: null,
};

function ZoneActiveSwitch({ cityId, zone }: { cityId: string; zone: Zone }) {
  const [checked, setChecked] = useState(zone.isActive);
  const [isPending, startTransition] = useTransition();
  return (
    <Switch
      checked={checked}
      disabled={isPending}
      aria-label={`${zone.name} active`}
      onCheckedChange={(next) => {
        setChecked(next);
        startTransition(async () => {
          const res = await updateZone(cityId, zone.id, { isActive: next });
          if (res.ok) toast.success(next ? `${zone.name} active` : `${zone.name} paused`);
          else {
            setChecked(!next);
            toast.error(res.error);
          }
        });
      }}
    />
  );
}

/** Tab b) zones: list, create/edit by painting cells, delete. */
/** The zone's schedule, vehicles and what it stops, with "End now" while a dated zone runs. */
function ZoneRulesLine({ cityId, zone }: { cityId: string; zone: Zone }) {
  const [isPending, startTransition] = useTransition();
  const extras = [
    zone.kind === "SURGE" && zone.vehicleKinds.length ? vehiclesLabel(zone.vehicleKinds) : null,
    zone.kind === "NO_SERVICE" && !(zone.blockPickups && zone.blockDrops) ? (zone.blockPickups ? "No pickups" : "No drops") : null,
    zone.nudgeDrivers ? "Nudges drivers" : null,
    zone.kind === "PICKUP_POINT" && zone.meetingPoint ? `Meet at ${zone.meetingPoint}` : null,
  ].filter(Boolean);
  const canEnd = !!zone.endsAt && zoneState(zone) === "live";
  return (
    <p className="mt-1 flex items-center gap-2 pl-5 text-[11px] text-muted-foreground">
      <span className="min-w-0 flex-1">
        {scheduleLabel(zone)}
        {extras.length > 0 && ` · ${extras.join(" · ")}`}
      </span>
      {canEnd && (
        <Button
          size="xs"
          variant="outline"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const res = await updateZone(cityId, zone.id, { endsAt: new Date().toISOString() });
              if (res.ok) toast.success(`${zone.name} ended`);
              else toast.error(res.error);
            })
          }
        >
          End now
        </Button>
      )}
    </p>
  );
}

/** "7 days: 12 booked · 2 missed · 2.1 min wait · 3 online now" under a zone. */
function ZoneStatsLine({ stats }: { stats: AreaStats }) {
  const missedShare = stats.booked7d ? Math.round((stats.missed7d / stats.booked7d) * 100) : 0;
  return (
    <p className="mt-1 pl-5 text-[11px] text-muted-foreground tabular-nums">
      7 days: {formatCount(stats.booked7d)} booked ·{" "}
      <span className={missedShare >= 20 ? "font-medium text-error" : undefined}>
        {formatCount(stats.missed7d)} missed{stats.booked7d ? ` (${missedShare}%)` : ""}
      </span>
      {stats.avgWaitMin != null && ` · ${stats.avgWaitMin} min wait`} · {formatCount(stats.onlineNow)} online now
    </p>
  );
}

/**
 * Whether a scroll box has more below its fold, for the fade that says the list goes on. A ResizeObserver reports once
 * on start and again when the box resizes; [key] re-attaches it when the list is redrawn.
 */
function useMoreBelow(key: string) {
  const ref = useRef<HTMLUListElement>(null);
  const [isMore, setMore] = useState(false);
  const check = useCallback(() => {
    const el = ref.current;
    setMore(!!el && el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [check, key]);
  return { ref, isMore, check };
}

export function ZonesEditor({ city, stats }: { city: CityDetail; stats?: Readonly<Record<string, AreaStats>> }) {
  const service = useMemo(() => new Set(city.serviceCells), [city.serviceCells]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const ed = useCellEditor([]);
  const [toDelete, setToDelete] = useState<Zone | null>(null);
  const [isFullscreen, setFullscreen] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => city.zones.filter((z) => matches(z, q)), [city.zones, q]);
  // The zone picked by its label on the map or its row in the list, highlighted in both; [from] says which side moves
  // to it ([key] so a second pick moves again).
  const [focus, setFocus] = useState<{ id: string; key: number; from: "map" | "list" } | null>(null);
  const { ref: listRef, isMore, check: checkMore } = useMoreBelow(`${shown.length}-${!!draft}-${isFullscreen}`);
  const [isPending, startTransition] = useTransition();

  // Finer zone hexagons count as inside when their city-sized parent is.
  const cityCell = (c: string) => (getResolution(c) > city.h3Resolution ? toResolution([c], city.h3Resolution)[0] : c);
  const outside = draft ? ed.cells.filter((c) => !service.has(cityCell(c))) : [];
  const multiplier = Number(draft?.surgeMultiplier ?? 1);
  const isMultiplierValid = multiplier >= 1 && multiplier <= 1.5;
  const rulesProblem = draft ? rulesError(draft.rules, draft.kind) : null;
  const canSave = !!draft && draft.name.trim().length >= 2 && ed.cells.length > 0 && (draft.kind !== "SURGE" || isMultiplierValid) && !rulesProblem;

  function startEdit(z?: Zone) {
    setDraft(
      z
        ? { id: z.id, name: z.name, kind: z.kind, surgeMultiplier: String(z.surgeMultiplier), rules: rulesDraftOf(z), resolution: zoneRes(z.cells, city.h3Resolution) }
        : { name: "", kind: "SURGE", surgeMultiplier: "1.2", rules: rulesDraftOf(), resolution: city.h3Resolution },
    );
    ed.reset(z?.cells ?? []);
    ed.setTool("add");
  }

  function stopEdit() {
    setDraft(null);
    ed.reset([]);
    ed.setTool("pan");
  }

  const serviceLayer: HexLayerDef[] = useMemo(
    () => [{ id: "service", cells: city.serviceCells, zIndex: 1, style: SERVICE_AREA_STYLE, outline: SERVICE_AREA_EDGE }],
    [city.serviceCells],
  );
  const zoneLayers: HexLayerDef[] = useMemo(
    () => city.zones.filter((z) => z.id !== draft?.id).map((z) => zoneLayer(z, z.id === focus?.id)),
    [city.zones, draft?.id, focus?.id],
  );
  const labels = useMemo(() => city.zones.flatMap((z) => zoneLabel(z) ?? []), [city.zones]);

  // A label clicked on the map: its zone in the list (the search cleared if it hides it), scrolled to and highlighted.
  const showZone = useCallback(
    (id: string) => {
      const zone = city.zones.find((z) => z.id === id);
      if (!zone) return;
      setQuery((cur) => (matches(zone, cur.trim().toLowerCase()) ? cur : ""));
      setFocus({ id, key: Date.now(), from: "map" });
    },
    [city.zones],
  );
  useEffect(() => {
    if (!focus) return;
    // The row is looked up in the page, not kept in refs: full screen shows its own copy of the list, and the page's
    // copy going away a moment later would clear refs the two copies share.
    const item = focus.from === "map" ? document.querySelector<HTMLLIElement>(`li[data-zone-id="${CSS.escape(focus.id)}"]`) : null;
    const list = item?.closest("ul");
    if (list && item) {
      // Scroll only the list where it scrolls on its own (wide screens); on phones the page brings it into view. A long
      // way jumps at once (gliding past dozens of zones is slow), a short one glides.
      if (list.scrollHeight > list.clientHeight) {
        const top = list.scrollTop + item.getBoundingClientRect().top - list.getBoundingClientRect().top - (list.clientHeight - item.offsetHeight) / 2;
        list.scrollTo({ top, behavior: Math.abs(top - list.scrollTop) > list.clientHeight * 2 ? "instant" : "smooth" });
      } else item.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    const timer = setTimeout(() => setFocus(null), FOCUS_MS);
    return () => clearTimeout(timer);
  }, [focus]);
  // A row clicked in the list: the map moves to its zone.
  const showCells = useMemo(() => {
    const zone = focus?.from === "list" ? city.zones.find((z) => z.id === focus.id) : undefined;
    return zone && focus ? { cells: zone.cells, key: focus.key } : null;
  }, [focus, city.zones]);
  const showOnMap = useCallback((z: Zone) => setFocus({ id: z.id, key: Date.now(), from: "list" }), []);

  function save() {
    if (!draft || !canSave) return;
    const payload = {
      name: draft.name,
      kind: draft.kind,
      cells: [...ed.cells],
      color: ZONE_COLORS[draft.kind],
      surgeMultiplier: draft.kind === "SURGE" ? multiplier : 1,
      ...rulesPayload(draft.rules, draft.kind),
    };
    startTransition(async () => {
      const res = draft.id ? await updateZone(city.id, draft.id, payload) : await createZone(city.id, payload);
      if (res.ok) {
        toast.success(res.message);
        stopEdit();
      } else toast.error(res.error);
    });
  }

  // The zone list, or the edit form while editing: beside the map, and in the map's full screen too.
  const side = (
    <>
      {draft ? (
        <Card className={cn("lg:min-h-0 lg:overflow-y-auto", SCROLLBAR)}>
          <CardHeader>
            <CardTitle className="font-semibold">{draft.id ? "Edit zone" : "New zone"}</CardTitle>
            <CardDescription>
              {formatCount(ed.cells.length)} hexagons · {cellsToKm2(ed.cells.length, draft.resolution).toFixed(2)} km²
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="zone-name">Name</Label>
              <Input
                id="zone-name"
                value={draft.name}
                maxLength={60}
                placeholder="e.g. Gandhipuram bus stand"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Kind</Label>
              <Select
                value={draft.kind}
                onValueChange={(v) =>
  setDraft({ ...draft, kind: v as ZoneKind })
                }
              >
                <SelectTrigger className="w-full" aria-label="Zone kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ZONE_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={zoneSwatch(k)} />
                      {humanize(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{KIND_HINT[draft.kind]}</p>
            </div>
            <div className="grid gap-1.5">
              <Label>Hexagon size</Label>
              <Select
                value={String(draft.resolution)}
                onValueChange={(v) => {
                  const resolution = Number(v);
                  // Split each hexagon into its smaller ones (or merge them back), so nothing drawn is lost.
                  ed.commit(toResolution(ed.cells, resolution));
                  setDraft({ ...draft, resolution });
                }}
              >
                <SelectTrigger className="w-full" aria-label="Hexagon size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {zoneSizes(city.h3Resolution).map((o) => (
                    <SelectItem key={o.res} value={String(o.res)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Smaller hexagons follow the streets you want and leave the rest out.</p>
            </div>
            {draft.kind === "SURGE" && (
              <div className="grid gap-1.5">
                <Label htmlFor="zone-mult">Multiplier</Label>
                <Input
                  id="zone-mult"
                  type="number"
                  step="0.05"
                  min="1"
                  max="1.5"
                  className="w-32"
                  value={draft.surgeMultiplier}
                  aria-invalid={!isMultiplierValid}
                  onChange={(e) => setDraft({ ...draft, surgeMultiplier: e.target.value })}
                />
              </div>
            )}
            {draft.kind === "SURGE" && !isMultiplierValid && <p className="text-xs text-error">Multiplier must be 1.0–1.5</p>}
            <ZoneRulesFields kind={draft.kind} value={draft.rules} onChange={(rules) => setDraft({ ...draft, rules })} />
            {rulesProblem && <p className="text-xs text-error">{rulesProblem}</p>}
            {outside.length > 0 && (
              <div className="rounded-md bg-warning-tint px-2.5 py-2 text-xs text-warning-text">
                <p className="flex items-center gap-1 font-medium">
                  <TriangleAlertIcon className="size-3.5" /> {formatCount(outside.length)} hexagons are outside the service area
                </p>
                <p>They have no effect until the service area covers them.</p>
                <Button
                  size="xs"
                  variant="outline"
                  className="mt-1.5 bg-card"
                  onClick={() => ed.commit(ed.cells.filter((c) => service.has(cityCell(c))))}
                >
                  Remove outside hexagons
                </Button>
              </div>
            )}
            <div className="flex gap-2">
              <Button className="flex-1" disabled={!canSave || isPending} onClick={save}>
                {isPending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} {draft.id ? "Save zone" : "Create zone"}
              </Button>
              <Button variant="outline" onClick={stopEdit}>
                <XIcon /> Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button className="shrink-0" onClick={() => startEdit()}>
          <PlusIcon /> New zone
        </Button>
      )}

      {/* While a zone is being edited the form has the column to itself; the list comes back on save or cancel. */}
      {!draft && (
        <Card className="relative gap-0 pb-0 lg:min-h-0">
          <CardHeader className="shrink-0 border-b">
            <CardTitle className="font-semibold">Zones</CardTitle>
            <CardDescription>
              {q ? `${shown.length} of ${city.zones.length}` : city.zones.length} in {city.name}
            </CardDescription>
            {city.zones.length > 0 && (
              <div className="relative mt-2">
                <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={query}
                  placeholder="Search zones"
                  aria-label="Search zones"
                  className="pl-8"
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setQuery("")}
                />
              </div>
            )}
          </CardHeader>
          {city.zones.length === 0 ? (
            <EmptyState icon={HexagonIcon} title="No zones" description="Create surge, demand, no-service or pickup-point zones." />
          ) : shown.length === 0 ? (
            <EmptyState
              icon={SearchIcon}
              title={`No zones match “${query.trim()}”`}
              description="Search by part of a name or a kind, e.g. “metro” or “demand”."
              action={
                <Button size="sm" variant="outline" onClick={() => setQuery("")}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <ul ref={listRef} onScroll={checkMore} className={cn("divide-y lg:min-h-0 lg:overflow-y-auto", SCROLLBAR)}>
              {shown.map((z) => (
                <li
                  key={z.id}
                  data-zone-id={z.id}
                  className={cn("cursor-pointer px-4 py-3 transition-colors duration-500 hover:bg-muted/50", focus?.id === z.id && "bg-coral-50 hover:bg-coral-50")}
                  // A click on the row (not its switch or buttons) shows the zone on the map.
                  onClick={(e) => !(e.target as HTMLElement).closest("button, a, input") && showOnMap(z)}
                >
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-3 shrink-0 rounded-sm"
                      style={zoneSwatch(z.kind)}
                    />
                    <button
                      type="button"
                      title={`Show ${z.name} on the map`}
                      className="min-w-0 flex-1 truncate rounded-sm text-left text-sm font-medium text-navy-900 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      onClick={() => showOnMap(z)}
                    >
                      {z.name}
                    </button>
                    <ZoneActiveSwitch key={`${z.id}-${z.isActive}`} cityId={city.id} zone={z} />
                  </div>
                  <div className="mt-1 flex items-center gap-2 pl-5 text-xs text-muted-foreground">
                    <Badge variant="outline">{humanize(z.kind)}</Badge>
                    {z.kind === "SURGE" && <span>{z.surgeMultiplier.toFixed(2)}×</span>}
                    <span>
                      {formatCount(z.cells.length)} {zoneRes(z.cells, city.h3Resolution) > city.h3Resolution ? "fine " : ""}cells
                    </span>
                    {STATE_BADGE[zoneState(z)] && (
                      <span className={cn("rounded-full px-1.5 py-px text-[10px] font-medium", STATE_BADGE[zoneState(z)]!.className)}>{STATE_BADGE[zoneState(z)]!.label}</span>
                    )}
                    <span className="ml-auto flex">
                      <Button variant="ghost" size="icon-xs" aria-label={`Edit ${z.name}`} onClick={() => startEdit(z)}>
                        <PencilIcon />
                      </Button>
                      <Button variant="ghost" size="icon-xs" aria-label={`Delete ${z.name}`} onClick={() => setToDelete(z)}>
                        <Trash2Icon />
                      </Button>
                    </span>
                  </div>
                  <ZoneRulesLine cityId={city.id} zone={z} />
                  {stats?.[z.id] && <ZoneStatsLine stats={stats[z.id]} />}
                </li>
              ))}
            </ul>
          )}
          {isMore && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-card to-transparent" />}
        </Card>
      )}
    </>
  );

  return (
    // The zone list sits left of the map (after it on phones). Nothing on the page scrolls: the list column is exactly
    // the map's height (its contents are laid over it, so they can't make the row taller), and only the zone list, or
    // the edit form while editing, scrolls inside it.
    <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start 2xl:grid-cols-[400px_minmax(0,1fr)]">
      <HexWorkbench
        center={{ lat: city.centerLat, lng: city.centerLng }}
        resolution={draft?.resolution ?? city.h3Resolution}
        fitCells={city.serviceCells}
        editor={draft ? ed : null}
        editStyle={zoneStyle(draft?.kind ?? "SURGE", "live", true)}
        editOutline={EDIT_OUTLINE}
        targetLabel="zone"
        groups={[
          { key: "service", label: "Service area", layers: serviceLayer },
          { key: "zones", label: "Zones", layers: zoneLayers },
        ]}
        warnCells={outside}
        zoneLabels={labels}
        onZoneLabelClick={draft ? undefined : showZone}
        showCells={showCells}
        boundaries={[city.placeId]}
        panel={side}
        onFullscreenChange={setFullscreen}
        status={
          draft ? (
            <span className="tabular-nums">
              {draft.name || "New zone"}: <b className="text-navy-900">{formatCount(ed.cells.length)}</b> hexagons
              {outside.length > 0 && <span className="text-warning-text"> · {formatCount(outside.length)} outside</span>}
            </span>
          ) : null
        }
      />

      {!isFullscreen && (
        <div className="lg:relative lg:order-first lg:self-stretch">
          <div className="flex flex-col gap-4 lg:absolute lg:inset-0">{side}</div>
        </div>
      )}

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete zone “{toDelete?.name}”?</DialogTitle>
            <DialogDescription>Fares and dispatch stop using it immediately. This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() =>
                toDelete &&
                startTransition(async () => {
                  const res = await deleteZone(city.id, toDelete.id);
                  if (res.ok) {
                    toast.success(res.message);
                    if (draft?.id === toDelete.id) stopEdit();
                    setToDelete(null);
                  } else toast.error(res.error);
                })
              }
            >
              {isPending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
