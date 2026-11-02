import { cellsToMultiPolygon, cellToBoundary, cellToChildren, cellToLatLng, cellToParent, getResolution, gridDisk, isValidCell, latLngToCell, polygonToCells } from "h3-js";

/** Average hexagon edge length by H3 resolution (km), same table as apps/api/src/modules/geo/h3.util.ts. */
const EDGE_KM = [1281.256, 483.057, 182.513, 68.979, 26.072, 9.854, 3.725, 1.406, 0.531, 0.201, 0.076, 0.029];

export const MAX_VIEWPORT_CELLS = 5_000;

/** Hexagon corners as [lat, lng] pairs (Leaflet order). */
export function hexBoundary(cell: string): [number, number][] {
  return cellToBoundary(cell) as [number, number][];
}

/** The outer edges (and holes) of a set of cells as GeoJSON MultiPolygon coordinates ([lng, lat]). */
export function cellsOutline(cells: readonly string[]): number[][][][] {
  return cells.length ? cellsToMultiPolygon([...new Set(cells)], true) : [];
}

export function cellAt(lat: number, lng: number, resolution: number): string {
  return latLngToCell(lat, lng, resolution);
}

/** Cells covering a circle: the same k-ring maths the API uses to bootstrap a city. */
export function circleCells(lat: number, lng: number, radiusKm: number, resolution: number): string[] {
  const centre = latLngToCell(lat, lng, resolution);
  const edgeKm = EDGE_KM[resolution] ?? 0.531;
  const k = Math.max(0, Math.ceil(radiusKm / (edgeKm * Math.sqrt(3))));
  return gridDisk(centre, k);
}

/** Valid cells at [resolution]. */
export function isCellAt(cell: string, resolution: number): boolean {
  return isValidCell(cell) && getResolution(cell) === resolution;
}

/**
 * Cells inside a lat/lng box (the map viewport), or null when there would be too many to draw
 * (zoomed out too far). Estimated from the box area first so we never enumerate millions of cells.
 */
export function viewportCells(
  box: { south: number; west: number; north: number; east: number },
  resolution: number,
  max = MAX_VIEWPORT_CELLS,
): string[] | null {
  const kmPerDegLat = 111.32;
  const midLat = ((box.north + box.south) / 2) * (Math.PI / 180);
  const areaKm2 = (box.north - box.south) * kmPerDegLat * (box.east - box.west) * kmPerDegLat * Math.cos(midLat);
  const edge = EDGE_KM[resolution] ?? 0.531;
  const cellKm2 = ((3 * Math.sqrt(3)) / 2) * edge * edge;
  if (areaKm2 / cellKm2 > max) return null;
  const ring: [number, number][] = [
    [box.south, box.west],
    [box.south, box.east],
    [box.north, box.east],
    [box.north, box.west],
    [box.south, box.west],
  ];
  const cells = polygonToCells(ring, resolution);
  return cells.length > max ? null : cells;
}

/** Undo/redo history of cell sets (immutable snapshots). */
export interface CellHistory {
  readonly past: readonly string[][];
  readonly present: readonly string[];
  readonly future: readonly string[][];
}

export function historyInit(cells: readonly string[]): CellHistory {
  return { past: [], present: [...cells], future: [] };
}

/** Records a new state (no-op when nothing changed). Keeps the last 50 steps. */
export function historyPush(h: CellHistory, next: readonly string[]): CellHistory {
  if (next.length === h.present.length && next.every((c, i) => c === h.present[i])) return h;
  return { past: [...h.past, [...h.present]].slice(-50), present: [...next], future: [] };
}

export function historyUndo(h: CellHistory): CellHistory {
  if (h.past.length === 0) return h;
  const prev = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present: prev, future: [[...h.present], ...h.future] };
}

export function historyRedo(h: CellHistory): CellHistory {
  if (h.future.length === 0) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, [...h.present]], present: next, future: rest };
}

/** Adds or removes cells, returning a sorted, de-duplicated list (stable for diffing and saving). */
export function applyCells(current: readonly string[], cells: readonly string[], mode: "add" | "remove"): string[] {
  const set = new Set(current);
  for (const c of cells) {
    if (mode === "add") set.add(c);
    else set.delete(c);
  }
  return [...set].sort();
}

/** Brush sizes: k-rings of 0–3 → 1, 7, 19, 37 hexagons. */
export const BRUSH_SIZES = [
  { k: 0, cells: 1 },
  { k: 1, cells: 7 },
  { k: 2, cells: 19 },
  { k: 3, cells: 37 },
] as const;

