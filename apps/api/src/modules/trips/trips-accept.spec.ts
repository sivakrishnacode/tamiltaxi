import type { Trip } from '../../generated/prisma/client.js';
import { TripsService } from './trips.service.js';

const TRIP = { id: 't1', status: 'SEARCHING', pickupLat: 11.01, pickupLng: 76.97, vehicleKind: 'BIKE', alsoKinds: [], alsoFares: null } as unknown as Trip;

/** A TripsService with only what accept() touches; [opts] steer the guarded write and the steps after it. */
function setup(opts: { writeWins: boolean; afterWriteFails?: boolean; driver?: Record<string, unknown> }) {
  const releaseBusy = vi.fn(async () => undefined);
  const prisma = {
    trip: { findUnique: async () => TRIP, updateMany: async () => ({ count: opts.writeWins ? 1 : 0 }) },
    driver: { findUnique: async () => ({ vehicleKind: 'BIKE', status: 'APPROVED', blockedUntil: null, user: { isBlocked: false }, ...opts.driver }) },
  };
  const dispatch = {
    offeredTo: async () => 'd1',
    accepted: async () => {
      if (opts.afterWriteFails) throw new Error('Redis hiccup');
    },
  };
  const location = { claimBusy: async () => true, releaseBusy, position: async () => null };
  const none = {} as never;
  const trips = new TripsService(prisma as never, none, dispatch as never, location as never, none, none, none, none, none, none, none, none, none, none, none, none, none, none, none);
  return { trips, releaseBusy };
}

describe('TripsService.accept', () => {
  it('frees the driver again when the guarded write lost (someone else took it, or it was cancelled)', async () => {
    const { trips, releaseBusy } = setup({ writeWins: false });
    await expect(trips.accept('d1', 't1')).rejects.toMatchObject({ status: 409, message: 'Trip already taken or cancelled' });
    expect(releaseBusy).toHaveBeenCalledWith('d1', 't1', false);
  });

  it('refuses a driver who is not approved, is paused or is blocked, before claiming anything', async () => {
    const onHold = setup({ writeWins: true, driver: { status: 'ON_HOLD' } });
    await expect(onHold.trips.accept('d1', 't1')).rejects.toMatchObject({ status: 403, message: "You can't take trips while your account is on hold" });
    const until = new Date(Date.now() + 3_600_000);
    const paused = setup({ writeWins: true, driver: { blockedUntil: until } });
    await expect(paused.trips.accept('d1', 't1')).rejects.toMatchObject({ status: 403, response: { code: 'DRIVER_TEMP_BLOCKED', details: { until: until.toISOString() } } });
    const blocked = setup({ writeWins: true, driver: { user: { isBlocked: true } } });
    await expect(blocked.trips.accept('d1', 't1')).rejects.toMatchObject({ status: 403 });
    // A pause that has ended doesn't count.
    const ended = setup({ writeWins: false, driver: { blockedUntil: new Date(Date.now() - 1000) } });
    await expect(ended.trips.accept('d1', 't1')).rejects.toMatchObject({ status: 409 });
  });

  it('keeps the driver busy when a step after a won write fails: the trip is theirs', async () => {
    const { trips, releaseBusy } = setup({ writeWins: true, afterWriteFails: true });
    await expect(trips.accept('d1', 't1')).rejects.toThrow('Redis hiccup');
    expect(releaseBusy).not.toHaveBeenCalled();
  });
});
