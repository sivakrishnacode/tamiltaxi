import { ForbiddenException } from '@nestjs/common';

import { AdminLevel } from '../../generated/prisma/enums.js';
import type { AuthUser } from './auth-user.js';

/** An owner admin (everything). Callers without a level (older cached entries) count as owners, as they all were. */
export function isOwner(user: Pick<AuthUser, 'adminLevel'>): boolean {
  return user.adminLevel !== AdminLevel.SUPPORT;
}

/** Owners set up every city; a support admin only the cities assigned to them (a city admin). */
export function canManageCity(user: Pick<AuthUser, 'adminLevel' | 'adminCityIds'>, cityId: string): boolean {
  return isOwner(user) || (user.adminCityIds ?? []).includes(cityId);
}

/** 403 unless [user] may set up [cityId]. */
export function assertCityAccess(user: Pick<AuthUser, 'adminLevel' | 'adminCityIds'>, cityId: string): void {
  if (!canManageCity(user, cityId)) throw new ForbiddenException('You can only set up the cities assigned to you');
}
