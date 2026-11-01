// Who may open and do what in the panel (unit-tested). The API enforces the same rules on every request; this only
// hides what a staff member can't use (sidebar, buttons) and keeps them off those pages (proxy.ts).
import { grants, type Permission } from "./permissions";

/** The signed-in admin's access (GET /admin/me). Missing level = owner (older APIs had no staff). */
export interface AdminAccess {
  readonly adminLevel?: "OWNER" | "SUPPORT";
  readonly permissions?: readonly string[];
  readonly cityIds?: readonly string[];
  readonly cityScoped?: boolean;
}

/** The permission a page needs (the longest matching prefix wins); "owner" = owners only; none = every admin. */
const PAGE_NEEDS: readonly [prefix: string, needs: Permission | "owner"][] = [
  ["/team", "owner"],
  ["/trips", "trips.view"],
  ["/live", "trips.view"],
  ["/heatmap", "trips.view"],
  ["/cancellation-fees", "finance.view"],
  ["/drivers", "drivers.view"],
  ["/kyc", "drivers.view"],
  ["/passengers", "riders.view"],
  ["/users", "riders.view"],
  ["/safety", "support.view"],
  ["/support", "support.view"],
  ["/cities", "cities.view"],
  ["/automations", "engage.view"],
  ["/announcements", "engage.view"],
  ["/promos", "engage.view"],
  ["/plans", "finance.view"],
  ["/payments", "finance.view"],
  ["/settings", "settings.view"],
  ["/system", "system.view"],
  ["/audit", "system.view"],
  ["/travel-speeds", "system.view"],
];

const startsAt = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export function isOwner(access: AdminAccess | null | undefined): boolean {
  return access?.adminLevel !== "SUPPORT";
}

/** May [access] do what [permission] covers? Owners may do everything. */
export function can(access: AdminAccess | null | undefined, permission: Permission): boolean {
  return isOwner(access) || grants(access?.permissions ?? [], permission);
}

/** May [access] set up [cityId]: change permission for cities and, in a city-limited role, one of their cities. */
export function canManageCity(access: AdminAccess | null | undefined, cityId: string): boolean {
  if (isOwner(access)) return true;
  return can(access, "cities.manage") && (!access?.cityScoped || (access.cityIds ?? []).includes(cityId));
}

/** May [access] open [path]? A city-limited role opens only its own cities' pages. */
export function canOpen(access: AdminAccess | null | undefined, path: string): boolean {
  if (isOwner(access)) return true;
  const match = PAGE_NEEDS.filter(([prefix]) => startsAt(path, prefix)).sort((a, b) => b[0].length - a[0].length)[0];
  if (!match) return true;
  if (match[1] === "owner") return false;
  if (!can(access, match[1])) return false;
  if (match[0] === "/cities" && access?.cityScoped) {
    const id = path.split("/")[2];
    return !id || (access.cityIds ?? []).includes(decodeURIComponent(id));
  }
  return true;
}
