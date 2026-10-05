import { Role } from '../../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { RedisService } from '../redis/redis.service.js';
import { accessKey, blockedFlagKey, effectiveAccess, UserAccessService } from './user-access.service.js';

describe('effectiveAccess', () => {
  it("an admin's token keeps the app it signed in to; DRIVER needs a driver profile", () => {
    const admin = { role: Role.ADMIN, driverId: 'd1' };
    expect(effectiveAccess({ role: Role.ADMIN }, admin)).toEqual({ role: Role.ADMIN, driverId: 'd1' });
    expect(effectiveAccess({ role: Role.DRIVER }, admin)).toEqual({ role: Role.DRIVER, driverId: 'd1' });
    expect(effectiveAccess({ role: Role.PASSENGER }, admin)).toEqual({ role: Role.PASSENGER });
    expect(effectiveAccess({ role: Role.DRIVER }, { role: Role.ADMIN, driverId: null })).toEqual({ role: Role.PASSENGER });
  });

  it("everyone else gets the account's role now", () => {
    // Demoted: the panel token is a passenger one from the next request.
    expect(effectiveAccess({ role: Role.ADMIN }, { role: Role.PASSENGER, driverId: null })).toEqual({ role: Role.PASSENGER, driverId: undefined });
    // Registered as a driver: the old passenger token acts as the driver.
    expect(effectiveAccess({ role: Role.PASSENGER }, { role: Role.DRIVER, driverId: 'd2' })).toEqual({ role: Role.DRIVER, driverId: 'd2' });
    // Made a passenger again: the driver profile no longer applies.
    expect(effectiveAccess({ role: Role.DRIVER }, { role: Role.PASSENGER, driverId: 'd3' })).toEqual({ role: Role.PASSENGER, driverId: undefined });
  });
});

describe('UserAccessService', () => {
  function setup(row: { role: Role; isBlocked: boolean; deletedAt?: Date | null; driver: { id: string } | null } | null) {
    const store = new Map<string, string>();
    const redis = {
      mget: async (...keys: string[]) => keys.map((k) => store.get(k) ?? null),
      set: async (k: string, v: string) => (store.set(k, v), 'OK'),
      del: async (k: string) => Number(store.delete(k)),
    } as unknown as RedisService;
    const findUnique = vi.fn(async () => row);
    const prisma = { user: { findUnique } } as unknown as PrismaService;
    return { store, findUnique, access: new UserAccessService(prisma, redis) };
  }
  const token = { sub: 'u1', role: Role.PASSENGER };

  it('reads the account once, then from the cache until invalidated', async () => {
    const { store, findUnique, access } = setup({ role: Role.DRIVER, isBlocked: false, driver: { id: 'd1' } });
    expect(await access.resolve(token)).toEqual({ userId: 'u1', role: Role.DRIVER, driverId: 'd1' });
    expect(store.get(accessKey('u1'))).toBe('DRIVER|d1');
    await access.resolve(token);
    expect(findUnique).toHaveBeenCalledTimes(1);
    await access.invalidate('u1');
    await access.resolve(token);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('403 for a blocked account (the Redis flag, or the database when the flag is gone), 401 for a deleted one', async () => {
    const flagged = setup({ role: Role.PASSENGER, isBlocked: false, driver: null });
    flagged.store.set(blockedFlagKey('u1'), '1');
    await expect(flagged.access.resolve(token)).rejects.toMatchObject({ status: 403 });
    const inDb = setup({ role: Role.PASSENGER, isBlocked: true, driver: null });
    await expect(inDb.access.resolve(token)).rejects.toMatchObject({ status: 403 });
    expect(inDb.store.has(accessKey('u1'))).toBe(false);
    await expect(setup(null).access.resolve(token)).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a retained deleted row after Redis state is lost and never caches it', async () => {
    const deleted = setup({ role: Role.DRIVER, isBlocked: false, deletedAt: new Date(), driver: { id: 'd1' } });
    await expect(deleted.access.resolve(token)).rejects.toMatchObject({ status: 401 });
    expect(deleted.store.has(accessKey('u1'))).toBe(false);
    expect(deleted.findUnique).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ deletedAt: true }) }));
  });
});
