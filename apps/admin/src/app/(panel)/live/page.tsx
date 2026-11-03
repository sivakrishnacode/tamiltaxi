import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page";
import { adminApi } from "@/lib/api";

import { LiveView } from "./live-view";

export const metadata: Metadata = { title: "Live map" };

export default async function LivePage() {
  const [live, cities, demand] = await Promise.all([adminApi.live(), adminApi.cities(), adminApi.demand().catch(() => null)]);
  return (
    <>
      <PageHeader title="Live map" description="Online drivers, active trips and live demand vs supply (surge) per area." />
      <LiveView
        initial={live}
        initialDemand={demand}
        cities={cities.filter((c) => c.isActive).map((c) => ({ id: c.id, name: c.name, centerLat: c.centerLat, centerLng: c.centerLng, placeId: c.placeId }))}
      />
    </>
  );
}
