import { isZoneLive, surgeAppliesTo } from './zone-schedule.js';

/** [hh:mm] IST on a day of November 2026 (1 Nov 2026 is a Sunday). */
const ist = (date: number, hh: number, mm = 0) => new Date(Date.UTC(2026, 10, date, hh, mm) - 330 * 60_000);
const always = { days: [], startMinute: null, endMinute: null, startsAt: null, endsAt: null };

describe('zone schedule', () => {
  it('is always live without a window', () => {
    expect(isZoneLive(always, ist(1, 3))).toBe(true);
  });

  it('keeps to its days and hours (IST)', () => {
    // Weekdays 7–10 am.
    const peak = { ...always, days: [1, 2, 3, 4, 5], startMinute: 7 * 60, endMinute: 10 * 60 };
    expect(isZoneLive(peak, ist(2, 7))).toBe(true); // Monday 07:00
    expect(isZoneLive(peak, ist(2, 9, 59))).toBe(true);
    expect(isZoneLive(peak, ist(2, 10))).toBe(false);
    expect(isZoneLive(peak, ist(2, 6, 59))).toBe(false);
    expect(isZoneLive(peak, ist(1, 8))).toBe(false); // Sunday
  });

  it('runs a window past midnight from the day it starts', () => {
    // Fridays 22:00–02:00.
    const late = { ...always, days: [5], startMinute: 22 * 60, endMinute: 2 * 60 };
    expect(isZoneLive(late, ist(6, 23))).toBe(true); // Friday 23:00
    expect(isZoneLive(late, ist(7, 1, 30))).toBe(true); // Saturday 01:30
    expect(isZoneLive(late, ist(7, 2))).toBe(false);
    expect(isZoneLive(late, ist(6, 1))).toBe(false); // Friday 01:00 belongs to Thursday night
  });

  it('holds only between its start and end (a temporary surge)', () => {
    const rain = { ...always, startsAt: ist(3, 17), endsAt: ist(3, 19) };
    expect(isZoneLive(rain, ist(3, 16, 59))).toBe(false);
    expect(isZoneLive(rain, ist(3, 18))).toBe(true);
    expect(isZoneLive(rain, ist(3, 19))).toBe(false);
  });

  it('surges the vehicles it lists, or all', () => {
    expect(surgeAppliesTo({ vehicleKinds: [] }, 'AUTO')).toBe(true);
    expect(surgeAppliesTo({ vehicleKinds: ['BIKE', 'CAB'] }, 'BIKE')).toBe(true);
    expect(surgeAppliesTo({ vehicleKinds: ['BIKE', 'CAB'] }, 'AUTO')).toBe(false);
  });
});
