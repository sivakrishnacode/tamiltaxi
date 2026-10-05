import type { Trip } from '../../generated/prisma/client.js';
import { TripStatus } from '../../generated/prisma/enums.js';
import { TRIP_JOBS } from './trip-timeouts.js';
import { TripsService } from './trips.service.js';

type ScheduledTrip = Pick<Trip, 'id' | 'passengerId' | 'status' | 'pickupLat' | 'pickupLng'>;

function setup(statuses: TripStatus[] = [TripStatus.SCHEDULED]) {
  const rows: ScheduledTrip[] = statuses.map((status, i) => ({ id: `t${i}`, passengerId: 'p1', status, pickupLat: 11, pickupLng: 77 }));
  const locks = new Map<string, string>();
  const redis = {
    set: async (key: string, value: string) => locks.has(key) ? null : (locks.set(key, value), 'OK'),
    del: vi.fn(async (key: string) => Number(locks.delete(key))),
  };
  const findFirst = vi.fn(async () => rows.find((t) => t.status !== TripStatus.SCHEDULED && t.status !== TripStatus.CANCELLED) ?? null);
  const updateMany = vi.fn(async ({ where }: { where: { id: string; status: TripStatus } }) => {
    const trip = rows.find((t) => t.id === where.id && t.status === where.status);
    if (!trip) return { count: 0 };
    trip.status = TripStatus.SEARCHING;
    return { count: 1 };
  });
  const prisma = { trip: {
    findUnique: async ({ where }: { where: { id: string } }) => rows.find((t) => t.id === where.id) ?? null,
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => rows.find((t) => t.id === where.id)!,
    findFirst, updateMany,
  } };
  const dispatch = { start: vi.fn(async () => {}) };
  const demand = { recordRequest: vi.fn(async () => {}) };
  const events = { toTrip: vi.fn(), toUser: vi.fn() };
  const notifier = { tripChanged: vi.fn() };
  const jobs = { schedule: vi.fn(async (_kind: string, _id: string, _runAt: number) => {}) };
  const none = {} as never;
  const trips = new TripsService(prisma as never, none, dispatch as never, none, events as never, none, demand as never,
    notifier as never, none, none, jobs as never, none, none, none, none, none, none, redis as never);
  return { trips, rows, locks, jobs, dispatch, demand, updateMany, findFirst, redis };
}

describe('scheduled dispatch shares the passenger booking constraint', () => {
  it('defers while a trip is active, then starts once it finishes', async () => {
    const rig = setup([TripStatus.SCHEDULED, TripStatus.IN_PROGRESS]);
    const before = Date.now();
    await rig.trips.startScheduled('t0');
    expect(rig.rows[0].status).toBe(TripStatus.SCHEDULED);
    expect(rig.dispatch.start).not.toHaveBeenCalled();
    expect(rig.jobs.schedule).toHaveBeenCalledWith(TRIP_JOBS.scheduledDispatch, 't0', expect.any(Number));
    expect(rig.jobs.schedule.mock.calls[0][2]).toBeGreaterThanOrEqual(before + 60_000);
    expect(rig.locks.size).toBe(0);
    rig.rows[1].status = TripStatus.CANCELLED;
    await rig.trips.startScheduled('t0');
    expect(rig.rows[0].status).toBe(TripStatus.SEARCHING);
    expect(rig.dispatch.start).toHaveBeenCalledTimes(1);
  });

  it('defers when an immediate booking already owns the passenger lock', async () => {
    const rig = setup();
    rig.locks.set('trips:booking:p1', '1');
    await rig.trips.startScheduled('t0');
    expect(rig.rows[0].status).toBe(TripStatus.SCHEDULED);
    expect(rig.jobs.schedule).toHaveBeenCalledTimes(1);
    expect(rig.redis.del).not.toHaveBeenCalled();
  });

  it('concurrent scheduled trips start only one search', async () => {
    const rig = setup([TripStatus.SCHEDULED, TripStatus.SCHEDULED]);
    await Promise.all([rig.trips.startScheduled('t0'), rig.trips.startScheduled('t1')]);
    expect(rig.rows.filter((t) => t.status === TripStatus.SEARCHING)).toHaveLength(1);
    expect(rig.rows.filter((t) => t.status === TripStatus.SCHEDULED)).toHaveLength(1);
    expect(rig.dispatch.start).toHaveBeenCalledTimes(1);
    expect(rig.jobs.schedule).toHaveBeenCalledTimes(1);
  });

  it('refuses an immediate booking while scheduled activation holds the lock', async () => {
    const rig = setup();
    rig.findFirst.mockImplementationOnce(async () => {
      await expect(rig.trips.book('p1', {} as never)).rejects.toMatchObject({ status: 409 });
      return null;
    });
    await rig.trips.startScheduled('t0');
    expect(rig.dispatch.start).toHaveBeenCalledTimes(1);
  });

  it('does not revive a booking cancelled while activation was being checked', async () => {
    const rig = setup();
    rig.findFirst.mockImplementationOnce(async () => { rig.rows[0].status = TripStatus.CANCELLED; return null; });
    await rig.trips.startScheduled('t0');
    expect(rig.rows[0].status).toBe(TripStatus.CANCELLED);
    expect(rig.dispatch.start).not.toHaveBeenCalled();
    expect(rig.locks.size).toBe(0);
  });

  it('ignores missing or finished bookings and releases the lock on errors', async () => {
    const rig = setup([TripStatus.CANCELLED]);
    await rig.trips.startScheduled('missing');
    await rig.trips.startScheduled('t0');
    expect(rig.jobs.schedule).not.toHaveBeenCalled();
    rig.rows[0].status = TripStatus.SCHEDULED;
    rig.findFirst.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(rig.trips.startScheduled('t0')).rejects.toThrow('database unavailable');
    expect(rig.locks.size).toBe(0);
  });
});
