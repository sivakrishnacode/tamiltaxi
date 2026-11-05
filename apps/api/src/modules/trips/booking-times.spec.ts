import { RideMode } from '../../generated/prisma/enums.js';
import { bookingTimes } from './booking-times.js';

const now = new Date('2026-10-05T10:00:00Z');
const at = (h: number): string => new Date(now.getTime() + h * 3_600_000).toISOString();

describe('bookingTimes', () => {
  it('local rides go now; rentals and outstation may be booked up to 7 days ahead', () => {
    expect(bookingTimes({}, RideMode.LOCAL, now)).toEqual({ scheduledAt: null, returnAt: null });
    expect(() => bookingTimes({ scheduledAt: at(2) }, RideMode.LOCAL, now)).toThrow('rentals and outstation');
    expect(bookingTimes({ scheduledAt: at(20) }, RideMode.RENTAL, now).scheduledAt?.toISOString()).toBe(at(20));
    expect(() => bookingTimes({ scheduledAt: at(24 * 8) }, RideMode.RENTAL, now)).toThrow('7 days');
    expect(() => bookingTimes({ scheduledAt: at(-1) }, RideMode.RENTAL, now)).toThrow('future');
    // Within a minute: now.
    expect(bookingTimes({ scheduledAt: at(0.01) }, RideMode.RENTAL, now).scheduledAt).toBeNull();
  });

  it('a round trip comes back after it leaves, within 7 days, or straight back without a return time', () => {
    expect(bookingTimes({ roundTrip: true }, RideMode.OUTSTATION, now)).toEqual({ scheduledAt: null, returnAt: null });
    expect(() => bookingTimes({ roundTrip: true, scheduledAt: at(5), returnAt: at(4) }, RideMode.OUTSTATION, now)).toThrow('after you leave');
    expect(() => bookingTimes({ roundTrip: true, returnAt: at(24 * 8) }, RideMode.OUTSTATION, now)).toThrow('7 days');
    expect(bookingTimes({ roundTrip: true, scheduledAt: at(5), returnAt: at(30) }, RideMode.OUTSTATION, now).returnAt?.toISOString()).toBe(at(30));
    // One way: no return time.
    expect(bookingTimes({ roundTrip: false, returnAt: at(30) }, RideMode.OUTSTATION, now).returnAt).toBeNull();
  });

  it('a house shift is always for a slot, at least an hour ahead and within 7 days', () => {
    expect(() => bookingTimes({}, RideMode.LOCAL, now, { shifting: true })).toThrow('day and time slot');
    expect(() => bookingTimes({ scheduledAt: at(0.5) }, RideMode.LOCAL, now, { shifting: true })).toThrow('an hour');
    expect(() => bookingTimes({ scheduledAt: at(24 * 8) }, RideMode.LOCAL, now, { shifting: true })).toThrow('7 days');
    expect(bookingTimes({ scheduledAt: at(26) }, RideMode.LOCAL, now, { shifting: true }).scheduledAt?.toISOString()).toBe(at(26));
    // To another town too (priced by the km).
    expect(bookingTimes({ scheduledAt: at(3) }, RideMode.OUTSTATION, now, { shifting: true }).scheduledAt?.toISOString()).toBe(at(3));
  });
});
