import { describe, expect, it, vi } from 'vitest';

import { newTripOtp, RideOtpService } from './ride-otp.service.js';

type Row = { id: string; rideOtp: string | null; deletedAt: Date | null };

function setup(user: Row | null, openTrips: { id: string }[] = []) {
  const users = new Map(user ? [[user.id, { ...user }]] : []);
  const tripUpdates: unknown[] = [];
  const user_ = {
    findUnique: vi.fn(async ({ where }: { where: { id: string; deletedAt?: null } }) => {
      const u = users.get(where.id);
      return u && !(where.deletedAt === null && u.deletedAt) ? u : null;
    }),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => users.get(where.id)!),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string; rideOtp: null }; data: { rideOtp: string } }) => {
      const u = users.get(where.id);
      if (u && u.rideOtp === null) u.rideOtp = data.rideOtp;
      return { count: u ? 1 : 0 };
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: { rideOtp: string } }) => Object.assign(users.get(where.id)!, data)),
  };
  const trip = {
    updateMany: vi.fn(async (args: unknown) => (tripUpdates.push(args), { count: openTrips.length })),
    findMany: vi.fn(async () => openTrips),
  };
  const prisma = { user: user_, trip, $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn({ user: user_, trip }) };
  const events = { toUser: vi.fn() };
  return { otps: new RideOtpService(prisma as never, events as never), users, tripUpdates, events };
}

describe('newTripOtp', () => {
  it('is 4 digits without a leading zero', () => {
    for (let i = 0; i < 200; i++) expect(newTripOtp()).toMatch(/^[1-9]\d{3}$/);
  });
});

describe('RideOtpService', () => {
  it('makes the rider a code once and keeps it for every ride', async () => {
    const { otps } = setup({ id: 'u1', rideOtp: null, deletedAt: null });
    const first = await otps.forRider('u1');
    expect(first).toMatch(/^[1-9]\d{3}$/);
    expect(await otps.forRider('u1')).toBe(first);
  });

  it('returns the code already set', async () => {
    expect(await setup({ id: 'u1', rideOtp: '4321', deletedAt: null }).otps.forRider('u1')).toBe('4321');
  });

  it("changes to a new random code, moves the rider's own rides that haven't started, and tells the rider's app", async () => {
    const { otps, users, tripUpdates, events } = setup({ id: 'u1', rideOtp: '4321', deletedAt: null }, [{ id: 't1' }]);
    const code = await otps.change('u1');
    expect(code).toMatch(/^[1-9]\d{3}$/);
    expect(code).not.toBe('4321');
    expect(users.get('u1')!.rideOtp).toBe(code);
    expect(tripUpdates).toEqual([
      {
        where: { passengerId: 'u1', kind: 'RIDE', riderPhone: null, status: { in: ['SCHEDULED', 'SEARCHING', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED'] } },
        data: { otp: code },
      },
    ]);
    expect(events.toUser).toHaveBeenCalledWith('u1', 'trip.updated', { id: 't1' });
  });

  it('takes the code an admin typed', async () => {
    expect(await setup({ id: 'u1', rideOtp: '4321', deletedAt: null }).otps.change('u1', '7788')).toBe('7788');
  });

  it('404 for an unknown or deleted account', async () => {
    await expect(setup(null).otps.change('nobody')).rejects.toMatchObject({ status: 404 });
    await expect(setup({ id: 'u1', rideOtp: '4321', deletedAt: new Date() }).otps.change('u1')).rejects.toMatchObject({ status: 404 });
  });
});
