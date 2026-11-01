import { ServerIcon, UsersRoundIcon } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState, PageHeader } from "@/components/common/page";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminApi } from "@/lib/api";
import { citiesShort } from "@/lib/city-pick";
import { formatAgo, formatPhone } from "@/lib/format";
import { getSessionUser } from "@/lib/session";

import { AddStaffButton, StaffRowActions } from "./staff-dialogs";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage() {
  const [{ staff, roles }, cities, me] = await Promise.all([adminApi.team(), adminApi.cities(), getSessionUser()]);
  const cityName = new Map(cities.map((c) => [c.id, c.name]));
  const cityList = cities.map((c) => ({ id: c.id, name: c.name, state: c.state }));
  const now = new Date();
  const myPhone = me?.phone ?? "";

  return (
    <>
      <PageHeader
        title="Staff"
        description="Everyone who can sign in to this panel. Owners do everything; staff do what their role allows, changed under Roles."
        actions={<AddStaffButton roles={roles} cities={cityList} />}
      />
      <Card className="gap-0 py-0">
        {staff.length === 0 ? (
          <EmptyState icon={UsersRoundIcon} title="No staff yet" description="Add the people who run Tamil Taxi with you." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Person</TableHead>
                <TableHead>Access</TableHead>
                <TableHead>Cities</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead className="pr-4 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((m) => {
                const isMe = m.phone === myPhone;
                return (
                  <TableRow key={m.id}>
                    <TableCell className="pl-4">
                      <span className="flex items-center gap-2 font-medium text-navy-900">
                        {m.name ?? "No name yet"}
                        {isMe && <Badge variant="outline">You</Badge>}
                        {m.isBlocked && <Badge className="bg-error-tint text-error">Blocked</Badge>}
                      </span>
                      <span className="block text-xs text-muted-foreground tabular-nums">{formatPhone(m.phone)}</span>
                    </TableCell>
                    <TableCell>
                      {m.adminLevel === "OWNER" ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <Badge className="bg-navy-900 text-white">Owner</Badge>
                          {m.isServerOwner && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="In ADMIN_PHONES on the server">
                              <ServerIcon className="size-3" aria-hidden /> Server owner
                            </span>
                          )}
                        </span>
                      ) : m.staffRole ? (
                        <Badge className="bg-coral-50 text-coral-700">{m.staffRole.name}</Badge>
                      ) : (
                        <Badge className="bg-warning-tint text-warning-text">No role</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-navy-700">
                      {m.staffRole?.isCityScoped ? (
                        <span title={m.adminCityIds.map((id) => cityName.get(id) ?? id).join(", ")}>{citiesShort(m.adminCityIds, cityName) || "–"}</span>
                      ) : (
                        <span className="text-muted-foreground">All</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-navy-700">{m.lastSignInAt ? `${formatAgo(m.lastSignInAt, now)} ago` : <span className="text-muted-foreground">Never</span>}</TableCell>
                    <TableCell className="pr-4">{!isMe && <StaffRowActions member={m} roles={roles} cities={cityList} />}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
