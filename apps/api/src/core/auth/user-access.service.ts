import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';

import { Role } from '../../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import type { AuthUser, JwtPayload } from './auth-user.js';

/** The account as it is now: its role and driver profile. */
export interface Account {
  readonly role: Role;
  readonly driverId: string | null;
}

/** `user:access:<id>` = `<role>|<driverId>`: the account's role and driver profile, cached for [ACCESS_TTL_S]. */
export const accessKey = (userId: string): string => `user:access:${userId}`;
/** Set while an admin has blocked the account (AdminUsersService), checked on every request. */
export const blockedFlagKey = (userId: string): string => `user:blocked:${userId}`;
/** A missed invalidation (a change made straight in the database) is picked up after this long at most. */
export const ACCESS_TTL_S = 600;

export const BLOCKED_MESSAGE = 'Your account is blocked. Contact support.';

/**
 * What a token may do now. Its role is the app it signed in to ([loginRole]), checked against the account: an
 * admin's token keeps the app's role (ADMIN in the panel, DRIVER in the driver app with a driver profile, else
 * PASSENGER). An explicit passenger-app token stays a passenger token even when the account also drives.
 * Legacy tokens follow the account's current role, so registration and admin demotion still apply immediately.
 */
export function effectiveAccess(token: Pick<JwtPayload, 'role' | 'app'>, account: Account): Pick<AuthUser, 'role' | 'driverId'> {
  if (token.app === 'passenger') return { role: Role.PASSENGER };
  const driverId = account.driverId ?? undefined;
  if (account.role !== Role.ADMIN) return { role: account.role, driverId: account.role === Role.PASSENGER ? undefined : driverId };
  if (token.role === Role.ADMIN) return { role: Role.ADMIN, driverId };
  if (token.role === Role.DRIVER && driverId) return { role: Role.DRIVER, driverId };
  return { role: Role.PASSENGER };
}

/**
 * Per request, the caller's current role and driver profile (not the ones in the 30-day JWT): one Redis round trip
 * (the block flag + the cached account), the database on a miss. Call [invalidate] after changing a user's role or
 * driver profile; issuing a token does it too.
 */
@Injectable()
export class UserAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** The caller for [token]: 401 when the account is gone, 403 when it is blocked. */
  async resolve(token: JwtPayload): Promise<AuthUser> {
    const [blocked, cached] = await this.redis.mget(blockedFlagKey(token.sub), accessKey(token.sub));
    if (blocked) throw new ForbiddenException(BLOCKED_MESSAGE);
    const account = cached ? UserAccessService.decode(cached) : await this.load(token.sub);
    return { userId: token.sub, ...effectiveAccess(token, account) };
  }

  /** Drops the cached account of [userId]: the next request reads the role and driver profile again. */
  async invalidate(userId: string): Promise<void> {
    await this.redis.del(accessKey(userId));
  }

  private async load(userId: string): Promise<Account> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, isBlocked: true, deletedAt: true, driver: { select: { id: true } } } });
    if (!user || user.deletedAt) throw new UnauthorizedException('Your account no longer exists. Please sign in again.');
    // Blocked in the database but the Redis flag is gone (e.g. Redis was flushed): still blocked, nothing cached.
    if (user.isBlocked) throw new ForbiddenException(BLOCKED_MESSAGE);
    const account = { role: user.role, driverId: user.driver?.id ?? null };
    await this.redis.set(accessKey(userId), `${account.role}|${account.driverId ?? ''}`, 'EX', ACCESS_TTL_S);
    return account;
  }

  private static decode(raw: string): Account {
    const [role, driverId] = raw.split('|');
    return { role: role as Role, driverId: driverId || null };
  }
}
