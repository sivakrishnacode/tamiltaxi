import { BanIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ListFilters } from "@/components/common/list-filters";
import { EmptyState, PageHeader } from "@/components/common/page";
import { Pager } from "@/components/common/pager";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminApi } from "@/lib/api";
import { formatCount, formatDate, formatPhone, initials } from "@/lib/format";
import { param, pageSizeParam, parsePage, parsePageSize } from "@/lib/paging";

export const metadata: Metadata = { title: "Riders" };

export default async function PassengersPage({ searchParams }: PageProps<"/passengers">) {
  const sp = await searchParams;
  const query = { q: param(sp.q), blocked: param(sp.blocked), women: param(sp.women), sort: param(sp.sort) };
  const page = parsePage(sp.page);
  const pageSize = parsePageSize(sp.pageSize);
  const data = await adminApi.passengers({ ...query, page, pageSize });
  const isFiltered = !!(query.q || query.blocked || query.women);

  return (
    <>
      <PageHeader title="Riders" description={`${formatCount(data.total)} ${isFiltered ? "matching" : "registered"} riders. Open one to see their trips, account and safety contacts.`} />
      <ListFilters
        searchPlaceholder="Name or phone"
        filters={[
          { name: "blocked", label: "Accounts", options: [{ value: "false", label: "Active" }, { value: "true", label: "Blocked" }] },
          { name: "women", label: "Preferences", options: [{ value: "true", label: "Prefers women drivers" }] },
          {
            name: "sort",
            label: "Sort",
            defaultValue: "newest",
            options: [
              { value: "newest", label: "Newest first" },
              { value: "oldest", label: "Oldest first" },
              { value: "trips", label: "Most trips" },
              { value: "name", label: "Name A–Z" },
            ],
          },
        ]}
      />
      <Card className="gap-0 py-0">
        {data.items.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title={isFiltered ? "No riders match" : "No riders yet"}
            description={isFiltered ? "Try another name, phone number or filter." : "Riders appear after their first sign-in."}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Passenger</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Trips</TableHead>
                <TableHead>Preferences</TableHead>
                <TableHead className="pr-4">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((u) => (
                <TableRow key={u.id} className="relative">
                  <TableCell className="pl-4">
                    <Link
                      href={`/users/${u.id}`}
                      className="flex items-center gap-2.5 font-medium text-navy-900 after:absolute after:inset-0 hover:text-coral-600"
                    >
                      <Avatar className="size-8">
                        <AvatarFallback className="bg-coral-50 text-xs font-semibold text-coral-600">{initials(u.name)}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0">
                        <span className="block truncate">{u.name ?? <span className="font-normal text-muted-foreground">No name yet</span>}</span>
                        <span className="flex flex-wrap gap-1">
                          {u.isBlocked && (
                            <Badge variant="secondary" className="h-4 bg-error-tint px-1.5 text-[10px] text-error">
                              <BanIcon /> Blocked
                            </Badge>
                          )}
                        </span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums text-navy-700">{formatPhone(u.phone)}</TableCell>
                  <TableCell className="text-navy-700">{u.email ?? "–"}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatCount(u._count.trips)}</TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-1">
                      {u.preferWomenDriver && <Badge variant="outline">Women drivers</Badge>}
                      {u.autoShareTrips && <Badge variant="outline">Auto-share trips</Badge>}
                      {!u.preferWomenDriver && !u.autoShareTrips && <span className="text-xs text-muted-foreground">–</span>}
                    </span>
                  </TableCell>
                  <TableCell className="pr-4 text-navy-700">{formatDate(u.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pager
          path="/passengers"
          query={{ ...query, pageSize: pageSizeParam(pageSize) }}
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          noun="riders"
          canResize
        />
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">
        Open a rider to block them or change their role. Drivers who book rides are listed here too, with only their
        rides; their driving is under Drivers. Admins are in{" "}
        <Link href="/users" className="text-coral-600 hover:underline">
          All accounts
        </Link>
        .
      </p>
    </>
  );
}
