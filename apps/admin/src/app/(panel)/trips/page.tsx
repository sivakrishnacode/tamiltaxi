import { PackageIcon, RouteIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ExportButton } from "@/components/common/export-button";
import { ListFilters } from "@/components/common/list-filters";
import { OwnerOnly } from "@/components/common/owner-only";
import { EmptyState, PageHeader } from "@/components/common/page";
import { Pager } from "@/components/common/pager";
import { StatusBadge } from "@/components/common/status";
import { TripRouteCell } from "@/components/common/trip-bits";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminApi } from "@/lib/api";
import { displayName, formatCount, formatDate, formatInr, formatTime, humanize, shortId, vehicleLabel } from "@/lib/format";
import { presetRange } from "@/lib/heat";
import { param, pageSizeParam, parsePage, parsePageSize } from "@/lib/paging";
import { TRIP_STATUSES, VEHICLE_KINDS } from "@/lib/types";
import { FAULT_LABEL } from "@/lib/cancel";

export const metadata: Metadata = { title: "All trips" };

const WHEN = ["today", "7d", "30d"] as const;
type When = (typeof WHEN)[number];

export default async function TripsPage({ searchParams }: PageProps<"/trips">) {
  const sp = await searchParams;
  const when = param(sp.when) as When | undefined;
  const query = {
    q: param(sp.q),
    status: param(sp.status),
    kind: param(sp.kind),
    vehicle: param(sp.vehicle),
    review: param(sp.review),
    when: when && WHEN.includes(when) ? when : undefined,
    sort: param(sp.sort),
  };
  const page = parsePage(sp.page);
  const pageSize = parsePageSize(sp.pageSize);
  // "Booked today / in the last 7 / 30 days" (IST midnight for today).
  const range = query.when ? presetRange(query.when) : null;
  const data = await adminApi.trips({
    q: query.q,
    status: query.status,
    kind: query.kind,
    vehicle: query.vehicle,
    review: query.review,
    sort: query.sort,
    from: range?.from,
    page,
    pageSize,
  });
  const isFiltered = !!(query.q || query.status || query.kind || query.vehicle || query.review || query.when);

  return (
    <>
      <PageHeader
        title="All trips"
        description={`${formatCount(data.total)} ${isFiltered ? "matching" : ""} rides and parcel deliveries.`}
        actions={
          <OwnerOnly>
            <ExportButton entity="trips" />
          </OwnerOnly>
        }
      />
      <ListFilters
        searchPlaceholder="Trip id, pickup or drop"
        filters={[
          { name: "when", label: "Dates", options: [{ value: "today", label: "Today" }, { value: "7d", label: "Last 7 days" }, { value: "30d", label: "Last 30 days" }] },
          { name: "kind", label: "Kinds", options: [{ value: "RIDE", label: "Rides" }, { value: "PARCEL", label: "Parcels" }] },
          { name: "vehicle", label: "Vehicles", options: VEHICLE_KINDS.map((v) => ({ value: v, label: vehicleLabel(v) })) },
          { name: "status", label: "Statuses", options: TRIP_STATUSES.map((s) => ({ value: s, label: humanize(s) })) },
          { name: "review", label: "Trips", options: [{ value: "true", label: "Needs review" }] },
          {
            name: "sort",
            label: "Sort",
            defaultValue: "newest",
            options: [
              { value: "newest", label: "Newest first" },
              { value: "oldest", label: "Oldest first" },
              { value: "fare", label: "Highest fare" },
            ],
          },
        ]}
      />
      <Card className="gap-0 py-0">
        {data.items.length === 0 ? (
          <EmptyState
            icon={RouteIcon}
            title={isFiltered ? "No trips match" : "No trips yet"}
            description={isFiltered ? "Try a different search or filter." : "Bookings from the Tamil Taxi app appear here."}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Trip</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Passenger</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead className="text-right">Fare</TableHead>
                <TableHead className="pr-4">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((t) => (
                <TableRow key={t.id} className="relative">
                  <TableCell className="pl-4">
                    <Link
                      href={`/trips/${t.id}`}
                      className="font-mono text-xs font-semibold text-navy-900 after:absolute after:inset-0 hover:text-coral-600"
                    >
                      #{shortId(t.id)}
                    </Link>
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      {t.kind === "PARCEL" ? <PackageIcon className="size-3" /> : <RouteIcon className="size-3" />}
                      {t.kind === "PARCEL" ? "Parcel" : "Ride"}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-navy-700">
                    {formatDate(t.createdAt)}
                    <span className="block text-xs text-muted-foreground">{formatTime(t.createdAt)}</span>
                  </TableCell>
                  <TableCell>{vehicleLabel(t.vehicleKind)}</TableCell>
                  <TableCell>
                    <TripRouteCell pickup={t.pickupName} drop={t.dropName} />
                  </TableCell>
                  <TableCell>
                    <Link href={`/users/${t.passengerId}`} className="relative z-10 hover:text-coral-600 hover:underline">
                      {displayName(t.passenger)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {t.driver ? (
                      <Link href={`/drivers/${t.driver.id}`} className="relative z-10 hover:text-coral-600 hover:underline">
                        {displayName(t.driver.user)}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatInr(t.fareTotal)}</TableCell>
                  <TableCell className="pr-4">
                    <StatusBadge status={t.status} />
                    {t.needsReview && (
                      <span className="mt-1 block text-[11px] font-medium text-warning-text">Needs review</span>
                    )}
                    {t.status === "CANCELLED" && t.cancellations?.[0]?.fault && (
                      <span className="mt-1 block text-[11px] text-muted-foreground" title={t.cancellations[0].faultRule ?? undefined}>
                        {FAULT_LABEL[t.cancellations[0].fault]}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pager
          path="/trips"
          query={{ ...query, pageSize: pageSizeParam(pageSize) }}
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          noun="trips"
          canResize
        />
      </Card>
    </>
  );
}
