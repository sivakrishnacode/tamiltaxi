import { BanIcon, StarIcon } from "lucide-react";
import Link from "next/link";

import { KycProgress, OnlineDot, PlateBadge, StatusBadge } from "@/components/common/status";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { docFileHref } from "@/lib/api";
import { displayName, formatCount, formatDate, formatPhone, humanize, initials, kycProgress, vehicleLabel } from "@/lib/format";
import type { DriverListItem } from "@/lib/types";

/** Paused for too many cancellations right now. */
function isPausedNow(until: string | null | undefined): boolean {
  return !!until && new Date(until).getTime() > Date.now();
}

/**
 * The drivers table of All drivers and a city's Drivers tab: one row per driver, linking to their page.
 * [showPlans]: the plan column (only while paid plans are on); [cityNames]: a City column (id → name).
 */
export function DriversTable({
  items,
  showPlans,
  cityNames,
}: {
  items: readonly DriverListItem[];
  showPlans: boolean;
  cityNames?: Readonly<Record<string, string>>;
}) {
  return (
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
            {cityNames && <TableHead>City</TableHead>}
            <TableHead className="text-center">Online</TableHead>
            <TableHead className="pr-4">Joined</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((d) => {
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
                {cityNames && (
                  <TableCell className="text-navy-700">{d.cityId ? (cityNames[d.cityId] ?? d.cityId) : <span className="text-muted-foreground">–</span>}</TableCell>
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
  );
}
