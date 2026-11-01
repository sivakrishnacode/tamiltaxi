import { MapPinnedIcon, ShieldCheckIcon } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState, PageHeader } from "@/components/common/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adminApi } from "@/lib/api";
import { formatCount } from "@/lib/format";
import { EXTRA_PERMISSIONS, PERMISSION_AREAS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

import { DeleteRoleButton, RoleEditor } from "./role-dialogs";

export const metadata: Metadata = { title: "Roles" };

/** One area's level in a role: change, view or nothing. */
function Level({ permissions, area }: { permissions: readonly string[]; area: string }) {
  const level = permissions.includes(`${area}.manage`) ? "Change" : permissions.includes(`${area}.view`) ? "View" : null;
  return (
    <span className={cn("rounded px-1.5 py-px text-[11px] font-medium", level === "Change" ? "bg-coral-50 text-coral-700" : level === "View" ? "bg-info-tint text-navy-700" : "text-muted-foreground")}>
      {level ?? "–"}
    </span>
  );
}

export default async function RolesPage() {
  const { roles } = await adminApi.team();
  return (
    <>
      <PageHeader
        title="Roles"
        description="What each kind of staff may see and change. Owners always have everything; only owners manage the team."
        actions={<RoleEditor />}
      />
      {roles.length === 0 ? (
        <Card className="py-0">
          <EmptyState icon={ShieldCheckIcon} title="No roles yet" description="Make one, e.g. Support or KYC reviewer, then give it to staff." />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {roles.map((role) => {
            const members = role._count?.members ?? 0;
            return (
              <Card key={role.id} className="gap-3">
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 font-semibold">
                    {role.name}
                    {role.isCityScoped && (
                      <Badge variant="secondary" className="gap-1">
                        <MapPinnedIcon className="size-3" aria-hidden /> Own cities
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {role.description || "No description"} · {formatCount(members)} {members === 1 ? "person" : "people"}
                  </CardDescription>
                  <CardAction className="flex">
                    <RoleEditor role={role} />
                    <DeleteRoleButton role={role} />
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    {PERMISSION_AREAS.map((a) => (
                      <div key={a.key} className="flex items-center justify-between gap-2">
                        <dt className="truncate text-muted-foreground">{a.label}</dt>
                        <dd>
                          <Level permissions={role.permissions} area={a.key} />
                        </dd>
                      </div>
                    ))}
                    {EXTRA_PERMISSIONS.filter((x) => role.permissions.includes(x.key)).map((x) => (
                      <div key={x.key} className="col-span-2 text-coral-700">
                        ✓ {x.label}
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
