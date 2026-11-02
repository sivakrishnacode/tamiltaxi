import { describe, expect, it } from "vitest";

import { applyCells, cellAt, cellsOutline, circleCells, historyInit, historyPush, historyRedo, historyUndo, viewportCells } from "@/lib/hex";
import { cellsToKm2, previewFare, validateSettings } from "@/lib/validation";

describe("fare preview (same maths as the API fare engine)", () => {
  const bike = { base: 12, perKm: 5, perMin: 0.15, minFare: 25 };

  it("matches the seeded Gandhipuram → Brookefields bike trip (₹38)", () => {
    expect(previewFare(bike, 4.2, 14, 1.1)).toEqual({
      base: 12,
      distanceCharge: 21,
      timeCharge: 2,
      minFareTopUp: 0,
      subtotal: 35,
      multiplier: 1.1,
      peakCharge: 3,
      total: 38,
    });
  });

  it("surges the ride before the minimum-fare top-up and caps the multiplier at 1.5", () => {
    const q = previewFare(bike, 0.5, 1, 3);
    expect(q.multiplier).toBe(1.5);
    expect(q.peakCharge).toBe(21 - 14); // (12 + 2 + 0) × 1.5 = 21
    expect(q.minFareTopUp).toBe(25 - 21);
    expect(q.subtotal).toBe(14 + 4);
    expect(q.total).toBe(25);
  });

  it("respects a lower maxMultiplier", () => {
    expect(previewFare(bike, 4.2, 14, 1.4, 1.2).multiplier).toBe(1.2);
  });
});

describe("h3 helpers", () => {
  it("fills a circle and paints/erases cells", () => {
    const centre = cellAt(11.0183, 76.9725, 8);
    const disk = circleCells(11.0183, 76.9725, 0.5, 8);
    expect(disk).toContain(centre);
    expect(disk.length).toBe(7); // 0.5 km at res 8 → k = 1 ring
    expect(applyCells(disk, [centre], "remove")).toHaveLength(6);
    expect(applyCells([centre], [centre], "add")).toEqual([centre]);
  });

  it("refuses to enumerate huge viewports", () => {
    expect(viewportCells({ south: 8, west: 74, north: 14, east: 80 }, 8)).toBeNull();
    const small = viewportCells({ south: 11.0, west: 76.95, north: 11.03, east: 76.99 }, 8);
    expect(small && small.length).toBeGreaterThan(5);
  });

  it("undoes and redoes cell edits", () => {
    let h = historyInit(["a"]);
    h = historyPush(h, ["a", "b"]);
    h = historyPush(h, ["a", "b"]); // no-op
    expect(h.past).toHaveLength(1);
    h = historyUndo(h);
    expect(h.present).toEqual(["a"]);
    h = historyRedo(h);
    expect(h.present).toEqual(["a", "b"]);
  });

  it("outlines a cell set as one shape per connected group, with holes", () => {
    const ring = circleCells(11.0183, 76.9725, 1.5, 8);
    expect(cellsOutline(ring)).toHaveLength(1);
    expect(cellsOutline([...ring, ...ring])).toHaveLength(1);
    const centre = cellAt(11.0183, 76.9725, 8);
    expect(cellsOutline(ring.filter((c) => c !== centre))[0]).toHaveLength(2); // outer edge + the hole
    expect(cellsOutline([centre, cellAt(11.2, 77.2, 8)])).toHaveLength(2);
    expect(cellsOutline([])).toEqual([]);
  });

  it("converts cells to km²", () => {
    expect(Math.round(cellsToKm2(1519, 8))).toBe(1120);
  });
});

describe("settings validation", () => {
  const ok = { currentMultiplier: 1.1, maxMultiplier: 1.5, searchRadiusKm: 5, maxSearchRadiusKm: 15, searchExpandSeconds: 45, offerSeconds: 15, maxCandidates: 5, trialDays: 30, graceDays: 2, batchWindowMs: 2000, useRoadEta: true, supportPhone: "+91 422 000 0000" };

  it("accepts the API defaults", () => {
    expect(validateSettings(ok)).toEqual({});
  });

  it("flags out-of-range values", () => {
    const e = validateSettings({ ...ok, currentMultiplier: 1.6, offerSeconds: 2.5, supportPhone: "x" });
    expect(Object.keys(e).sort()).toEqual(["currentMultiplier", "offerSeconds", "supportPhone"]);
    expect(validateSettings({ ...ok, currentMultiplier: 1.4, maxMultiplier: 1.2 }).currentMultiplier).toMatch(/exceed/);
    expect(validateSettings({ ...ok, searchRadiusKm: 8, maxSearchRadiusKm: 5 }).maxSearchRadiusKm).toMatch(/below/);
  });

  it("validates only the keys sent, including new surge keys and unknown numbers", () => {
    expect(validateSettings({ surgeSensitivity: 0.1 })).toEqual({});
    expect(Object.keys(validateSettings({ surgeSensitivity: 2, demandWindowMin: 0.5, dynamicSurgeEnabled: "yes", futureKnob: Number.NaN }))).toEqual([
      "surgeSensitivity",
      "demandWindowMin",
      "dynamicSurgeEnabled",
      "futureKnob",
    ]);
  });

  it("takes the daily selfie check as a switch only", () => {
    expect(validateSettings({ dailySelfieCheckEnabled: false })).toEqual({});
    expect(Object.keys(validateSettings({ dailySelfieCheckEnabled: "off" }))).toEqual(["dailySelfieCheckEnabled"]);
  });

  it("surge example matches the API formula (ratio 3 → 1.2×)", async () => {
    const { surgeExample } = await import("@/lib/validation");
    expect(surgeExample(3, 0.1, 1.5)).toBe(1.2);
    expect(surgeExample(12, 0.1, 1.5)).toBe(1.5);
    expect(surgeExample(1, 0.1, 1.5)).toBe(1);
    expect(surgeExample(4, 0.05, 1.5)).toBe(1.15);
  });
});

describe("editor brush and polygon helpers", () => {
  it("brush sizes are 1, 7, 19 and 37 hexagons", async () => {
    const { BRUSH_SIZES, brushCells } = await import("@/lib/hex");
    const c = cellAt(11.0183, 76.9725, 8);
    expect(BRUSH_SIZES.map((b) => brushCells(c, b.k).length)).toEqual([1, 7, 19, 37]);
  });

  it("fills a drawn polygon and never returns nothing for a tiny one", async () => {
    const { polygonCells, cellsBounds } = await import("@/lib/hex");
    // ~2 km square around Gandhipuram.
    const square: [number, number][] = [
      [11.01, 76.96],
      [11.01, 76.98],
      [11.03, 76.98],
      [11.03, 76.96],
    ];
    const cells = polygonCells(square, 8);
    expect(cells.length).toBeGreaterThan(3);
    const b = cellsBounds(cells)!;
    expect(b.south).toBeGreaterThan(11.0);
    expect(b.north).toBeLessThan(11.04);
    const tiny: [number, number][] = [
      [11.0183, 76.9725],
      [11.01831, 76.97251],
      [11.01832, 76.9725],
    ];
    expect(polygonCells(tiny, 8)).toEqual([cellAt(11.0183, 76.9725, 8)]);
    expect(polygonCells(square.slice(0, 2), 8)).toEqual([]);
  });
});
