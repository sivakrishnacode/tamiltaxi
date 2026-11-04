import { cellToChildren, gridDisk, latLngToCell } from 'h3-js';

import type { Zone } from '../../generated/prisma/client.js';
import { areaName, cityOf, type DriverMapData, forCity, mapZone } from './driver-map.service.js';

/** The city and state names a test city has in the database. */
const CITY = new Set(['coimbatore', 'tamil nadu']);

describe('areaName', () => {
  it('takes the locality from a full Google address', () => {
    expect(areaName('12, Cross Cut Rd, Gandhipuram, Coimbatore, Tamil Nadu 641012, India', CITY)).toBe('Gandhipuram');
    expect(areaName('Avinashi Rd, Peelamedu, Tamil Nadu 641004, India', CITY)).toBe('Peelamedu');
  });

  it('drops plus codes, door numbers and the city', () => {
    expect(areaName('8Q7X+2R Ondipudur, Coimbatore, Tamil Nadu', CITY)).toBe('Ondipudur');
    expect(areaName('42, Coimbatore', CITY)).toBeNull();
  });

  it('keeps a single place name as is', () => {
    expect(areaName('Ukkadam Bus Stand', CITY)).toBe('Ukkadam Bus Stand');
    expect(areaName('', CITY)).toBeNull();
    expect(areaName(null, CITY)).toBeNull();
  });
});

describe('mapZone', () => {
  const cells = gridDisk(latLngToCell(11.0168, 76.9558, 8), 1);
  const zone = (over: Partial<Zone>): Zone => ({
    id: 'z1',
    cityId: 'c1',
    name: 'Gandhipuram',
    kind: 'SURGE',
    cells,
    surgeMultiplier: 1.3,
    color: '#F4511E',
    isActive: true,
    days: [],
    startMinute: null,
    endMinute: null,
    startsAt: null,
    endsAt: null,
    vehicleKinds: ['AUTO'],
    blockPickups: true,
    blockDrops: true,
    nudgeDrivers: false,
    meetingPoint: 'Gate 2',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  });

  it('outlines the cells as one piece with its label point on the middle cell', () => {
    const m = mapZone(zone({ startMinute: 1080, endMinute: 1320, days: [5, 6], endsAt: new Date('2026-11-05T00:00:00Z') }));
    expect(m).toMatchObject({ cityId: 'c1', kind: 'SURGE', multiplier: 1.3, vehicleKinds: ['AUTO'], blocksPickups: false, startMinute: 1080, endMinute: 1320, days: [5, 6], endsAt: '2026-11-05T00:00:00.000Z' });
    expect(m.outline).toHaveLength(1);
    expect(m.outline[0].length).toBeGreaterThan(6);
    const [lat, lng] = m.centre;
    expect(latLngToCell(lat, lng, 8)).toBe(cells[0]);
    expect(m).not.toHaveProperty('meetingPoint');
  });

  it('keeps only what each kind uses', () => {
    expect(mapZone(zone({ kind: 'NO_SERVICE', blockDrops: false }))).toMatchObject({ multiplier: 1, vehicleKinds: [], blocksPickups: true, blocksDrops: false });
    expect(mapZone(zone({ kind: 'PICKUP_POINT' })).meetingPoint).toBe('Gate 2');
    expect(mapZone(zone({ kind: 'DEMAND', startMinute: 600, endMinute: 600 }))).not.toHaveProperty('startMinute');
  });
});

describe('one city per driver', () => {
  // Coimbatore at res 8, Tiruppur at res 9 (cities may differ).
  const cbeHex = latLngToCell(11.0168, 76.9558, 7);
  const tupHex = latLngToCell(11.1085, 77.3411, 7);
  const areas = [
    { cityId: 'cbe', cells: cellToChildren(cbeHex, 8), rings: [[[11, 76.9]] as [number, number][]] },
    { cityId: 'tup', cells: cellToChildren(tupHex, 9), rings: [[[11.1, 77.3]] as [number, number][]] },
  ];

  it('places a hotspot in the city that holds it, whatever the resolution', () => {
    expect(cityOf(cbeHex, areas)).toBe('cbe');
    expect(cityOf(tupHex, areas)).toBe('tup');
    expect(cityOf(latLngToCell(13.08, 80.27, 7), areas)).toBeUndefined();
  });

  it("keeps only the driver's city, or everything without one", () => {
    const data = {
      at: 'now',
      hotspots: [{ cell: cbeHex, cityId: 'cbe' }, { cell: tupHex, cityId: 'tup' }],
      zones: [{ id: 'z1', cityId: 'cbe' }, { id: 'z2', cityId: 'tup' }],
      areas,
    } as unknown as DriverMapData;
    const cbe = forCity(data, 'cbe');
    expect(cbe.hotspots.map((h) => h.cell)).toEqual([cbeHex]);
    expect(cbe.zones.map((z) => z.id)).toEqual(['z1']);
    expect(cbe.serviceArea).toEqual(areas[0].rings);
    const all = forCity(data, undefined);
    expect([all.hotspots.length, all.zones.length, all.serviceArea.length]).toEqual([2, 2, 2]);
  });
});
