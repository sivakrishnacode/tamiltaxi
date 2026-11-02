import { describe, expect, it } from "vitest";

import { HEAT_STOPS, heatColor, heatLegend, heatQuery, presetRange } from "@/lib/heat";
import { cellAt, toResolution } from "@/lib/hex";

describe("heat colour scale", () => {
  it("runs from the first to the last stop and clamps", () => {
    expect(heatColor(0).toUpperCase()).toBe(HEAT_STOPS[0]);
    expect(heatColor(1).toUpperCase()).toBe(HEAT_STOPS[HEAT_STOPS.length - 1]);
    expect(heatColor(-3)).toBe(heatColor(0));
    expect(heatColor(9)).toBe(heatColor(1));
    expect(heatColor(Number.NaN)).toBe(heatColor(0));
  });

  it("builds 5 legend bands covering 0..max", () => {
    const l = heatLegend(271);
    expect(l).toHaveLength(5);
    expect(l[0].from).toBe(0);
    expect(l[4].to).toBe(271);
    for (let i = 1; i < 5; i++) expect(l[i].from).toBe(l[i - 1].to + 1);
  });

  it("never shows empty or upside-down bands for little or no data", () => {
    expect(heatLegend(0)).toEqual([]);
    const l = heatLegend(3);
    expect(l.map((b) => [b.from, b.to])).toEqual([[0, 1], [2, 2], [3, 3]]);
    expect(heatLegend(1)[0].color).toBe(heatColor(1)); // the only band matches the (darkest) hexagon
  });
});

describe("heat filters", () => {
  it("date presets end now; today starts at IST midnight", () => {
    const now = new Date("2026-09-25T17:00:00Z"); // 22:30 IST
    expect(presetRange("7d", now)).toEqual({ from: "2026-09-18T17:00:00.000Z", to: now.toISOString() });
    expect(presetRange("today", now).from).toBe("2026-09-24T18:30:00.000Z");
  });

  it("drops empty query values", () => {
    expect(heatQuery({ metric: "unmet", kind: undefined, hourFrom: 0, hourTo: 23 })).toBe("metric=unmet&hourFrom=0&hourTo=23");
  });
});

describe("toResolution", () => {
  it("expands coarse cells to children and collapses fine ones", () => {
    const r7 = cellAt(11.0183, 76.9725, 7);
    const r9 = cellAt(11.0183, 76.9725, 9);
    expect(toResolution([r7], 8)).toHaveLength(7);
    expect(toResolution([r9], 8)).toHaveLength(1);
    expect(toResolution([r7, r7], 7)).toEqual([r7]);
  });
});

describe("travel speeds", () => {
  it("compares rush hours with the rest of the day (time-weighted)", async () => {
    const { peakVsOffPeak } = await import("@/lib/speeds");
    const r = peakVsOffPeak([
      { hour: 9, speed: 12, trips: 10 },
      { hour: 18, speed: 12, trips: 10 },
      { hour: 13, speed: 20, trips: 5 },
      { hour: 14, speed: 30, trips: 5 },
    ]);
    expect(r.peak).toBeCloseTo(12);
    expect(r.offPeak).toBeCloseTo(24); // 10 trips / (5/20 + 5/30)
    expect(r.slowdownPct).toBeCloseTo(50);
  });

  it("compares a pair with the hourly average", async () => {
    const { vsHourAvg } = await import("@/lib/speeds");
    expect(vsHourAvg(9, 8, [{ hour: 8, speed: 12 }])).toBeCloseTo(-25);
    expect(vsHourAvg(9, 3, [{ hour: 8, speed: 12 }])).toBeNull();
  });
});