/** Cells under a brush of ring size [k] centred on [cell]. */
export function brushCells(cell: string, k: number): string[] {
  return k <= 0 ? [cell] : gridDisk(cell, k);
}

/**
 * Cells whose centres fall inside a drawn polygon ([lat, lng] vertices). Very small polygons that contain no centre
 * still give the cells under their vertices, so a quick three-click shape is never a no-op.
 */
export function polygonCells(points: readonly [number, number][], resolution: number): string[] {
  if (points.length < 3) return [];
  const ring = [...points, points[0]].map(([lat, lng]) => [lat, lng]);
  const inside = polygonToCells(ring, resolution);
  if (inside.length > 0) return inside;
  return [...new Set(points.map(([lat, lng]) => latLngToCell(lat, lng, resolution)))];
}

/**
 * Bounding box of cell centres (null for an empty list). With [trim], the 2nd–98th percentiles are used once there
 * are enough cells, so one stray hexagon painted far away doesn't zoom the whole map out.
 */
export function cellsBounds(
  cells: readonly string[],
  opts: { trim?: boolean } = {},
): { south: number; west: number; north: number; east: number } | null {
  if (cells.length === 0) return null;
  const lats: number[] = [];
  const lngs: number[] = [];
  for (const c of cells) {
    const [lat, lng] = cellToLatLng(c);
    lats.push(lat);
    lngs.push(lng);
  }
  lats.sort((a, b) => a - b);
  lngs.sort((a, b) => a - b);
  const cut = opts.trim && cells.length >= 20 ? Math.floor(cells.length * 0.02) : 0;
  const hi = cells.length - 1 - cut;
  return { south: lats[cut], north: lats[hi], west: lngs[cut], east: lngs[hi] };
}

/** Largest group of touching cells (6-neighbour flood fill). */
export function largestCluster(cells: readonly string[]): string[] {
  const left = new Set(cells);
  let best: string[] = [];
  while (left.size > 0) {
    const start = left.values().next().value as string;
    left.delete(start);
    const group = [start];
    for (let i = 0; i < group.length; i++) {
      for (const n of gridDisk(group[i], 1)) {
        if (left.has(n)) {
          left.delete(n);
          group.push(n);
        }
      }
    }
    if (group.length > best.length) best = group;
  }
  return best;
}

/** Approximate area of a lat/lng polygon in km² (equirectangular shoelace; fine at city scale). */
export function polygonAreaKm2(points: readonly [number, number][]): number {
  if (points.length < 3) return 0;
  const lat0 = (points.reduce((a, p) => a + p[0], 0) / points.length) * (Math.PI / 180);
  const kx = 111.32 * Math.cos(lat0);
  const ky = 110.57;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [y1, x1] = points[i];
    const [y2, x2] = points[(i + 1) % points.length];
    sum += x1 * kx * (y2 * ky) - x2 * kx * (y1 * ky);
  }
  return Math.abs(sum) / 2;
}

/** Largest polygon fill we accept in one go (keeps the browser responsive). */
export const MAX_POLYGON_CELLS = 20_000;

/** Visual centre for a label: the centre of the zone's largest touching cluster. */
export function cellsCentre(cells: readonly string[]): { lat: number; lng: number } | null {
  if (cells.length === 0) return null;
  const main = largestCluster(cells);
  return averageCentre(main.length ? main : cells);
}

function averageCentre(cells: readonly string[]): { lat: number; lng: number } {
  let lat = 0;
  let lng = 0;
  for (const c of cells) {
    const [a, b] = cellToLatLng(c);
    lat += a;
    lng += b;
  }
  return { lat: lat / cells.length, lng: lng / cells.length };
}

/** Converts cells to [resolution]: coarser cells expand to their children, finer ones collapse to parents. */
export function toResolution(cells: readonly string[], resolution: number): string[] {
  const out = new Set<string>();
  for (const c of cells) {
    const r = getResolution(c);
    if (r === resolution) out.add(c);
    else if (r < resolution) for (const child of cellToChildren(c, resolution)) out.add(child);
    else out.add(cellToParent(c, resolution));
  }
  return [...out].sort();
}

/** Centre of a cell as {lat, lng}. */
export function cellCentre(cell: string): { lat: number; lng: number } {
  const [lat, lng] = cellToLatLng(cell);
  return { lat, lng };
}
