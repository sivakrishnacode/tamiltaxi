"use client";

import { Loader2Icon, SaveIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { HexWorkbench } from "@/components/map/editor/hex-workbench";
import { useCellEditor } from "@/components/map/editor/use-cell-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCount } from "@/lib/format";
import type { CityDetail } from "@/lib/types";
import { cellsToKm2 } from "@/lib/validation";
import { zoneLabel } from "@/lib/zone-label";
import { zoneState } from "@/lib/zone-rules";

import { saveServiceCells } from "../../actions";
import { zoneOutline } from "./zones-editor";

/** A light coral wash with faint hexagon lines, so the roads and names under it stay readable; the edge is solid. */
export const SERVICE_STYLE = { color: "#D84315", fillColor: "#F4511E", fillOpacity: 0.14, weight: 0.6, opacity: 0.45 } as const;
const SERVICE_OUTLINE = { color: "#C2410C", weight: 2.5 } as const;

function sameCells(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((c, i) => c === b[i]);
}

/** Tab a) paint the city's H3 service area and save it → PUT /admin/cities/:id/service-cells. */
export function ServiceAreaEditor({ city }: { city: CityDetail }) {
  const saved = useMemo(() => [...city.serviceCells].sort(), [city.serviceCells]);
  const [baseline, setBaseline] = useState(saved);
  const ed = useCellEditor(saved);
  const [isPending, startTransition] = useTransition();
  const isDirty = !sameCells(ed.cells, baseline);
  const diff = ed.cells.length - baseline.length;

  const zoneLayers = useMemo(
    () => city.zones.map((z) => ({ id: `z-${z.id}`, cells: z.cells, zIndex: 11, style: { color: "#000000", fillOpacity: 0, weight: 0 }, outline: zoneOutline(z.kind, zoneState(z)) })),
    [city.zones],
  );
  const labels = useMemo(() => city.zones.flatMap((z) => zoneLabel(z) ?? []), [city.zones]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
      <HexWorkbench
        center={{ lat: city.centerLat, lng: city.centerLng }}
        resolution={city.h3Resolution}
        fitCells={saved.length ? saved : ed.cells}
        editor={ed}
        editStyle={SERVICE_STYLE}
        editOutline={SERVICE_OUTLINE}
        targetLabel="service area"
        groups={[{ key: "zones", label: "Zones (outlines)", layers: zoneLayers }]}
        zoneLabels={labels}
        boundaries={[city.placeId]}
        status={
          <span className="tabular-nums">
            <b className="text-navy-900">{formatCount(ed.cells.length)}</b> hexagons · ≈
            {formatCount(Math.round(cellsToKm2(ed.cells.length, city.h3Resolution)))} km²
          </span>
        }
      />

      <div className="grid content-start gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="font-semibold">Service area</CardTitle>
            <CardDescription>H3 resolution {city.h3Resolution} · each hexagon ≈ {cellsToKm2(1, city.h3Resolution).toFixed(2)} km²</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">Hexagons</dt>
                <dd className="font-heading text-xl font-semibold tabular-nums">{formatCount(ed.cells.length)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Area</dt>
                <dd className="font-heading text-xl font-semibold tabular-nums">
                  {formatCount(Math.round(cellsToKm2(ed.cells.length, city.h3Resolution)))} km²
                </dd>
              </div>
            </dl>
            {isDirty && (
              <p className="rounded-md bg-warning-tint px-2.5 py-1.5 text-xs text-warning-text">
                Unsaved: {diff >= 0 ? "+" : "−"}
                {formatCount(Math.abs(diff))} hexagons vs saved
              </p>
            )}
            <Button
              disabled={!isDirty || isPending}
              onClick={() =>
                startTransition(async () => {
                  const res = await saveServiceCells(city.id, [...ed.cells]);
                  if (res.ok) {
                    setBaseline([...ed.cells]);
                    toast.success(res.message);
                  } else toast.error(res.error);
                })
              }
            >
              {isPending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Save service area
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" disabled={!isDirty} onClick={() => ed.commit(baseline)}>
                Discard changes
              </Button>
              <Button variant="outline" size="sm" className="flex-1 text-error" disabled={ed.cells.length === 0} onClick={() => ed.commit([])}>
                <Trash2Icon /> Clear
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="font-semibold">How to edit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-navy-700">
            <p>
              <b>Find</b> a locality with the search box, then <b>Add area around here</b>.
            </p>
            <p>
              <b>Draw area</b> (D): click around a neighbourhood and add or remove it in one go.
            </p>
            <p>
              <b>Paint / Erase</b> (P / E) with a 1, 7, 19 or 37-hex brush ([ and ]) for the edges.
            </p>
            <p>Satellite view helps to follow real roads and layouts. Nothing is saved until you press Save.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
