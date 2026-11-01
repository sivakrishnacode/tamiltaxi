import { SetMetadata } from '@nestjs/common';

/**
 * What a staff role may do in the admin panel. Each area has a view and a change ("manage") permission; manage
 * includes view. Owners (AdminLevel OWNER) need none of these; only owners manage the team. The admin panel keeps a copy
 * of this list (apps/admin/src/lib/permissions.ts).
 */
export const PERMISSION_AREAS = ['trips', 'drivers', 'riders', 'support', 'cities', 'engage', 'finance', 'settings', 'system'] as const;
export type PermissionArea = (typeof PERMISSION_AREAS)[number];
export const EXTRA_PERMISSIONS = ['exports', 'accounts.delete'] as const;
export type Permission = `${PermissionArea}.view` | `${PermissionArea}.manage` | (typeof EXTRA_PERMISSIONS)[number];

export const ALL_PERMISSIONS: readonly Permission[] = [
  ...PERMISSION_AREAS.flatMap((a) => [`${a}.view` as const, `${a}.manage` as const]),
  ...EXTRA_PERMISSIONS,
];

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(value);
}

/** Whether [granted] allows [needed] (an area's manage includes its view). */
export function grants(granted: readonly string[], needed: Permission): boolean {
  if (granted.includes(needed)) return true;
  return needed.endsWith('.view') && granted.includes(needed.replace(/\.view$/, '.manage'));
}

export const NEEDS_KEY = 'needs';
export type NeedsMeta = { readonly any: readonly Permission[] } | { readonly area: PermissionArea };

/** A staff member needs one of [permissions] for this route (owners always pass). */
export const Needs = (...permissions: Permission[]): MethodDecorator & ClassDecorator => SetMetadata(NEEDS_KEY, { any: permissions } satisfies NeedsMeta);

/** On a controller: its GET routes need `<area>.view`, the others `<area>.manage` (a handler's @Needs wins). */
export const NeedsArea = (area: PermissionArea): ClassDecorator => SetMetadata(NEEDS_KEY, { area } satisfies NeedsMeta);

/** A route every staff member may use, inside a controller marked with @NeedsArea (e.g. the cities list on the dashboard). */
export const AnyStaff = (): MethodDecorator => SetMetadata(NEEDS_KEY, null);
