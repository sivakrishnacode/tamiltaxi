import { VehicleKind } from '../../generated/prisma/enums.js';
import { MARKER_ID_TTL_MS, markerId, NEARBY_MAX, nearbyVehicles, PARCEL_MAP_KINDS } from './nearby-vehicles.js';

const at = { lat: 11.0183, lng: 76.9725 };

function fakeLocation(perKind: Partial<Record<VehicleKind, number>>) {
  const nearby = vi.fn(async (p: { kind: VehicleKind; limit: number }) =>
    Array.from({ length: perKind[p.kind] ?? 0 }, (_, i) => ({
      driverId: `${p.kind}-${i}`,
      lat: at.lat + 0.0011 * (i + 1),
      lng: at.lng + 0.00073 * (i + 1),
      distanceKm: 0.1 * (i + 1),
      ring: i,
    })),
  );
  const lastFix = vi.fn(async (id: string) => ({ lat: 0, lng: 0, at: 0, heading: id.endsWith('-0') ? 47 : null }));
  return { nearby, lastFix };
}

describe('nearbyVehicles', () => {
  it('shows a mix of vehicles, nearest first, without driver ids, positions rounded and headings in 15° steps', async () => {
    const location = fakeLocation({ BIKE: 6, AUTO: 2, CAB: 1 });
    const out = await nearbyVehicles(location, at);
    // At most 4 of a kind, so one busy area of bikes doesn't hide the autos and cars.
    expect(out.filter((v) => v.kind === VehicleKind.BIKE)).toHaveLength(4);
    expect(out.map((v) => v.kind)).toContain(VehicleKind.AUTO);
    expect(out.map((v) => v.kind)).toContain(VehicleKind.CAB);
    expect(out[0]).not.toHaveProperty('driverId');
    for (const v of out) {
      expect(Math.abs(v.lat / 0.0005 - Math.round(v.lat / 0.0005))).toBeLessThan(1e-6);
      expect(v.heading === null || v.heading % 15 === 0).toBe(true);
    }
    expect(out.find((v) => v.heading !== null)?.heading).toBe(45);
  });

  it('caps the list and asks only for the kinds given (parcels: goods vehicles and two-wheelers)', async () => {
    const location = fakeLocation({ BIKE: 4, SCOOTY: 4, AUTO: 4, CAB: 4, SEDAN: 4, SUV: 4 });
    expect(await nearbyVehicles(location, at)).toHaveLength(NEARBY_MAX);
    location.nearby.mockClear();
    await nearbyVehicles(location, at, PARCEL_MAP_KINDS);
    expect(location.nearby.mock.calls.map((c) => c[0].kind)).toEqual([...PARCEL_MAP_KINDS]);
  });

  it("gives each car a marker id that stays for the hour, changes the next hour and isn't the driver's id", async () => {
    const location = fakeLocation({ BIKE: 2 });
    const hour = 20_000 * MARKER_ID_TTL_MS;
    const a = await nearbyVehicles(location, at, [VehicleKind.BIKE], { key: 'secret', now: hour + 1000 });
    const b = await nearbyVehicles(location, at, [VehicleKind.BIKE], { key: 'secret', now: hour + MARKER_ID_TTL_MS - 1 });
    const next = await nearbyVehicles(location, at, [VehicleKind.BIKE], { key: 'secret', now: hour + MARKER_ID_TTL_MS });
    expect(a.map((v) => v.id)).toEqual(b.map((v) => v.id));
    expect(new Set(a.map((v) => v.id)).size).toBe(2);
    expect(next.map((v) => v.id)).not.toEqual(a.map((v) => v.id));
    for (const v of a) expect(v.id).toMatch(/^[\w-]{12}$/);
    expect(a[0].id).not.toContain('BIKE');
    expect(markerId('BIKE-0', 'other key', hour)).not.toBe(markerId('BIKE-0', 'secret', hour));
  });
});
