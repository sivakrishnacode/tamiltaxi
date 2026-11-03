import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page";
import { adminApi } from "@/lib/api";
import { presetRange } from "@/lib/heat";
import { param } from "@/lib/paging";
import { HEATMAP_METRICS, type HeatmapMetric } from "@/lib/types";

import { HeatmapView } from "./heatmap-view";

export const metadata: Metadata = { title: "Heatmap" };

const PRESETS = ["today", "7d", "30d"] as const;

/** ?metric=unmet&when=7d opens on that layer and range (links from Missed rides). */
export default async function HeatmapPage({ searchParams }: PageProps<"/heatmap">) {
  const sp = await searchParams;
  const asked = param(sp.metric) as HeatmapMetric | undefined;
  const metric = asked && HEATMAP_METRICS.includes(asked) ? asked : "pickups";
  const when = PRESETS.find((p) => p === param(sp.when)) ?? "30d";
  const [initial, cities] = await Promise.all([adminApi.heatmap({ metric, ...presetRange(when) }), adminApi.cities()]);
  return (
    <>
      <PageHeader
        title="Heatmap"
        description="Where trips start, end, earn and go unserved, per H3 hexagon from real trips. Turn hot spots into zones or service area."
      />
      <HeatmapView
        key={`${metric}-${when}`}
        initial={initial}
        initialPreset={when}
        cities={cities
          .filter((c) => c.isActive)
          .map((c) => ({ id: c.id, name: c.name, h3Resolution: c.h3Resolution, centerLat: c.centerLat, centerLng: c.centerLng, serviceCells: c.serviceCells, placeId: c.placeId }))}
      />
    </>
  );
}
