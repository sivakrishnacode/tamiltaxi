import { cellToChildren } from 'h3-js';

import { atMostResolution, cellAt, cellsBounds, cellsForCircle, validateCells, zoneHolds } from './h3.util.js';

describe('h3 utils', () => {
  it('covers an 18 km circle around Coimbatore at resolution 8', () => {
    const cells = cellsForCircle({ lat: 11.0168, lng: 76.9658, radiusKm: 18, resolution: 8 });
    expect(cells.length).toBeGreaterThan(1000);
    expect(cells).toContain(cellAt(11.0183, 76.9725, 8)); // Gandhipuram
  });

  it('rejects invalid or wrong-resolution cells', () => {
    const good = cellAt(11.0183, 76.9725, 8);
    const wrongRes = cellAt(11.0183, 76.9725, 9);
    expect(validateCells([good, good, wrongRes, 'nope'], 8)).toEqual({ valid: [good], invalid: [wrongRes, 'nope'] });
  });

  it('bounds a service area (+ ~1 km) for the place-search restriction', () => {
    const b = cellsBounds(cellsForCircle({ lat: 11.0168, lng: 76.9658, radiusKm: 18, resolution: 8 }));
    // ~18 km ≈ 0.16° of latitude each way, plus the margin.
    expect(b!.low.lat).toBeLessThan(11.0168 - 0.16);
    expect(b!.high.lat).toBeGreaterThan(11.0168 + 0.16);
    expect(b!.high.lng - b!.low.lng).toBeLessThan(0.45);
    expect(cellsBounds([])).toBeNull();
  });

  it('tests a zone at its own resolution: a fine zone holds only its small hexes', () => {
    const big = cellAt(11.0183, 76.9725, 8);
    const [first, ...rest] = cellToChildren(big, 10);
    const fine = [first];
    const [lat, lng] = [11.0183, 76.9725];
    expect(zoneHolds([big], { lat, lng })).toBe(true);
    const inFirst = cellAt(lat, lng, 10) === first;
    expect(zoneHolds(fine, { lat, lng })).toBe(inFirst);
    expect(rest.length).toBe(48);
    expect(zoneHolds([], { lat, lng })).toBe(false);
  });

  it('brings finer cells up to a resolution, once each', () => {
    const big = cellAt(11.0183, 76.9725, 8);
    expect(atMostResolution(cellToChildren(big, 9), 8)).toEqual([big]);
    expect(atMostResolution([big], 9)).toEqual([big]);
  });
});
