import type { BookTripDto } from './dto/book-trip.dto.js';
import { TripsService } from './trips.service.js';

const RIDE = { kind: 'RIDE', vehicleKind: 'BIKE', pickup: { lat: 11.0183, lng: 76.9725 }, drop: { lat: 11.009, lng: 76.96 } } as unknown as BookTripDto;

/** A TripsService that stops right after the trip-in-progress check (the next step, locating the pickup, throws). */
function setup(open: { id: string } | null) {
  const store = new Map<string, string>();
  const redis = {
    set: async (k: string, v: string, ...args: unknown[]) => (args.includes('NX') && store.has(k) ? null : (store.set(k, v), 'OK')),
    del: async (k: string) => Number(store.delete(k)),
  };
  const findFirst = vi.fn(async () => open);
  const prisma = { trip: { findFirst } };
  const settings = { all: async () => ({ scheduledDispatchLeadMin: 30 }) };
  const geo = {
    locate: async () => {
      throw new Error('past the check');
    },
  };
  const none = {} as never;
  const trips = new TripsService(prisma as never, none, none, none, none, geo as never, none, none, settings as never, none, none, none, none, none, none, none, none, redis as never, none);
  return { trips, store, findFirst };
}

describe('TripsService.book: one trip in progress per rider', () => {
  it('409 TRIP_IN_PROGRESS for a trip for now while another is searching or under way', async () => {
    const { trips, findFirst, store } = setup({ id: 'open1' });
    await expect(trips.book('p1', RIDE)).rejects.toMatchObject({ status: 409, response: { code: 'TRIP_IN_PROGRESS', details: { tripId: 'open1' } } });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { passengerId: 'p1', status: { in: ['SEARCHING', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'IN_PROGRESS', 'PICKED_UP'] } } }));
    expect(store.size).toBe(0); // the booking lock is let go
  });

  it('lets a rider with nothing in progress through, and a booking for later even with a trip under way', async () => {
    await expect(setup(null).trips.book('p1', RIDE)).rejects.toThrow('past the check');
    const later = { ...RIDE, rideMode: 'OUTSTATION', vehicleKind: 'SEDAN', scheduledAt: new Date(Date.now() + 86_400_000).toISOString() } as unknown as BookTripDto;
    const busy = setup({ id: 'open1' });
    await expect(busy.trips.book('p1', later)).rejects.toThrow('past the check');
    expect(busy.findFirst).not.toHaveBeenCalled();
  });

  it('refuses a second booking while the first is still being made (double tap)', async () => {
    const { trips, store } = setup(null);
    store.set('trips:booking:p1', '1');
    await expect(trips.book('p1', RIDE)).rejects.toMatchObject({ status: 409, message: 'Your booking is already on its way' });
  });
});
