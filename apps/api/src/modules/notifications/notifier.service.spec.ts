import { Logger } from '@nestjs/common';

import type { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Trip } from '../../generated/prisma/client.js';
import type { SettingsService } from '../settings/settings.service.js';
import { NotifierService, type TripWithPeople } from './notifier.service.js';
import type { PushService } from './push.service.js';

function setup(opts: { findDriver?: () => Promise<unknown>; plans?: boolean } = {}) {
  const toUser = vi.fn();
  const push = { toUser, toTopic: vi.fn() } as unknown as PushService;
  const prisma = {
    driver: { findUnique: vi.fn(opts.findDriver ?? (() => Promise.resolve({ userId: 'u1' }))) },
    trip: { findUnique: vi.fn(() => Promise.reject(new Error('db down'))) },
  } as unknown as PrismaService;
  const settings = { get: vi.fn(() => Promise.resolve(opts.plans ?? false)) } as unknown as SettingsService;
  return { notifier: new NotifierService(push, prisma, settings), toUser };
}

describe('NotifierService', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('never rejects when a lookup fails (callers use `void`)', async () => {
    const { notifier, toUser } = setup({ findDriver: () => Promise.reject(new Error('db down')) });
    const trip = { id: 't1', kind: 'RIDE', fareTotal: 35, pickupName: 'A', dropName: 'B' } as unknown as Trip;
    await expect(notifier.offer({ driverId: 'd1', trip, pickupEtaMin: 3, expiresInSeconds: 15 })).resolves.toBeUndefined();
    await expect(notifier.kycReviewed({ driverId: 'd1', status: 'APPROVED' })).resolves.toBeUndefined();
    await expect(notifier.photoSubmitted('d1')).resolves.toBeUndefined();
    await expect(notifier.photoReviewed({ driverId: 'd1', isApproved: true, reason: '' })).resolves.toBeUndefined();
    await expect(notifier.chat({ tripId: 't1', from: 'DRIVER', text: 'hi' })).resolves.toBeUndefined();
    expect(toUser).not.toHaveBeenCalled();
  });

  it('never throws on a trip it cannot describe', () => {
    const { notifier } = setup();
    const broken = { id: 't1', status: 'DRIVER_ASSIGNED', driver: {} } as unknown as TripWithPeople;
    expect(() => notifier.tripChanged(broken, 'SYSTEM')).not.toThrow();
  });

  it('approval push skips "Choose a plan" while paid plans are off', async () => {
    const { notifier, toUser } = setup({ plans: false });
    await notifier.kycReviewed({ driverId: 'd1', status: 'APPROVED' });
    expect(toUser).toHaveBeenCalledWith('u1', 'DRIVER', expect.objectContaining({ body: 'Go online to start earning' }));
  });

  it('approval push mentions plans when they are on', async () => {
    const { notifier, toUser } = setup({ plans: true });
    await notifier.kycReviewed({ driverId: 'd1', status: 'APPROVED' });
    expect(toUser).toHaveBeenCalledWith('u1', 'DRIVER', expect.objectContaining({ body: 'Choose a plan and go online to start earning' }));
  });

  it('tells the passenger a dropped trip is finding another driver (not the first search)', () => {
    const { notifier, toUser } = setup();
    const trip = { id: 't1', kind: 'RIDE', status: 'SEARCHING', passengerId: 'p1', reassignCount: 0 } as unknown as TripWithPeople;
    notifier.tripChanged(trip, 'PASSENGER');
    expect(toUser).not.toHaveBeenCalled();
    notifier.tripChanged({ ...trip, reassignCount: 1 }, 'DRIVER');
    expect(toUser).toHaveBeenCalledWith('p1', 'PASSENGER', expect.objectContaining({ title: 'Finding you another driver' }));
    notifier.tripChanged({ ...trip, reassignCount: 1 }, 'SYSTEM');
    expect(toUser).toHaveBeenLastCalledWith('p1', 'PASSENGER', expect.objectContaining({ body: expect.stringContaining("wasn't on the way") }));
  });
});
