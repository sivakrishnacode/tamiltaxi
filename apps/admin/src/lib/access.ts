// Who may open what in the panel (unit-tested). The API enforces the same rules; this only hides what a support
// admin can't use (sidebar, buttons) and keeps them off those pages (proxy.ts).

/** The signed-in admin's access, from the session cookie. Missing level (a session from before levels) = owner. */
export interface AdminAccess {
  readonly adminLevel?: "OWNER" | "SUPPORT";
  readonly adminCityIds?: readonly string[];
}

/** Pages only owners use: global setup, money and messages to everyone. */
const OWNER_ONLY_PREFIXES = ["/settings", "/plans", "/payments", "/announcements", "/promos", "/automations"] as const;

const startsAt = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export function isOwner(access: AdminAccess | null | undefined): boolean {
  return access?.adminLevel !== "SUPPORT";
}

/** A support admin with cities assigned: sets up those cities. */
export function isCityAdmin(access: AdminAccess | null | undefined): boolean {
  return !isOwner(access) && (access?.adminCityIds?.length ?? 0) > 0;
}

/** May [access] set up [cityId] (service area, zones, fares, city settings)? */
export function canManageCity(access: AdminAccess | null | undefined, cityId: string): boolean {
  return isOwner(access) || (access?.adminCityIds ?? []).includes(cityId);
}

/** May [access] open [path]? Cities: owners all, a city admin the list and their own cities, others none. */
export function canOpen(access: AdminAccess | null | undefined, path: string): boolean {
  if (isOwner(access)) return true;
  if (OWNER_ONLY_PREFIXES.some((p) => startsAt(path, p))) return false;
  if (startsAt(path, "/cities")) {
    const id = path.split("/")[2];
    return isCityAdmin(access) && (!id || canManageCity(access, decodeURIComponent(id)));
  }
  return true;
}

/** "Owner", "Support", "City admin: Tiruppur, Erode" (city names when known, else ids). */
export function accessLabel(access: AdminAccess, cityNames: Readonly<Record<string, string>> = {}): string {
  if (isOwner(access)) return "Owner";
  const cities = (access.adminCityIds ?? []).map((id) => cityNames[id] ?? id);
  return cities.length ? `City admin: ${cities.join(", ")}` : "Support";
}
