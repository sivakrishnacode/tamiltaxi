import { CheckCircle2Icon, FlameIcon, PhoneIcon, SearchXIcon, TimerOffIcon, UserXIcon, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ListFilters } from "@/components/common/list-filters";
import { EmptyState, PageHeader } from "@/components/common/page";
import { Pager } from "@/components/common/pager";
import { StatusBadge } from "@/components/common/status";
import { TripRouteCell } from "@/components/common/trip-bits";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminApi, placeNameAt } from "@/lib/api";
import { displayName, formatCount, formatDate, formatPhone, formatTime, shortId, vehicleLabel } from "@/lib/format";
import { presetRange } from "@/lib/heat";
import { cellCentre } from "@/lib/hex";
import { pageSizeParam, param, parsePage, parsePageSize } from "@/lib/paging";

import { MissedHoursChart } from "./missed-hours-chart";

export const metadata: Metadata = { title: "Missed rides" };

const WHEN = ["today", "7d", "30d"] as const;
type When = (typeof WHEN)[number];
const WHEN_LABEL: Record<When, string> = { today: "today", "7d": "in the last 7 days", "30d": "in the last 30 days" };

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
const minutes = (m: number | null) => (m == null ? "" : m < 1 ? `${Math.round(m * 60)} s` : `${m.toFixed(m < 10 ? 1 : 0).replace(/\.0$/, "")} min`);

