"use client";

import { HexagonIcon, Loader2Icon, PencilIcon, PlusIcon, SaveIcon, Trash2Icon, TriangleAlertIcon, XIcon } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/page";
import { HexWorkbench } from "@/components/map/editor/hex-workbench";
import { useCellEditor } from "@/components/map/editor/use-cell-editor";
import type { HexLayerDef, HexStyle } from "@/components/map/google/hex-layer";
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
import { formatCount, humanize, vehicleLabel } from "@/lib/format";
import { ZONE_KINDS, type AreaStats, type CityDetail, type Zone, type ZoneKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { cellsToKm2 } from "@/lib/validation";
import { zoneLabel } from "@/lib/zone-label";
import { scheduleLabel, zoneState } from "@/lib/zone-rules";

import { createZone, deleteZone, updateZone } from "../../actions";
import { rulesDraftOf, rulesError, rulesPayload, ZoneRulesFields, type RulesDraft } from "./zone-rules-fields";

const KIND_HINT: Record<ZoneKind, string> = {
  SURGE: "Higher demand: shown to drivers and can raise fares (1.0–1.5×)",
  DEMAND: "Demand hotspot for drivers, no price change",
  NO_SERVICE: "No pickups or drops inside",
  PICKUP_POINT: "Airport / station style pickup point",
};

const DEFAULT_COLOR: Record<ZoneKind, string> = {
  SURGE: "#D84315",
  DEMAND: "#F59E0B",
  NO_SERVICE: "#B91C1C",
  PICKUP_POINT: "#2563EB",
};

export function zoneStyle(z: { kind: ZoneKind; color: string; isActive?: boolean }, isSelected = false): HexStyle {
  if (z.kind === "NO_SERVICE") {
    return { color: "#B91C1C", fillColor: "#B91C1C", fillOpacity: isSelected ? 0.45 : 0.32, weight: isSelected ? 2 : 1.5 };
  }
  return {
    color: z.color,
    fillOpacity: isSelected ? 0.45 : z.isActive === false ? 0.08 : 0.3,
    weight: isSelected ? 2 : 1,
    opacity: z.isActive === false ? 0.5 : 1,
  };
}

interface Draft {
  readonly id?: string;
  name: string;
  kind: ZoneKind;
  surgeMultiplier: string;
  color: string;
  rules: RulesDraft;
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
    zone.kind === "SURGE" && zone.vehicleKinds.length ? zone.vehicleKinds.map(vehicleLabel).join(", ") : null,
    zone.kind === "NO_SERVICE" && !(zone.blockPickups && zone.blockDrops) ? (zone.blockPickups ? "No pickups" : "No drops") : null,
    zone.nudgeDrivers ? "Nudges drivers" : null,
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

export function ZonesEditor({ city, stats }: { city: CityDetail; stats?: Readonly<Record<string, AreaStats>> }) {
  const service = useMemo(() => new Set(city.serviceCells), [city.serviceCells]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const ed = useCellEditor([]);
  const [toDelete, setToDelete] = useState<Zone | null>(null);
  const [isPending, startTransition] = useTransition();

  const outside = draft ? ed.cells.filter((c) => !service.has(c)) : [];
  const multiplier = Number(draft?.surgeMultiplier ?? 1);
  const isMultiplierValid = multiplier >= 1 && multiplier <= 1.5;
  const rulesProblem = draft ? rulesError(draft.rules, draft.kind) : null;
  const canSave = !!draft && draft.name.trim().length >= 2 && ed.cells.length > 0 && (draft.kind !== "SURGE" || isMultiplierValid) && !rulesProblem;

  function startEdit(z?: Zone) {
    setDraft(
      z
        ? { id: z.id, name: z.name, kind: z.kind, surgeMultiplier: String(z.surgeMultiplier), color: z.color, rules: rulesDraftOf(z) }
        : { name: "", kind: "SURGE", surgeMultiplier: "1.2", color: DEFAULT_COLOR.SURGE, rules: rulesDraftOf() },
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
    () => [{ id: "service", cells: city.serviceCells, zIndex: 1, style: { color: "#D84315", fillColor: "#F4511E", fillOpacity: 0.1, weight: 0.6, opacity: 0.6 } }],
    [city.serviceCells],
  );
  const zoneLayers: HexLayerDef[] = useMemo(
    () => city.zones.filter((z) => z.id !== draft?.id).map((z) => ({ id: z.id, cells: z.cells, style: zoneStyle(z), zIndex: 3 })),
    [city.zones, draft?.id],
  );
  const labels = useMemo(() => city.zones.flatMap((z) => zoneLabel(z) ?? []), [city.zones]);

  function save() {
    if (!draft || !canSave) return;
    const payload = {
      name: draft.name,
      kind: draft.kind,
      cells: [...ed.cells],
      color: draft.color,
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

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <HexWorkbench
        center={{ lat: city.centerLat, lng: city.centerLng }}
        resolution={city.h3Resolution}
        fitCells={city.serviceCells}
        editor={draft ? ed : null}
        editStyle={draft ? zoneStyle({ kind: draft.kind, color: draft.color }, true) : zoneStyle({ kind: "SURGE", color: "#D84315" })}
        targetLabel="zone"
        groups={[
          { key: "service", label: "Service area", layers: serviceLayer },
          { key: "zones", label: "Zones", layers: zoneLayers },
        ]}
        warnCells={outside}
        zoneLabels={labels}
        status={
          draft ? (
            <span className="tabular-nums">
              {draft.name || "New zone"}: <b className="text-navy-900">{formatCount(ed.cells.length)}</b> hexagons
              {outside.length > 0 && <span className="text-warning-text"> · {formatCount(outside.length)} outside</span>}
            </span>
          ) : null
        }
      />

      <div className="grid content-start gap-4">
        {draft ? (
          <Card>
            <CardHeader>
              <CardTitle className="font-semibold">{draft.id ? "Edit zone" : "New zone"}</CardTitle>
              <CardDescription>
                {formatCount(ed.cells.length)} hexagons · {cellsToKm2(ed.cells.length, city.h3Resolution).toFixed(1)} km²
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
                    setDraft({
                      ...draft,
                      kind: v as ZoneKind,
                      color: draft.color === DEFAULT_COLOR[draft.kind] ? DEFAULT_COLOR[v as ZoneKind] : draft.color,
                    })
                  }
                >
                  <SelectTrigger className="w-full" aria-label="Zone kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ZONE_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {humanize(k)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{KIND_HINT[draft.kind]}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {draft.kind === "SURGE" && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="zone-mult">Multiplier</Label>
                    <Input
                      id="zone-mult"
                      type="number"
                      step="0.05"
                      min="1"
                      max="1.5"
                      value={draft.surgeMultiplier}
                      aria-invalid={!isMultiplierValid}
                      onChange={(e) => setDraft({ ...draft, surgeMultiplier: e.target.value })}
                    />
                  </div>
                )}
                <div className="grid gap-1.5">
                  <Label htmlFor="zone-color">Colour</Label>
                  <Input
                    id="zone-color"
                    type="color"
                    className="h-9 p-1"
                    value={draft.color}
                    onChange={(e) => setDraft({ ...draft, color: e.target.value.toUpperCase() })}
                  />
                </div>
              </div>
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
                    onClick={() => ed.commit(ed.cells.filter((c) => service.has(c)))}
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
          <Button onClick={() => startEdit()}>
            <PlusIcon /> New zone
          </Button>
        )}

        <Card className="gap-0 pb-0">
          <CardHeader className="border-b">
            <CardTitle className="font-semibold">Zones</CardTitle>
            <CardDescription>{city.zones.length} in {city.name}</CardDescription>
          </CardHeader>
          {city.zones.length === 0 ? (
            <EmptyState icon={HexagonIcon} title="No zones" description="Create surge, demand, no-service or pickup-point zones." />
          ) : (
            <ul className="divide-y">
              {city.zones.map((z) => (
                <li key={z.id} className={draft?.id === z.id ? "bg-coral-50/60 px-4 py-3" : "px-4 py-3"}>
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-3 shrink-0 rounded-sm"
                      style={
                        z.kind === "NO_SERVICE"
                          ? { background: "repeating-linear-gradient(45deg,#B91C1C 0 2px,#FEE2E2 2px 5px)" }
                          : { background: z.color }
                      }
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-navy-900">{z.name}</span>
                    <ZoneActiveSwitch key={`${z.id}-${z.isActive}`} cityId={city.id} zone={z} />
                  </div>
                  <div className="mt-1 flex items-center gap-2 pl-5 text-xs text-muted-foreground">
                    <Badge variant="outline">{humanize(z.kind)}</Badge>
                    {z.kind === "SURGE" && <span>{z.surgeMultiplier.toFixed(2)}×</span>}
                    <span>{formatCount(z.cells.length)} cells</span>
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
        </Card>
      </div>

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
