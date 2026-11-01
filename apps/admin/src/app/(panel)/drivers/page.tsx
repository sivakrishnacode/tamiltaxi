import { BanIcon, IdCardIcon, StarIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ExportButton } from "@/components/common/export-button";
import { LinkTabs } from "@/components/common/link-tabs";
import { ListFilters } from "@/components/common/list-filters";
import { OwnerOnly } from "@/components/common/owner-only";
import { EmptyState, PageHeader } from "@/components/common/page";
import { Pager } from "@/components/common/pager";
import { KycProgress, OnlineDot, PlateBadge, StatusBadge } from "@/components/common/status";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminApi, docFileHref } from "@/lib/api";
import { displayName, formatCount, formatDate, formatPhone, humanize, initials, kycProgress, vehicleLabel } from "@/lib/format";
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

/** Paused for too many cancellations right now. */
function isPausedNow(until: string | null | undefined): boolean {
  return !!until && new Date(until).getTime() > Date.now();
}

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
    sort: param(sp.sort),
  };
  const page = parsePage(sp.page);
  const [data, settings] = await Promise.all([
    adminApi.drivers({ ...query, page, pageSize }),
    adminApi.settings().catch(() => null),
  ]);
  const isFiltered = !!(query.q || query.status || query.vehicle || query.online || query.gender);
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
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Driver</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>KYC</TableHead>
                <TableHead>Rating</TableHead>
                {showPlans && <TableHead>Plan</TableHead>}
                <TableHead className="text-center">Online</TableHead>
                <TableHead className="pr-4">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((d) => {
                const kyc = kycProgress(d.documents, d.user.identityStatus ?? "NOT_STARTED");
                const sub = d.subscriptions[0];
                const isPaused = isPausedNow(d.blockedUntil);
                return (
                  <TableRow key={d.id} className="relative">
                    <TableCell className="pl-4">
                      <Link
                        href={`/drivers/${d.id}`}
                        className="flex items-center gap-2.5 font-medium text-navy-900 after:absolute after:inset-0 hover:text-coral-600"
                      >
                        <Avatar className="size-8">
                          {d.photoFile && <AvatarImage src={docFileHref(d.photoFile)} alt="" className="object-cover" />}
                          <AvatarFallback className="bg-coral-50 text-xs font-semibold text-coral-600">{initials(d.user.name)}</AvatarFallback>
                        </Avatar>
                        <span className="min-w-0">
                          <span className="block truncate">{displayName(d.user)}</span>
                          <span className="flex flex-wrap gap-1">
                            {d.user.gender === "FEMALE" && (
                              <Badge variant="secondary" className="h-4 bg-pink-50 px-1.5 text-[10px] text-pink-700">
                                Woman
                              </Badge>
                            )}
                            {d.user.isBlocked && (
                              <Badge variant="secondary" className="h-4 bg-error-tint px-1.5 text-[10px] text-error">
                                <BanIcon /> Blocked
                              </Badge>
                            )}
                            {isPaused && (
                              <Badge variant="secondary" className="h-4 bg-warning-tint px-1.5 text-[10px] text-warning-text">
                                Paused
                              </Badge>
                            )}
                          </span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-navy-700 tabular-nums">{formatPhone(d.user.phone)}</TableCell>
                    <TableCell>
                      <span className="flex flex-col items-start gap-1">
                        <span className="text-xs text-muted-foreground">
                          {vehicleLabel(d.vehicleKind)} · {d.vehicleModel}
                        </span>
                        <PlateBadge plate={d.plate} />
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={d.status} />
                    </TableCell>
                    <TableCell>
                      <KycProgress verified={kyc.verified} total={kyc.total} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 font-medium text-navy-900 tabular-nums">
                        <StarIcon className="size-3.5 fill-warning text-warning" aria-hidden /> {d.rating.toFixed(1)}
                      </span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {formatCount(d.ridesCount)} {d.ridesCount === 1 ? "trip" : "trips"}
                      </span>
                    </TableCell>
                    {showPlans && (
                      <TableCell>
                        {sub ? (
                          <span className="flex flex-col items-start gap-1">
                            <StatusBadge status={sub.status} />
                            <span className="text-xs text-muted-foreground">{humanize(sub.plan.period)}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">No plan</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-center">
                      <OnlineDot isOnline={d.isOnline} />
                    </TableCell>
                    <TableCell className="pr-4 text-navy-700">{formatDate(d.createdAt)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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
