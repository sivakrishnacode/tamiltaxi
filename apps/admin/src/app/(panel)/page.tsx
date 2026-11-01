import {
  BadgeIndianRupeeIcon,
  BanIcon,
  CalendarClockIcon,
  CameraIcon,
  CarIcon,
  CheckCircle2Icon,
  FileSearchIcon,
  FlameIcon,
  HexagonIcon,
  IdCardIcon,
  LifeBuoyIcon,
  RadioIcon,
  ReceiptIndianRupeeIcon,
  RouteIcon,
  ScanFaceIcon,
  ShieldAlertIcon,
  TrendingUpIcon,
  TriangleAlertIcon,
  UserCheckIcon,
  UserXIcon,
  UsersIcon,
  WalletCardsIcon,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ApprovalChecks } from "@/components/common/approval-checks";
import { EmptyState, PageHeader } from "@/components/common/page";
import { PlateBadge } from "@/components/common/status";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adminApi, placeNameAt } from "@/lib/api";
import { presetRange } from "@/lib/heat";
import { cellCentre } from "@/lib/hex";
import { displayName, formatAgo, formatCount, formatInr, vehicleLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { cityView } from "@/lib/map-view";

import { MiniLiveMap } from "./mini-live-map";
import { TripsChart } from "./trips-chart";

export const metadata: Metadata = { title: "Dashboard" };

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  href,
  isHighlighted = false,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  href?: string;
  isHighlighted?: boolean;
}) {
  const body = (
    <Card className={cn("h-full gap-2 transition-shadow", href && "hover:shadow-md", isHighlighted && "ring-coral-500/40")}>
      <CardHeader className="flex items-center justify-between gap-2">
        <CardDescription className="font-medium">{label}</CardDescription>
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-lg",
            isHighlighted ? "bg-coral-600 text-white" : "bg-coral-50 text-coral-600",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
      </CardHeader>
      <CardContent>
        <p className="font-heading text-2xl font-semibold tabular-nums text-navy-900">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    body
  );
}

/** One "needs attention" count: a link to the queue that clears it. Red for safety, coral for the rest. */
function Attention({ label, count, href, icon: Icon, isUrgent = false }: { label: string; count: number; href: string; icon: LucideIcon; isUrgent?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5 transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        isUrgent ? "border-error/40 bg-error-tint/40" : "border-coral-500/30",
      )}
    >
      <span className={cn("flex size-8 items-center justify-center rounded-lg text-white", isUrgent ? "animate-pulse bg-error" : "bg-coral-600")}>
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block font-heading text-xl leading-tight font-semibold text-navy-900 tabular-nums">{formatCount(count)}</span>
        <span className="block text-xs leading-tight text-muted-foreground">{label}</span>
      </span>
    </Link>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-6 mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{children}</h2>;
}

