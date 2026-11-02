import { ArrowLeftIcon, CarIcon, FlameIcon, HexagonIcon, IdCardIcon, RouteIcon, TimerIcon, UserXIcon, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LinkTabs } from "@/components/common/link-tabs";
import { ListFilters } from "@/components/common/list-filters";
import { EmptyState } from "@/components/common/page";
import { Pager } from "@/components/common/pager";
import { DriversTable } from "@/components/people/drivers-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canManageCity, isOwner } from "@/lib/access";
import { getAccess } from "@/lib/access-server";
import { adminApi } from "@/lib/api";
import { formatCount, humanize, vehicleLabel } from "@/lib/format";
import { pageSizeParam, param, parsePage, parsePageSize, withQuery } from "@/lib/paging";
import { DRIVER_STATUSES, DRIVER_VEHICLE_KINDS, type AreaStats, type CityDetail, type DriverStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { cellsToKm2 } from "@/lib/validation";
import { zoneSwatch } from "@/lib/zone-label";

import { CitySettings } from "./city-settings";
import { FaresEditor } from "./fares-editor";
import { PricingEditor } from "./pricing-editor";
import { ServiceAreaEditor } from "./service-area-editor";
import { SurgeNowButton } from "./surge-now";
import { ZonesEditor } from "./zones-editor";

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "area", label: "Service area" },
  { value: "zones", label: "Zones" },
  { value: "drivers", label: "Drivers" },
  { value: "fares", label: "Fares" },
  { value: "pricing", label: "Rentals & more" },
  { value: "settings", label: "Settings" },
] as const;
type Tab = (typeof TABS)[number]["value"];

export async function generateMetadata({ params, searchParams }: PageProps<"/cities/[id]">): Promise<Metadata> {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const tab = TABS.find((t) => t.value === param(sp.tab)) ?? TABS[0];
  return { title: `${tab.label} · ${id}` };
}

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

