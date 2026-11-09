import { BanIcon, UserCogIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LinkTabs } from "@/components/common/link-tabs";
import { ListFilters } from "@/components/common/list-filters";
import { EmptyState, PageHeader } from "@/components/common/page";
import { Pager } from "@/components/common/pager";
import { PlateBadge, StatusBadge } from "@/components/common/status";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, adminApi } from "@/lib/api";
import { formatCount, formatDate, formatPhone, humanize, initials } from "@/lib/format";
import { param, pageSizeParam, parsePage, parsePageSize, withQuery } from "@/lib/paging";
import { ROLES, type AdminUser, type Paged, type Role } from "@/lib/types";

export const metadata: Metadata = { title: "All accounts" };

const ROLE_TABS: { value: Role | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PASSENGER", label: "Riders" },
  { value: "DRIVER", label: "Drivers" },
  { value: "ADMIN", label: "Admins" },
];

export default async function UsersPage({ searchParams }: PageProps<"/users">) {
  const sp = await searchParams;
  const roleParam = param(sp.role) as Role | undefined;
  const role = roleParam && ROLES.includes(roleParam) ? roleParam : undefined;
  const blockedParam = param(sp.blocked);
  const blocked = blockedParam === "true" || blockedParam === "false" ? blockedParam : undefined;
  const query = { q: param(sp.q), role, blocked };
  const page = parsePage(sp.page);
  const pageSize = parsePageSize(sp.pageSize);
  let data: Paged<AdminUser>;
  let filterError: string | null = null;
  try {
    data = await adminApi.users({ ...query, page, pageSize });
  } catch (e) {
    // Older API builds reject ?role / ?blocked (ListQueryDto whitelist): fall back to the unfiltered list.
    if (!(e instanceof ApiError && e.status === 400 && (role || blocked))) throw e;
    filterError = e.message;
    data = await adminApi.users({ q: query.q, page, pageSize });
  }

  return (
    <>
      <PageHeader title="All accounts" description={`${formatCount(data.total)} accounts: riders, drivers and admins. Block abusive users or change roles.`} />
      <LinkTabs
        active={role ?? "ALL"}
        tabs={ROLE_TABS.map((t) => ({
          value: t.value,
          label: t.label,
          href: withQuery("/users", { q: query.q, blocked, role: t.value === "ALL" ? undefined : t.value, pageSize: pageSizeParam(pageSize) }),
        }))}
      />
      <ListFilters
        searchPlaceholder="Name, phone or email"
        filters={[
          {
            name: "blocked",
            label: "Accounts",
            options: [
              { value: "true", label: "Blocked only" },
              { value: "false", label: "Not blocked" },
            ],
          },
        ]}
      />
      {filterError && (
        <p role="status" className="mb-4 rounded-lg bg-warning-tint px-3 py-2 text-sm text-warning-text">
          The API rejected the role/blocked filter ({filterError}), so all users are shown. Update the API to enable it.
        </p>
      )}
      <Card className="gap-0 py-0">
        {data.items.length === 0 ? (
          <EmptyState icon={UserCogIcon} title="No users match" description="Try another tab, search or filter." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">User</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead className="text-right">Trips</TableHead>
                <TableHead className="text-right">Tickets</TableHead>
                <TableHead className="pr-4">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((u) => (
                <TableRow key={u.id} className="relative">
                  <TableCell className="pl-4">
                    <Link
                      href={u.driver ? `/drivers/${u.driver.id}` : `/users/${u.id}`}
                      className="flex items-center gap-2.5 font-medium text-navy-900 after:absolute after:inset-0 hover:text-coral-600"
                    >
                      <Avatar className="size-8">
                        <AvatarFallback className="bg-coral-50 text-xs font-semibold text-coral-600">{initials(u.name)}</AvatarFallback>
                      </Avatar>
                      <span>
                        {u.name ?? <span className="font-normal text-muted-foreground">No name yet</span>}
                        {u.isBlocked && (
                          <Badge variant="secondary" className="ml-2 bg-error-tint text-error">
                            <BanIcon /> Blocked
                          </Badge>
                        )}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums text-navy-700">{formatPhone(u.phone)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{humanize(u.role)}</Badge>
                  </TableCell>
                  <TableCell>
                    {u.driver ? (
                      <span className="flex flex-col items-start gap-1">
                        <StatusBadge status={u.driver.status} />
                        <PlateBadge plate={u.driver.plate} />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCount(u._count.trips)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCount(u._count.tickets)}</TableCell>
                  <TableCell className="pr-4 text-navy-700">{formatDate(u.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pager path="/users" query={{ ...query, pageSize: pageSizeParam(pageSize) }} page={data.page} pageSize={data.pageSize} total={data.total} noun="accounts" canResize />
      </Card>
    </>
  );
}
