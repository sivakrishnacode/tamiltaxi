import { cellToBoundary, cellToParent, getResolution, gridDisk, isValidCell, latLngToCell } from 'h3-js';

/** Recommended resolution: 8 ≈ 0.74 km² per hexagon (~460 m edge). */
export const DEFAULT_H3_RESOLUTION = 8;

/** Cells covering a circle (used to bootstrap a new city's service area). */
export function cellsForCircle(params: { lat: number; lng: number; radiusKm: number; resolution: number }): string[] {
  const centre = latLngToCell(params.lat, params.lng, params.resolution);
  // Centre-to-centre spacing ≈ √3 × edge; average edge length by resolution (km).
  const edgeKm = [1281.256, 483.057, 182.513, 68.979, 26.072, 9.854, 3.725, 1.406, 0.531, 0.201, 0.076, 0.029][params.resolution] ?? 0.531;
  const k = Math.max(0, Math.ceil(params.radiusKm / (edgeKm * Math.sqrt(3))));
  return gridDisk(centre, k);
}

/** Keeps only valid cells at [resolution]; returns the rejected ones too. */
export function validateCells(cells: readonly string[], resolution: number): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const c of new Set(cells)) {
    if (isValidCell(c) && getResolution(c) === resolution) valid.push(c);
    else invalid.push(c);
  }
  return { valid, invalid };
}

/** Cell containing a point. */
export function cellAt(lat: number, lng: number, resolution: number): string {
  return latLngToCell(lat, lng, resolution);
}

/**
 * Finest hexes a zone may use: res 10 (≈ 150 m across: a gate, a bus stand). A zone's cells share one resolution, the
 * city's or finer, so it can leave out streets the city's hexes would take in.
 */
export const MAX_ZONE_RESOLUTION = 10;

const zoneSets = new WeakMap<readonly string[], { res: number; cells: Set<string> }>();

/** Whether a zone with [cells] holds [point], tested at the zone's own resolution. */
export function zoneHolds(cells: readonly string[], point: { lat: number; lng: number }): boolean {
  if (!cells.length) return false;
  let entry = zoneSets.get(cells);
  if (!entry) {
    entry = { res: getResolution(cells[0]), cells: new Set(cells) };
    zoneSets.set(cells, entry);
  }
  return entry.cells.has(latLngToCell(point.lat, point.lng, entry.res));
}

/** [cells] at [resolution] or coarser: finer ones become their parents (deduplicated), coarser ones stay. */
export function atMostResolution(cells: readonly string[], resolution: number): string[] {
  return [...new Set(cells.map((c) => (getResolution(c) > resolution ? cellToParent(c, resolution) : c)))];
}

/** A lat/lng rectangle (south-west [low], north-east [high]), as Places `locationRestriction.rectangle` takes it. */
export interface LatLngBounds {
  readonly low: { readonly lat: number; readonly lng: number };
  readonly high: { readonly lat: number; readonly lng: number };
}

/** The rectangle around every corner of [cells], widened by [marginDeg] (0.01° ≈ 1.1 km); null for no cells. */
export function cellsBounds(cells: Iterable<string>, marginDeg = 0.01): LatLngBounds | null {
  let [s, w, n, e] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const c of cells) {
    for (const [lat, lng] of cellToBoundary(c)) {
      s = Math.min(s, lat);
      n = Math.max(n, lat);
      w = Math.min(w, lng);
      e = Math.max(e, lng);
    }
  }
  if (s === Infinity) return null;
  return { low: { lat: s - marginDeg, lng: w - marginDeg }, high: { lat: n + marginDeg, lng: e + marginDeg } };
}

/** Hexagon corners as [lat, lng] pairs. */
export function cellPolygon(cell: string): [number, number][] {
  return cellToBoundary(cell);
}
