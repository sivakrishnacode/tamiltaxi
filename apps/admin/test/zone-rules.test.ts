import { describe, expect, it } from "vitest";

import { daysLabel, isLiveNow, scheduleLabel, toMinute, toTime, zoneState } from "@/lib/zone-rules";

/** [hh:mm] IST on a day of November 2026 (1 Nov 2026 is a Sunday). */
const ist = (date: number, hh: number, mm = 0) => new Date(Date.UTC(2026, 10, date, hh, mm) - 330 * 60_000);
const always = { days: [], startMinute: null, endMinute: null, startsAt: null, endsAt: null };

describe("zone rules", () => {
  it("converts times", () => {
    expect(toMinute("07:30")).toBe(450);
    expect(toMinute("24:00")).toBeNull();
    expect(toMinute("7")).toBeNull();
    expect(toTime(450)).toBe("07:30");
  });

  it("is live by the API's rule, past midnight included", () => {
    const peak = { ...always, days: [1, 2, 3, 4, 5], startMinute: 420, endMinute: 600 };
    expect(isLiveNow(peak, ist(2, 8))).toBe(true);
    expect(isLiveNow(peak, ist(1, 8))).toBe(false);
    const late = { ...always, days: [5], startMinute: 1320, endMinute: 120 };
    expect(isLiveNow(late, ist(7, 1))).toBe(true);
    expect(isLiveNow(late, ist(6, 1))).toBe(false);
  });

  it("words the schedule", () => {
    expect(scheduleLabel(always)).toBe("Always");
    expect(scheduleLabel({ ...always, days: [1, 2, 3, 4, 5], startMinute: 420, endMinute: 600 })).toBe("Weekdays, 7 am–10 am");
    expect(scheduleLabel({ ...always, days: [5], startMinute: 1320, endMinute: 120 })).toBe("Fri, 10 pm–2 am");
    expect(scheduleLabel({ ...always, endsAt: ist(12, 18, 30).toISOString() })).toBe("Until 12 Nov, 6:30 pm");
    expect(daysLabel([0, 6])).toBe("Weekends");
    expect(daysLabel([1, 3, 5])).toBe("Mon, Wed, Fri");
  });

  it("says where a zone stands", () => {
    const now = ist(3, 18);
    expect(zoneState({ ...always, isActive: false }, now)).toBe("paused");
    expect(zoneState({ ...always, isActive: true, endsAt: ist(3, 17).toISOString() }, now)).toBe("ended");
    expect(zoneState({ ...always, isActive: true, startsAt: ist(3, 19).toISOString() }, now)).toBe("upcoming");
    expect(zoneState({ ...always, isActive: true, startMinute: 420, endMinute: 600 }, now)).toBe("off");
    expect(zoneState({ ...always, isActive: true }, now)).toBe("live");
  });
});