export default async function DashboardPage() {
  const [stats, approvals, sos, flagged, blocked, cities, live, settings, demand, heat, expiring] = await Promise.all([
    adminApi.stats(),
    // Optional extras: never let one count take the dashboard down.
    adminApi.approvals({ stage: "ready", pageSize: 5 }).catch(() => null),
    adminApi.sos({ status: "OPEN", pageSize: 1 }).catch(() => null),
    adminApi.trips({ review: "true", pageSize: 1 }).catch(() => null),
    adminApi.users({ blocked: "true", pageSize: 1 }).catch(() => null),
    adminApi.cities(),
    adminApi.live(),
    adminApi.settings().catch(() => null),
    adminApi.demand().catch(() => null),
    adminApi.heatmap({ metric: "pickups", ...presetRange("30d") }).catch(() => null),
    adminApi.kyc({ status: "EXPIRING", pageSize: 1 }).catch(() => null),
  ]);
  // Then, together: the uploads to review when nobody is ready (ready drivers come first), and the hotspot names.
  const [waitingList, hotspots] = await Promise.all([
    approvals && approvals.counts.ready === 0 && approvals.counts.documents > 0
      ? adminApi.approvals({ stage: "documents", pageSize: 5 }).catch(() => approvals)
      : approvals,
    Promise.all(
      (heat?.cells.slice(0, 5) ?? []).map(async (c) => {
        const centre = cellCentre(c.cell);
        return { ...c, ...centre, name: await placeNameAt(centre.lat, centre.lng) };
      }),
    ),
  ]);
  const counts = approvals?.counts;
  const attention = [
    { label: "SOS open", count: sos?.open ?? 0, href: "/safety", icon: ShieldAlertIcon, isUrgent: true },
    { label: "Ready to approve", count: counts?.ready ?? 0, href: "/drivers/approvals?stage=ready", icon: UserCheckIcon },
    { label: "Documents to review", count: counts?.documents ?? 0, href: "/drivers/approvals?stage=documents", icon: FileSearchIcon },
    { label: "Photos to review", count: counts?.photos ?? 0, href: "/drivers/approvals?stage=photos", icon: CameraIcon },
    { label: "Identity in Didit", count: counts?.identity ?? 0, href: "/drivers/approvals?stage=identity", icon: ScanFaceIcon },
    { label: "Trips to review", count: flagged?.total ?? 0, href: "/trips?review=true", icon: TriangleAlertIcon },
    { label: "Documents expiring", count: expiring?.total ?? 0, href: "/kyc?status=EXPIRING", icon: CalendarClockIcon },
    { label: "Open tickets", count: stats.openTickets, href: "/support", icon: LifeBuoyIcon },
  ].filter((a) => a.count > 0);
  const showPlans = settings?.driverPlansEnabled ?? true;
  const now = new Date();
  const surging = demand?.cells.filter((c) => c.multiplier > 1) ?? [];
  const topSurge = surging.reduce((m, c) => Math.max(m, c.multiplier), 1);
  const activeCities = cities.filter((c) => c.isActive);
  const { center: c0 } = cityView(activeCities);
  const mapCenter: [number, number] = [c0.lat, c0.lng];
  const { drivers, trips, revenue } = stats;
  const weekTotal = stats.tripsLast7Days.reduce((a, d) => a + d.count, 0);

  return (
    <>
      <PageHeader title="Dashboard" description="What needs you now, then today across Tamil Taxi: trips, drivers, riders and cities." />

      <SectionTitle>Needs attention</SectionTitle>
      {attention.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-tint/50 px-4 py-3 text-sm text-success-text">
          <CheckCircle2Icon className="size-4" aria-hidden /> All caught up: no approvals, reviews, SOS or tickets waiting.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {attention.map((a) => (
            <Attention key={a.href} {...a} />
          ))}
        </div>
      )}

      <SectionTitle>Today</SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Trips today"
          value={formatCount(trips.today)}
          hint={`${formatCount(trips.completedToday)} completed · ${formatCount(trips.cancelledToday)} cancelled`}
          icon={RouteIcon}
          href="/trips?when=today"
        />
        <Kpi
          label="Missed today"
          value={trips.missedToday == null ? "–" : formatCount(trips.missedToday)}
          hint={trips.missedToday ? "Riders who got no driver" : "Every rider got a driver"}
          icon={UserXIcon}
          href="/trips/missed?when=today"
          isHighlighted={!!trips.missedToday}
        />
        <Kpi label="Active trips" value={formatCount(trips.active)} hint="Searching or on the road" icon={CarIcon} href="/live" />
        <Kpi label="Fares today" value={formatInr(trips.faresToday)} hint="Completed trips · 100% to drivers" icon={ReceiptIndianRupeeIcon} />
        <Kpi label="Online now" value={formatCount(drivers.online)} hint="Drivers taking jobs" icon={RadioIcon} href="/drivers?online=true" />
        <Kpi
          label="Surging now"
          value={demand ? formatCount(surging.length) : "–"}
          hint={surging.length ? `Areas up to ${topSurge.toFixed(2)}× · see Live` : demand ? "No surge right now" : "Demand unavailable"}
          icon={TrendingUpIcon}
          href="/live"
          isHighlighted={surging.length > 0}
        />
      </div>

      <SectionTitle>People &amp; places</SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Kpi
          label="Drivers"
          value={formatCount(drivers.total)}
          hint={`${formatCount(drivers.approved)} approved · ${formatCount(drivers.pending)} pending · ${formatCount(drivers.onHold)} on hold`}
          icon={IdCardIcon}
          href="/drivers"
        />
        <Kpi label="Riders" value={formatCount(stats.passengers)} hint="Registered riders" icon={UsersIcon} href="/passengers" />
        <Kpi
          label="Blocked accounts"
          value={blocked ? formatCount(blocked.total) : "–"}
          hint={blocked ? "Can't book or drive" : "Unavailable: API rejected ?blocked"}
          icon={BanIcon}
          href="/users?blocked=true"
        />
        <Kpi
          label="Cities"
          value={formatCount(activeCities.length)}
          hint={`${formatCount(cities.reduce((a, c) => a + c._count.zones, 0))} zones · ${formatCount(cities.length - activeCities.length)} inactive`}
          icon={HexagonIcon}
          href="/cities"
        />
        {showPlans ? (
          <Kpi
            label="Plan revenue"
            value={formatInr(revenue.paidThisMonth)}
            hint={`This month · ${formatCount(revenue.activeSubscriptions)} active, ${formatCount(revenue.trialSubscriptions)} on trial`}
            icon={BadgeIndianRupeeIcon}
            href="/plans"
          />
        ) : (
          <Kpi label="Driver plans" value="Off" hint="Free app: 0% commission, no subscription" icon={WalletCardsIcon} href="/settings" />
        )}
      </div>

      <Card className="mt-6 gap-0 overflow-hidden pb-0">
        <CardHeader className="border-b">
          <CardTitle className="font-semibold">Live now</CardTitle>
          <CardDescription>
            {formatCount(live.drivers.length)} drivers online · {formatCount(live.trips.length)} active trips
          </CardDescription>
          <CardAction>
            <Button asChild variant="ghost" size="sm">
              <Link href="/live">Open live map</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <div className="h-64">
          <MiniLiveMap data={live} center={mapCenter} />
        </div>
      </Card>

      <Card className="mt-6 gap-0 pb-0">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 font-semibold">
            <FlameIcon className="size-4 text-coral-600" /> Hotspots
          </CardTitle>
          <CardDescription>Top pickup hexagons, last 30 days</CardDescription>
          <CardAction>
            <Button asChild variant="ghost" size="sm">
              <Link href="/heatmap">Open heatmap</Link>
            </Button>
          </CardAction>
        </CardHeader>
        {hotspots.length === 0 ? (
          <EmptyState icon={FlameIcon} title="No trips yet" description="Hotspots appear once trips are booked." />
        ) : (
          <ol className="grid divide-y sm:grid-cols-5 sm:divide-x sm:divide-y-0">
            {hotspots.map((h, i) => (
              <li key={h.cell} className="px-4 py-3">
                <p className="text-xs font-semibold text-muted-foreground">#{i + 1}</p>
                <p className="truncate text-sm font-medium text-navy-900" title={h.name ?? h.cell}>
                  {h.name ?? `${h.lat.toFixed(4)}, ${h.lng.toFixed(4)}`}
                </p>
                <p className="font-heading text-lg font-semibold tabular-nums">{formatCount(h.value)}</p>
                <p className="text-xs text-muted-foreground">
                  {heat?.total ? Math.round((h.value / heat.total) * 100) : 0}% of pickups · {h.lat.toFixed(3)}, {h.lng.toFixed(3)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="font-semibold">Trips, last 7 days</CardTitle>
            <CardDescription>{formatCount(weekTotal)} trips booked (rides and parcels)</CardDescription>
          </CardHeader>
          <CardContent>
            <TripsChart data={stats.tripsLast7Days} />
          </CardContent>
        </Card>

        <Card className="gap-0 lg:col-span-2">
          <CardHeader className="border-b">
            <CardTitle className="font-semibold">Waiting for approval</CardTitle>
            <CardDescription>
              {waitingList
                ? waitingList.stage === "documents"
                  ? `${formatCount(waitingList.total)} ${waitingList.total === 1 ? "driver" : "drivers"} with uploads to review`
                  : `${formatCount(waitingList.total)} ${waitingList.total === 1 ? "driver" : "drivers"} ready to approve`
                : "Approvals need a newer API"}
            </CardDescription>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/drivers/approvals${waitingList ? `?stage=${waitingList.stage}` : ""}`}>Open Approvals</Link>
              </Button>
            </CardAction>
          </CardHeader>
          {!waitingList || waitingList.items.length === 0 ? (
            <EmptyState
              icon={UserCheckIcon}
              title="All caught up"
              description={approvals?.autoApprove ? "Auto-approval is on and no uploads are waiting." : "No driver is waiting for your approval."}
            />
          ) : (
            <ul className="divide-y">
              {waitingList.items.map((d) => (
                <li key={d.id}>
                  <Link href={`/drivers/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-navy-900">{displayName(d.user)}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {vehicleLabel(d.vehicleKind)} <PlateBadge plate={d.plate} /> · waiting {formatAgo(d.updatedAt, now)}
                      </span>
                    </span>
                    <ApprovalChecks checklist={d.checklist} className="hidden justify-end sm:flex" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
