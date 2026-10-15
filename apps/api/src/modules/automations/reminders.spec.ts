import type { VehicleKind } from '../../generated/prisma/enums.js';
import {
  dedupeBlock,
  findRoutines,
  formatClock,
  isQuietHour,
  istDayStart,
  placeKey,
  routineReminderText,
  type RoutineTrip,
  searchReminderText,
} from './reminders.js';

/** [h]:[m] IST on [day] Oct 2026 (15 Oct is a Thursday). */
const ist = (h: number, m = 0, day = 15) => new Date(Date.UTC(2026, 9, day, h, m) - 330 * 60_000);

const BROOKEFIELDS = { lat: 11.009, lng: 76.96 };
const GANDHIPURAM = { lat: 11.0183, lng: 76.9725 };

function trip(at: Date, o: { to?: { lat: number; lng: number }; vehicle?: VehicleKind; rider?: string; pickupName?: string } = {}): RoutineTrip {
  const to = o.to ?? BROOKEFIELDS;
  return {
    passengerId: o.rider ?? 'r1',
    createdAt: at,
    vehicleKind: o.vehicle ?? 'AUTO',
    pickupName: o.pickupName ?? 'Home',
    pickupAddr: 'RS Puram',
    pickupLat: 11.0,
    pickupLng: 76.95,
    dropName: to === BROOKEFIELDS ? 'Brookefields Mall' : 'Gandhipuram',
    dropAddr: 'Coimbatore',
    dropLat: to.lat,
    dropLng: to.lng,
  };
}

describe('quiet hours (IST)', () => {
  const s = { reminderQuietStartHour: 22, reminderQuietEndHour: 8 };

  it('22:00–08:00 wraps past midnight', () => {
    expect(isQuietHour(ist(21, 59), s)).toBe(false);
    expect(isQuietHour(ist(22, 0), s)).toBe(true);
    expect(isQuietHour(ist(2, 0), s)).toBe(true);
    expect(isQuietHour(ist(7, 59), s)).toBe(true);
    expect(isQuietHour(ist(8, 0), s)).toBe(false);
  });

  it('a window within one day, and an empty one', () => {
    expect(isQuietHour(ist(13, 30), { reminderQuietStartHour: 13, reminderQuietEndHour: 15 })).toBe(true);
    expect(isQuietHour(ist(15, 0), { reminderQuietStartHour: 13, reminderQuietEndHour: 15 })).toBe(false);
    expect(isQuietHour(ist(23, 0), { reminderQuietStartHour: 8, reminderQuietEndHour: 8 })).toBe(false);
  });
});

describe('daily cap and same-place dedupe', () => {
  const now = ist(18);
  const place = placeKey(BROOKEFIELDS);
  const other = placeKey(GANDHIPURAM);

  it('the IST day starts at midnight IST', () => {
    expect(istDayStart(ist(0, 30))).toEqual(ist(0, 0));
    expect(istDayStart(ist(23, 59))).toEqual(ist(0, 0));
  });

  it('stops a third reminder today; yesterday’s don’t count', () => {
    const today = [
      { place: other, sentAt: ist(9) },
      { place: other, sentAt: ist(12) },
    ];
    expect(dedupeBlock({ now, sent: today, place, placeSince: istDayStart(now), dailyCap: 2 })).toBe('cap');
    const oneYesterday = [{ place: other, sentAt: ist(23, 50, 14) }, today[1]];
    expect(dedupeBlock({ now, sent: oneYesterday, place, placeSince: istDayStart(now), dailyCap: 2 })).toBeNull();
    expect(dedupeBlock({ now, sent: [], place, placeSince: istDayStart(now), dailyCap: 0 })).toBe('cap');
  });

  it('one reminder per place since placeSince', () => {
    const sent = [{ place, sentAt: ist(20, 0, 14) }];
    // Search: the last 24 h.
    expect(dedupeBlock({ now, sent, place, placeSince: new Date(now.getTime() - 86_400_000), dailyCap: 2 })).toBe('place');
    // Usual trip: today only.
    expect(dedupeBlock({ now, sent, place, placeSince: istDayStart(now), dailyCap: 2 })).toBeNull();
    expect(dedupeBlock({ now, sent, place: other, placeSince: new Date(now.getTime() - 86_400_000), dailyCap: 2 })).toBeNull();
  });
});

