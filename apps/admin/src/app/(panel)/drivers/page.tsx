import { IdCardIcon } from "lucide-react";
import type { Metadata } from "next";

import { ExportButton } from "@/components/common/export-button";
import { LinkTabs } from "@/components/common/link-tabs";
import { ListFilters } from "@/components/common/list-filters";
import { OwnerOnly } from "@/components/common/owner-only";
import { EmptyState, PageHeader } from "@/components/common/page";
import { Pager } from "@/components/common/pager";
import { DriversTable } from "@/components/people/drivers-table";
import { Card } from "@/components/ui/card";
import { adminApi } from "@/lib/api";
import { formatCount, vehicleLabel } from "@/lib/format";
import { param, pageSizeParam, parsePage, parsePageSize, withQuery } from "@/lib/paging";
import { DRIVER_STATUSES, DRIVER_VEHICLE_KINDS, type DriverStatus } from "@/lib/types";

export const metadata: Metadata = { title: "All drivers" };

const STATUS_TABS: { value: DriverStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "APPROVED", label: "Approved" },
  { value: "PENDING", label: "Pending" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "REJECTED", label: "Rejected" },
];

const DRIVER_SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "rating", label: "Best rated" },
  { value: "trips", label: "Most trips" },
  { value: "name", label: "Name A–Z" },
];

export default async function DriversPage({ searchParams }: PageProps<"/drivers">) {
  const sp = await searchParams;
  const status = param(sp.status) as DriverStatus | undefined;
  const pageSize = parsePageSize(sp.pageSize);
  const query = {
    q: param(sp.q),
    status: status && DRIVER_STATUSES.includes(status) ? status : undefined,
    vehicle: param(sp.vehicle),
    online: param(sp.online),
    gender: param(sp.gender),
    city: param(sp.city),
    sort: param(sp.sort),
  };
  const page = parsePage(sp.page);
  const [data, settings, cities] = await Promise.all([
    adminApi.drivers({ ...query, page, pageSize }),
    adminApi.settings().catch(() => null),
    adminApi.cities().catch(() => []),
  ]);
  const isFiltered = !!(query.q || query.status || query.vehicle || query.online || query.gender || query.city);
  const cityNames = Object.fromEntries(cities.map((c) => [c.id, c.name]));
  // The plan column only matters while paid plans are on.
  const showPlans = settings?.driverPlansEnabled ?? true;
  const counts = data.counts;
  const allCount = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined;

  return (
    <>
      <PageHeader
        title="All drivers"
        description={`${formatCount(data.total)} ${isFiltered ? "matching" : "registered"} drivers. Approve new ones in Approvals; open a driver to hold or reactivate them.`}
        actions={
          <OwnerOnly>
            <ExportButton entity="drivers" />
          </OwnerOnly>
        }
      />
      <LinkTabs
        active={query.status ?? "ALL"}
        tabs={STATUS_TABS.map((t) => {
          const n = t.value === "ALL" ? allCount : counts?.[t.value];
          return {
            value: t.value,
            label: t.label,
            href: withQuery("/drivers", { ...query, status: t.value === "ALL" ? undefined : t.value, pageSize: pageSizeParam(pageSize) }),
            count: n !== undefined ? <span className="text-xs font-normal text-muted-foreground tabular-nums">{formatCount(n)}</span> : undefined,
          };
        })}
      />
      <ListFilters
        searchPlaceholder="Name, phone or plate"
        filters={[
          { name: "vehicle", label: "Vehicles", options: DRIVER_VEHICLE_KINDS.map((v) => ({ value: v, label: vehicleLabel(v) })) },
          { name: "online", label: "Online & offline", options: [{ value: "true", label: "Online now" }, { value: "false", label: "Offline" }] },
          { name: "gender", label: "Genders", options: [{ value: "FEMALE", label: "Women drivers" }, { value: "MALE", label: "Men" }] },
          { name: "city", label: "Cities", options: [...cities.map((c) => ({ value: c.id, label: c.name })), { value: "none", label: "No city yet" }] },
          { name: "sort", label: "Sort", options: DRIVER_SORT_OPTIONS, defaultValue: "newest" },
        ]}
      />
      <Card className="gap-0 py-0">
        {data.items.length === 0 ? (
          <EmptyState
            icon={IdCardIcon}
            title={isFiltered ? "No drivers match" : "No drivers yet"}
            description={isFiltered ? "Try another name, phone number, tab or filter." : "Drivers appear here once they register in the Tamil Taxi Driver app."}
          />
        ) : (
          <DriversTable items={data.items} showPlans={showPlans} cityNames={cityNames} />
        )}
        <Pager
          path="/drivers"
          query={{ ...query, pageSize: pageSizeParam(pageSize) }}
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          noun="drivers"
          canResize
        />
      </Card>
    </>
  );
}
