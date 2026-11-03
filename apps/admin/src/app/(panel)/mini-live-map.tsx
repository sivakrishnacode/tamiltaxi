"use client";

import { LiveMap } from "@/components/map/google/live-map";
import type { LiveData } from "@/lib/types";

/** Small, non-interactive-looking live map for the dashboard card. */
export function MiniLiveMap({ data, center, boundaries }: { data: LiveData; center: [number, number]; boundaries: readonly (string | null)[] }) {
  return <LiveMap data={data} center={center} boundaries={boundaries} compact className="h-full rounded-none" />;
}
