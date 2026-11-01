// Staff permissions, as the API has them (apps/api/src/core/auth/permissions.ts): a view and a change permission per
// area (change includes view), plus CSV exports and deleting accounts. Owners need none; only owners manage the team.

export const PERMISSION_AREAS = [
  { key: "trips", label: "Trips", hint: "Trips, missed rides, live map, heatmap" },
  { key: "drivers", label: "Drivers & documents", hint: "Drivers, approvals, documents and photos" },
  { key: "riders", label: "Riders & accounts", hint: "Riders and accounts: edit, block, message, ride OTP" },
  { key: "support", label: "Support & SOS", hint: "Tickets and SOS alerts" },
  { key: "cities", label: "Cities & zones", hint: "Service areas, zones, fares, rentals, Surge now" },
  { key: "engage", label: "Engage", hint: "Reminders, campaigns, announcements, splash & banners" },
  { key: "finance", label: "Plans & payments", hint: "Driver plans, payments, cancellation fees" },
  { key: "settings", label: "Settings", hint: "Pricing, dispatch and app settings" },
  { key: "system", label: "System", hint: "Server health, audit log, travel speeds" },
] as const;
export type PermissionArea = (typeof PERMISSION_AREAS)[number]["key"];

export const EXTRA_PERMISSIONS = [
  { key: "exports", label: "Download CSV exports", hint: "Trips, drivers and payments, with phone numbers" },
  { key: "accounts.delete", label: "Delete accounts", hint: "Wipes a person's details for good" },
] as const;
export type Permission = `${PermissionArea}.view` | `${PermissionArea}.manage` | (typeof EXTRA_PERMISSIONS)[number]["key"];

/** Whether [granted] allows [needed] (an area's change includes its view). */
export function grants(granted: readonly string[], needed: Permission): boolean {
  if (granted.includes(needed)) return true;
  return needed.endsWith(".view") && granted.includes(needed.replace(/\.view$/, ".manage"));
}

/** "Trips: change · Riders: view · CSV exports" for a role card. */
export function permissionSummary(permissions: readonly string[]): string {
  const parts: string[] = PERMISSION_AREAS.flatMap((a) =>
    permissions.includes(`${a.key}.manage`) ? [`${a.label}: change`] : permissions.includes(`${a.key}.view`) ? [`${a.label}: view`] : [],
  );
  for (const e of EXTRA_PERMISSIONS) if (permissions.includes(e.key)) parts.push(e.label);
  return parts.length ? parts.join(" · ") : "Dashboard only";
}
