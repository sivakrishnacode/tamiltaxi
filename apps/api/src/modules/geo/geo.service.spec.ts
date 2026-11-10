import type { PrismaService } from '../../core/prisma/prisma.service.js';
import type { SettingsService } from '../settings/settings.service.js';
import type { DemandService } from './demand.service.js';
import { GeoService } from './geo.service.js';
import { cellAt, cellsForCircle } from './h3.util.js';

const POINT = { lat: 11.0183, lng: 76.9725 };

/** [GeoService] over these City rows (only the fields locate reads). */
function geo(rows: { id: string; isActive: boolean; serviceCells: string[]; centerLat?: number; centerLng?: number }[]): GeoService {
  const prisma = {
    city: {
      findMany: async () => rows.filter((r) => r.isActive).map((r) => ({ ...r, h3Resolution: 8, zones: [], fareRules: [], modePricing: null })),
      count: async () => rows.length,
    },
  } as unknown as PrismaService;
  const settings = { all: async () => ({ currentMultiplier: 1, maxMultiplier: 1.5 }) } as unknown as SettingsService;
  const demand = { surgeAt: async () => 1 } as unknown as DemandService;
  return new GeoService(prisma, settings, demand);
}

describe('GeoService.locate', () => {
  const cell = cellAt(POINT.lat, POINT.lng, 8);

  it('serves everywhere only while there is no City row at all (a fresh install)', async () => {
    expect((await geo([]).locate(POINT)).isServiceable).toBe(true);
  });

  it('serves nothing when cities exist but none is active', async () => {
    expect(await geo([{ id: 'c1', isActive: false, serviceCells: [cell] }]).locate(POINT)).toMatchObject({ cityId: null, isServiceable: false });
  });

  it("serves an active city's cells only", async () => {
    const g = geo([{ id: 'c1', isActive: true, serviceCells: [cell] }, { id: 'c2', isActive: false, serviceCells: [] }]);
    expect(await g.locate(POINT)).toMatchObject({ cityId: 'c1', cell, isServiceable: true });
    expect((await g.locate({ lat: 13.08, lng: 80.27 })).isServiceable).toBe(false);
  });
});

describe('GeoService.serviceBounds (place search)', () => {
  const coimbatore = { lat: 11.0168, lng: 76.9558 };
  const chennai = { lat: 13.0827, lng: 80.2707 };
  const city = (id: string, c: { lat: number; lng: number }) => ({
    id,
    isActive: true,
    centerLat: c.lat,
    centerLng: c.lng,
    serviceCells: cellsForCircle({ ...c, radiusKm: 15, resolution: 8 }),
  });
  const g = geo([city('coimbatore', coimbatore), city('chennai', chennai)]);

  it("keeps a search to the city the point is in, not a box over the towns between", async () => {
    const cbe = (await g.serviceBounds(coimbatore))!;
    expect(cbe.high.lat).toBeLessThan(11.2);
    expect(cbe.high.lng).toBeLessThan(77.2);
    const mas = (await g.serviceBounds(chennai))!;
    expect(mas.low.lat).toBeGreaterThan(12.8);
    expect(mas.low.lng).toBeGreaterThan(80);
  });

  it('outside every city: the nearest one; no point at all: every city', async () => {
    // Salem: ~160 km from Coimbatore, ~280 km from Chennai.
    expect(await g.serviceBounds({ lat: 11.6643, lng: 78.146 })).toEqual(await g.serviceBounds(coimbatore));
    const all = (await g.serviceBounds())!;
    expect(all.low.lat).toBeLessThan(11);
    expect(all.high.lat).toBeGreaterThan(13.2);
  });
});
