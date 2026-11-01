import { can } from "@/lib/access";
import { getAccess } from "@/lib/access-server";
import type { Permission } from "@/lib/permissions";

/** Shows [children] only to admins whose role allows [permission] (owners always; the API refuses the rest anyway). */
export async function Can({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  return can(await getAccess(), permission) ? <>{children}</> : null;
}