function Stat({ label, value, hint, icon: Icon }: { label: string; value: string; hint: string; icon: LucideIcon }) {
  return (
    <Card className="gap-2">
      <CardHeader className="flex items-center justify-between gap-2">
        <CardDescription className="font-medium">{label}</CardDescription>
        <span className="flex size-8 items-center justify-center rounded-lg bg-coral-50 text-coral-600">
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

/** A thin share bar (missed out of booked) next to the numbers. */
function ShareBar({ part, whole }: { part: number; whole: number }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <span className="block h-full rounded-full bg-coral-600" style={{ width: `${pct(part, whole)}%` }} />
    </span>
  );
}

export default async function MissedRidesPage({ searchParams }: PageProps<"/trips/missed">) {
  const sp = await searchParams;
  const asked = param(sp.when) as When | undefined;
  const when: When = asked && WHEN.includes(asked) ? asked : "7d";
  const page = parsePage(sp.page);
  const pageSize = parsePageSize(sp.pageSize);
  const data = await adminApi.missed({ ...presetRange(when), page, pageSize });
  const areas = await Promise.all(
    data.areas.map(async (a) => {
      const centre = cellCentre(a.cell);
      return { ...a, ...centre, name: await placeNameAt(centre.lat, centre.lng) };
    }),
  );
  const now = new Date();
  const heatmapHref = `/heatmap?metric=unmet&when=${when}`;

  return (
    <>
      <PageHeader
        title="Missed rides"
        description="Riders who asked and got no driver: the search ran out, or they gave up waiting. See when and where to add drivers, and whom to call back."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={heatmapHref}>
              <FlameIcon /> Open on heatmap
            </Link>
          </Button>
        }
      />
      <ListFilters
        filters={[
          {
            name: "when",
            label: "Dates",
            defaultValue: "7d",
            options: [
              { value: "today", label: "Today" },
              { value: "7d", label: "Last 7 days" },
              { value: "30d", label: "Last 30 days" },
            ],
          },
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <Stat
          label="Missed"
          value={formatCount(data.missed)}
          hint={data.booked ? `${pct(data.missed, data.booked)}% of ${formatCount(data.booked)} bookings` : "No bookings yet"}
          icon={UserXIcon}
        />
        <Stat label="No driver found" value={formatCount(data.noDriver)} hint="The search ran out of drivers" icon={SearchXIcon} />
        <Stat
          label="Gave up waiting"
          value={formatCount(data.gaveUp)}
          hint={data.gaveUpAfterMin != null ? `Usually after ${minutes(data.gaveUpAfterMin)} of searching` : "Cancelled while searching"}
          icon={TimerOffIcon}
        />
      </div>

      {data.missed === 0 ? (
        <Card className="mt-6 py-0">
          <EmptyState
            icon={CheckCircle2Icon}
            title="No missed rides"
            description={data.booked ? `Every rider who booked ${WHEN_LABEL[when]} got a driver.` : `No bookings ${WHEN_LABEL[when]}.`}
          />
        </Card>
      ) : (
        <>
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="font-semibold">When riders miss out</CardTitle>
              <CardDescription>Bookings by hour of day (IST), {WHEN_LABEL[when]}. The coral part had no driver: ask drivers to be online then.</CardDescription>
            </CardHeader>
            <CardContent>
              <MissedHoursChart data={data.byHour} />
            </CardContent>
          </Card>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card className="gap-0 pb-0">
              <CardHeader className="border-b">
                <CardTitle className="font-semibold">By vehicle</CardTitle>
                <CardDescription>Which vehicles riders could not get</CardDescription>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="pl-4">Vehicle</TableHead>
                    <TableHead className="text-right">Missed</TableHead>
                    <TableHead className="text-right">Booked</TableHead>
                    <TableHead className="w-32 pr-4">Share missed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byVehicle.map((v) => (
                    <TableRow key={v.vehicleKind}>
                      <TableCell className="pl-4 font-medium text-navy-900">{vehicleLabel(v.vehicleKind)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatCount(v.missed)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatCount(v.booked)}</TableCell>
                      <TableCell className="pr-4">
                        <span className="flex items-center gap-2">
                          <ShareBar part={v.missed} whole={v.booked} />
                          <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{pct(v.missed, v.booked)}%</span>
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            <Card className="gap-0 pb-0">
              <CardHeader className="border-b">
                <CardTitle className="font-semibold">Where</CardTitle>
                <CardDescription>Pickup areas with the most missed rides</CardDescription>
                <CardAction>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={heatmapHref}>Heatmap</Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <ol className="divide-y">
                {areas.map((a, i) => (
                  <li key={a.cell} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-5 shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-navy-900" title={a.name ?? a.cell}>
                        {a.name ?? `${a.lat.toFixed(4)}, ${a.lng.toFixed(4)}`}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatCount(a.missed)} of {formatCount(a.booked)} bookings missed · {a.lat.toFixed(3)}, {a.lng.toFixed(3)}
                      </span>
                    </span>
                    <span className="w-20 shrink-0">
                      <ShareBar part={a.missed} whole={a.booked} />
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          </div>

          <Card className="mt-6 gap-0 py-0">
            <CardHeader className="border-b py-4">
              <CardTitle className="font-semibold">Riders to call back</CardTitle>
              <CardDescription>Newest first. Those who got no ride later are worth a call.</CardDescription>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Trip</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Rider</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>What happened</TableHead>
                  <TableHead className="pr-4">Later</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.items.map((t) => (
                  <TableRow key={t.id} className="relative">
                    <TableCell className="pl-4">
                      <Link
                        href={`/trips/${t.id}`}
                        className="font-mono text-xs font-semibold text-navy-900 after:absolute after:inset-0 hover:text-coral-600"
                      >
                        #{shortId(t.id)}
                      </Link>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{vehicleLabel(t.vehicleKind)}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-navy-700">
                      {formatDate(t.createdAt)}
                      <span className="block text-xs text-muted-foreground">{formatTime(t.createdAt)}</span>
                    </TableCell>
                    <TableCell>
                      <Link href={`/users/${t.passenger.id}`} className="relative z-10 font-medium hover:text-coral-600 hover:underline">
                        {displayName(t.passenger)}
                      </Link>
                      <a
                        href={`tel:${t.passenger.phone}`}
                        className="relative z-10 mt-0.5 flex w-fit items-center gap-1 text-xs whitespace-nowrap text-muted-foreground hover:text-coral-600"
                      >
                        <PhoneIcon className="size-3" aria-hidden /> {formatPhone(t.passenger.phone)}
                      </a>
                      {t.riderName && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          For {t.riderName}
                          {t.riderPhone ? ` · ${formatPhone(t.riderPhone)}` : ""}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <TripRouteCell pickup={t.pickupName} drop={t.dropName} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {t.reason === "NO_DRIVER" ? (
                        <StatusBadge status="NO_DRIVERS" label="No driver found" />
                      ) : (
                        <StatusBadge status="CANCELLED" label="Gave up" />
                      )}
                      {t.waitedMin != null && <span className="mt-1 block text-[11px] text-muted-foreground">after {minutes(t.waitedMin)}</span>}
                    </TableCell>
                    <TableCell className="pr-4 whitespace-nowrap">
                      {t.gotRideLater ? (
                        <StatusBadge status="COMPLETED" label="Got a ride" />
                      ) : (
                        <span className="text-xs font-medium text-coral-700">No ride{now.getTime() - new Date(t.createdAt).getTime() < 3 * 3_600_000 ? " yet" : ""}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager
              path="/trips/missed"
              query={{ when: when === "7d" ? undefined : when, pageSize: pageSizeParam(pageSize) }}
              page={data.items.page}
              pageSize={data.items.pageSize}
              total={data.items.total}
              noun="missed rides"
              canResize
            />
          </Card>
        </>
      )}
    </>
  );
}