describe('wording', () => {
  it('search: first name and drop, else a fallback', () => {
    expect(searchReminderText({ userName: '  Siva Krishna ', dropName: 'Ooty', mode: 'OUTSTATION' })).toEqual({
      title: 'Siva, Ooty?',
      body: 'Drivers are available. Confirm now to get an outstation cab right at your doorstep.',
    });
    expect(searchReminderText({ userName: null, dropName: 'Brookefields Mall', mode: 'LOCAL' })).toEqual({
      title: 'Still going to Brookefields Mall?',
      body: 'Drivers are nearby. Book now and get there on time.',
    });
    expect(searchReminderText({ userName: 'Siva', dropName: ' ', mode: 'LOCAL' }).title).toBe('Still planning your trip?');
    expect(searchReminderText({ userName: 'Siva', dropName: 'Pinned location', mode: 'LOCAL' }).title).toBe('Still planning your trip?');
  });

  it('usual trip: drop, usual time and vehicle with its article', () => {
    expect(routineReminderText({ dropName: 'Brookefields Mall', usualMin: 8 * 60 + 30, vehicle: 'AUTO' })).toEqual({
      title: 'Going to Brookefields Mall?',
      body: 'Your usual 8:30 am ride is a tap away. Book an Auto now.',
    });
    expect(routineReminderText({ dropName: 'Office', usualMin: 18 * 60 + 5, vehicle: 'CAB' }).body).toBe('Your usual 6:05 pm ride is a tap away. Book a Mini now.');
    expect(routineReminderText({ dropName: 'Office', usualMin: 9 * 60, vehicle: 'SUV' }).body).toContain('Book an SUV now.');
  });

  it('formats the clock', () => {
    expect(formatClock(0)).toBe('12:00 am');
    expect(formatClock(12 * 60 + 30)).toBe('12:30 pm');
    expect(formatClock(1439)).toBe('11:59 pm');
  });
});

describe('findRoutines', () => {
  // 07:55 IST, lead 15 → the scan looks at 08:10.
  const now = ist(7, 55);
  const p = { now, targetMin: 8 * 60 + 10, leadMin: 15, minDays: 3 };

  it('a drop on 3 distinct days is a usual trip, with the median time, most used vehicle and latest pickup', () => {
    const out = findRoutines(
      [trip(ist(8, 0, 9), { vehicle: 'BIKE' }), trip(ist(8, 4, 12)), trip(ist(8, 2, 13), { pickupName: 'Gym' }), trip(ist(8, 20, 8))],
      p,
    );
    expect(out).toHaveLength(1);
    // Offsets −10, −8, −6, +10 → median −7 → 8:03.
    expect(out[0]).toMatchObject({ passengerId: 'r1', usualMin: 8 * 60 + 3, vehicle: 'AUTO', days: 4, place: placeKey(BROOKEFIELDS) });
    expect(out[0].drop).toEqual({ name: 'Brookefields Mall', address: 'Coimbatore', lat: BROOKEFIELDS.lat, lng: BROOKEFIELDS.lng });
    expect(out[0].pickup.name).toBe('Gym');
  });

  it('needs trips on minDays distinct days (two trips on one day count once)', () => {
    expect(findRoutines([trip(ist(8, 0, 12)), trip(ist(8, 5, 12)), trip(ist(8, 3, 13))], p)).toEqual([]);
  });

  it('the latest trip must be within 14 days', () => {
    expect(findRoutines([trip(ist(8, 0, 1)), trip(ist(8, 0, 2)), trip(ist(8, 0, 3))], { ...p, now: ist(7, 55, 18) })).toEqual([]);
    expect(findRoutines([trip(ist(8, 0, 1)), trip(ist(8, 0, 2)), trip(ist(8, 0, 4))], { ...p, now: ist(7, 55, 18) })).toHaveLength(1);
  });

  it('waits until the usual time is at most leadMin away, and not past it', () => {
    const at = (h: number, m: number) => [trip(ist(h, m, 12)), trip(ist(h, m, 13)), trip(ist(h, m, 14))];
    expect(findRoutines(at(8, 25), p)).toEqual([]); // 8:25 is 30 min away: a later scan
    expect(findRoutines(at(8, 10), p)).toHaveLength(1); // exactly leadMin away
    expect(findRoutines(at(7, 55), p)).toHaveLength(1); // now
    expect(findRoutines(at(7, 54), p)).toEqual([]); // already past
  });

  it('keeps riders and drops apart; a tie in vehicles goes to the latest', () => {
    const out = findRoutines(
      [
        trip(ist(8, 0, 12), { vehicle: 'BIKE' }),
        trip(ist(8, 0, 13), { vehicle: 'AUTO' }),
        trip(ist(8, 0, 14), { vehicle: 'BIKE' }),
        trip(ist(8, 0, 11), { vehicle: 'AUTO' }),
        trip(ist(8, 0, 12), { rider: 'r2' }),
        trip(ist(8, 0, 13), { rider: 'r2' }),
        trip(ist(8, 0, 14), { rider: 'r2', to: GANDHIPURAM }),
      ],
      p,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ passengerId: 'r1', vehicle: 'BIKE' });
  });

  it('times either side of midnight stay together', () => {
    const late = { now: ist(23, 50, 15), targetMin: 5, leadMin: 15, minDays: 3 };
    const out = findRoutines([trip(ist(23, 55, 10)), trip(ist(23, 58, 11)), trip(ist(0, 1, 13))], late);
    // Offsets −10, −7, −4 → median −7 → 23:58.
    expect(out.map((r) => r.usualMin)).toEqual([23 * 60 + 58]);
  });
});