function Stat({ label, value, hint, icon: Icon, isAlert = false }: { label: string; value: string; hint: string; icon: LucideIcon; isAlert?: boolean }) {
  return (
    <Card className={cn("gap-2", isAlert && "ring-coral-500/40")}>
      <CardHeader className="flex items-center justify-between gap-2">
        <CardDescription className="font-medium">{label}</CardDescription>
        <span className={cn("flex size-8 items-center justify-center rounded-lg", isAlert ? "bg-coral-600 text-white" : "bg-coral-50 text-coral-600")}>
          <Icon className="size-4" aria-hidden />
        </span>
      </CardHeader>
      <CardContent>
        <p className="font-heading text-2xl font-semibold tabular-nums text-navy-900">{value}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

/** Today and the last 7 days in the city, then every zone with its numbers. */
function Overview({ city, stats }: { city: CityDetail; stats: (AreaStats & { zones: readonly (AreaStats & { zoneId: string })[] }) | null }) {
  if (!stats) {
    return <EmptyState icon={HexagonIcon} title="Numbers unavailable" description="The API couldn't count this city's trips right now." />;
  }
  const byZone = new Map(stats.zones.map((z) => [z.zoneId, z]));
  const missedShare = pct(stats.missed7d, stats.booked7d);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <Stat label="Bookings today" value={formatCount(stats.bookedToday)} hint={`${formatCount(stats.missedToday)} missed today`} icon={RouteIcon} />
        <Stat label="Drivers online now" value={formatCount(stats.onlineNow)} hint="Inside the service area" icon={CarIcon} />
        <Stat
          label="Missed, 7 days"
          value={`${missedShare}%`}
          hint={`${formatCount(stats.missed7d)} of ${formatCount(stats.booked7d)} bookings got no driver`}
          icon={UserXIcon}
          isAlert={missedShare >= 20}
        />
        <Stat
          label="Wait for a driver"
          value={stats.avgWaitMin != null ? `${stats.avgWaitMin} min` : "–"}
          hint={`Average, 7 days · ${formatCount(stats.completed7d)} trips completed`}
          icon={TimerIcon}
        />
      </div>

      <Card className="gap-0 pb-0">
        <CardHeader className="border-b">
          <CardTitle className="font-semibold">Zones</CardTitle>
          <CardDescription>Trips picked up in each zone, last 7 days, and drivers inside it now</CardDescription>
          <CardAction className="flex gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/heatmap?metric=unmet&when=7d">
                <FlameIcon /> Missed on heatmap
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/cities/${city.id}?tab=zones`}>Edit zones</Link>
            </Button>
          </CardAction>
        </CardHeader>
        {city.zones.length === 0 ? (
          <EmptyState icon={HexagonIcon} title="No zones yet" description="Add surge, demand, no-service or pickup-point zones on the Zones tab." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Zone</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead className="text-right">Booked</TableHead>
                <TableHead className="text-right">Missed</TableHead>
                <TableHead className="text-right">Wait</TableHead>
                <TableHead className="pr-4 text-right">Online now</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {city.zones.map((z) => {
                const s = byZone.get(z.id);
                const share = s ? pct(s.missed7d, s.booked7d) : 0;
                return (
                  <TableRow key={z.id} className={z.isActive ? undefined : "text-muted-foreground"}>
                    <TableCell className="pl-4">
                      <span className="flex items-center gap-2 font-medium text-navy-900">
                        <span aria-hidden className="size-3 shrink-0 rounded-sm" style={zoneSwatch(z.kind)} />
                        {z.name}
                        {!z.isActive && <Badge variant="secondary">Off</Badge>}
                      </span>
                    </TableCell>
                    <TableCell>
                      {humanize(z.kind)}
                      {z.kind === "SURGE" && <span className="text-muted-foreground"> · {z.surgeMultiplier.toFixed(2)}×</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCount(s?.booked7d ?? 0)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", share >= 20 && "font-medium text-error")}>
                      {formatCount(s?.missed7d ?? 0)}
                      {s?.booked7d ? <span className="text-xs text-muted-foreground"> ({share}%)</span> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s?.avgWaitMin != null ? `${s.avgWaitMin} min` : "–"}</TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">{formatCount(s?.onlineNow ?? 0)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

const STATUS_TABS: { value: DriverStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "APPROVED", label: "Approved" },
  { value: "PENDING", label: "Pending" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "REJECTED", label: "Rejected" },
];

/** Drivers based in the city (their home city), with the status tabs and filters of All drivers. */
async function CityDrivers({ city, sp }: { city: CityDetail; sp: Awaited<PageProps<"/cities/[id]">["searchParams"]> }) {
  const status = param(sp.status) as DriverStatus | undefined;
  const pageSize = parsePageSize(sp.pageSize);
  const query = {
    q: param(sp.q),
    status: status && DRIVER_STATUSES.includes(status) ? status : undefined,
    vehicle: param(sp.vehicle),
    online: param(sp.online),
    sort: param(sp.sort),
  };
  const [data, settings, unassigned] = await Promise.all([
    adminApi.drivers({ ...query, city: city.id, page: parsePage(sp.page), pageSize }),
    adminApi.settings().catch(() => null),
    adminApi.drivers({ city: "none", pageSize: 1 }).catch(() => null),
  ]);
  const counts = data.counts;
  const allCount = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined;
  const isFiltered = !!(query.q || query.status || query.vehicle || query.online);
  const base = { tab: "drivers", ...query, pageSize: pageSizeParam(pageSize) };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Drivers whose home city is {city.name}: set when they first go online here, or from the driver&apos;s profile.
        {unassigned && unassigned.total > 0 && (
          <>
            {" "}
            <Link href="/drivers?city=none" className="font-medium text-coral-600 hover:underline">
              {formatCount(unassigned.total)} without a city yet
            </Link>
            .
          </>
        )}
      </p>
      <LinkTabs
        active={query.status ?? "ALL"}
        tabs={STATUS_TABS.map((t) => {
          const n = t.value === "ALL" ? allCount : counts?.[t.value];
          return {
            value: t.value,
            label: t.label,
            href: withQuery(`/cities/${city.id}`, { ...base, status: t.value === "ALL" ? undefined : t.value }),
            count: n !== undefined ? <span className="text-xs font-normal text-muted-foreground tabular-nums">{formatCount(n)}</span> : undefined,
          };
        })}
      />
      <ListFilters
        searchPlaceholder="Name, phone or plate"
        filters={[
          { name: "vehicle", label: "Vehicles", options: DRIVER_VEHICLE_KINDS.map((v) => ({ value: v, label: vehicleLabel(v) })) },
          { name: "online", label: "Online & offline", options: [{ value: "true", label: "Online now" }, { value: "false", label: "Offline" }] },
          {
            name: "sort",
            label: "Sort",
            defaultValue: "newest",
            options: [
              { value: "newest", label: "Newest first" },
              { value: "rating", label: "Best rated" },
              { value: "trips", label: "Most trips" },
              { value: "name", label: "Name A–Z" },
            ],
          },
        ]}
      />
      <Card className="gap-0 py-0">
        {data.items.length === 0 ? (
          <EmptyState
            icon={IdCardIcon}
            title={isFiltered ? "No drivers match" : `No drivers in ${city.name} yet`}
            description={isFiltered ? "Try another name, tab or filter." : "Drivers get a home city when they first go online inside its service area."}
          />
        ) : (
          <DriversTable items={data.items} showPlans={settings?.driverPlansEnabled ?? true} />
        )}
        <Pager path={`/cities/${city.id}`} query={base} page={data.page} pageSize={data.pageSize} total={data.total} noun="drivers" canResize />
      </Card>
    </div>
  );
}

export default async function CityPage({ params, searchParams }: PageProps<"/cities/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = TABS.find((t) => t.value === param(sp.tab))?.value ?? "overview";
  // Only what the open tab shows.
  const [city, me, stats, fares, pricing] = await Promise.all([
    adminApi.city(id),
    getAccess(),
    tab === "overview" || tab === "zones" ? adminApi.cityStats(id).catch(() => null) : null,
    tab === "fares" ? adminApi.fares(id) : null,
    tab === "pricing" ? adminApi.pricing(id) : null,
  ]);
  const km2 = Math.round(cellsToKm2(city.serviceCells.length, city.h3Resolution));
  const zoneStats = stats ? Object.fromEntries(stats.zones.map((z) => [z.zoneId, z])) : undefined;

  return (
    <>
      <Link href="/cities" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Cities
      </Link>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold text-navy-900">
            {city.name}
            {city.isActive ? <Badge className="bg-success-tint text-success-text">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {city.state} · {formatCount(city.serviceCells.length)} hexagons (≈{formatCount(km2)} km²) · {city.zones.length} zone
            {city.zones.length === 1 ? "" : "s"}
          </p>
        </div>
        {canManageCity(me, city.id) && city.serviceCells.length > 0 && (
          <SurgeNowButton cityId={city.id} cityName={city.name} zones={city.zones.filter((z) => z.kind !== "NO_SERVICE").map((z) => ({ id: z.id, name: z.name }))} />
        )}
      </div>
      <LinkTabs
        active={tab}
        tabs={TABS.map((t) => ({ value: t.value, label: t.label, href: t.value === "overview" ? `/cities/${city.id}` : `/cities/${city.id}?tab=${t.value}` }))}
      />
      <div className="mt-4">
        {tab === "overview" && <Overview city={city} stats={stats} />}
        {tab === "area" && <ServiceAreaEditor key={city.updatedAt} city={city} />}
        {tab === "zones" && <ZonesEditor city={city} stats={zoneStats} />}
        {tab === "drivers" && <CityDrivers city={city} sp={sp} />}
        {/* Remount on new fares (a save or a reset), so the inputs show what is stored. */}
        {tab === "fares" && fares && <FaresEditor key={JSON.stringify(fares)} cityId={city.id} fares={fares} />}
        {tab === "pricing" && pricing && <PricingEditor cityId={city.id} pricing={pricing} />}
        {tab === "settings" && <CitySettings key={city.updatedAt} city={city} isOwner={isOwner(me)} />}
      </div>
    </>
  );
}
