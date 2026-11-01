import { TripKind, VehicleKind } from '../../generated/prisma/enums.js';
import type { GeoService } from '../geo/geo.service.js';
import type { MapsService } from '../maps/maps.service.js';
import { SETTING_DEFAULTS } from '../settings/settings.defaults.js';
import type { SettingsService } from '../settings/settings.service.js';
import { FaresService } from './fares.service.js';

const pickup = { lat: 10.98085, lng: 77.04175 };
const drop = { lat: 10.98833, lng: 76.96269 };

function service(): { fares: FaresService; estimate: ReturnType<typeof vi.fn> } {
  // The car and two-wheeler routes differ, as Google's often do.
  const estimate = vi.fn(async (p: { vehicleKind?: VehicleKind }) =>
    p.vehicleKind === VehicleKind.BIKE ? { distanceKm: 16.5, durationMin: 55 } : { distanceKm: 11.4, durationMin: 38 },
  );
  const geo = { locate: vi.fn(async () => ({ cityId: null, multiplier: 1, vehicleMultipliers: {} })), fareRule: vi.fn(async () => null) } as unknown as GeoService;
  const settings = { all: vi.fn(async () => SETTING_DEFAULTS) } as unknown as SettingsService;
  const fares = new FaresService({ estimate } as unknown as MapsService, geo, {} as never, {} as never, settings, {} as never);
  return { fares, estimate };
}

describe('FaresService', () => {
  it('books a bike at the fare P-10 showed: both priced on the one car route', async () => {
    const { fares, estimate } = service();
    const shown = (await fares.quoteAll({ pickup, drop, kind: TripKind.RIDE })).find((q) => q.vehicleKind === VehicleKind.BIKE);
    const booked = await fares.quoteOne({ pickup, drop, vehicleKind: VehicleKind.BIKE });
    expect(booked.total).toBe(shown?.total);
    expect(booked.distanceKm).toBe(11.4);
    expect(estimate.mock.calls.map((c) => (c[0] as { vehicleKind: VehicleKind }).vehicleKind)).toEqual([VehicleKind.CAB, VehicleKind.CAB]);
  });

  it("passes Google's travel minutes through for display, the time charge stays on the fare minutes", async () => {
    const { fares, estimate } = service();
    estimate.mockResolvedValue({ distanceKm: 11.4, durationMin: 38, travelMin: 24 });
    const bike = (await fares.quoteAll({ pickup, drop, kind: TripKind.RIDE })).find((q) => q.vehicleKind === VehicleKind.BIKE);
    expect(bike).toMatchObject({ durationMin: 38, travelMin: 24 });
    const withoutTraffic = await fares.quoteOnRoute({ pickup, route: { distanceKm: 11.4, durationMin: 38 }, vehicleKind: VehicleKind.BIKE });
    expect(bike?.timeCharge).toBe(withoutTraffic.timeCharge);
    expect(bike?.total).toBe(withoutTraffic.total);
  });

  it('lists every ride tier in order: Bike, Scooty, Auto, Auto Priority, Mini, Sedan, SUV', async () => {
    const { fares } = service();
    const quotes = await fares.quoteAll({ pickup, drop, kind: TripKind.RIDE });
    expect(quotes.map((q) => q.vehicleKind)).toEqual([
      VehicleKind.BIKE,
      VehicleKind.SCOOTY,
      VehicleKind.AUTO,
      VehicleKind.AUTO_PRIORITY,
      VehicleKind.CAB,
      VehicleKind.SEDAN,
      VehicleKind.SUV,
    ]);
    const total = Object.fromEntries(quotes.map((q) => [q.vehicleKind, q.total]));
    expect(total[VehicleKind.AUTO_PRIORITY]).toBeGreaterThan(total[VehicleKind.AUTO]);
    expect(total[VehicleKind.SEDAN]).toBeGreaterThan(total[VehicleKind.CAB]);
    expect(total[VehicleKind.SUV]).toBeGreaterThan(total[VehicleKind.SEDAN]);
  });

  it('prices goods on the three-wheeler route, booked or listed', async () => {
    const { fares, estimate } = service();
    await fares.quoteAll({ pickup, drop, kind: TripKind.PARCEL });
    await fares.quoteOne({ pickup, drop, vehicleKind: VehicleKind.GOODS_BIKE });
    expect(estimate.mock.calls.map((c) => (c[0] as { vehicleKind: VehicleKind }).vehicleKind)).toEqual([VehicleKind.THREE_WHEELER, VehicleKind.THREE_WHEELER]);
  });

  it("measures every vehicle's nearest drivers with one ETA lookup", async () => {
    const { fares } = service();
    const three: VehicleKind[] = [VehicleKind.BIKE, VehicleKind.AUTO, VehicleKind.CAB];
    const quotes = (await fares.quoteAll({ pickup, drop, kind: TripKind.RIDE })).filter((q) => three.includes(q.vehicleKind));
    const nearby = vi.fn(async (p: { kind: VehicleKind }) =>
      p.kind === VehicleKind.CAB ? [] : [{ driverId: `${p.kind}-1`, lat: 11.0, lng: 77.0, distanceKm: 2 }, { driverId: `${p.kind}-2`, lat: 10.99, lng: 77.02, distanceKm: 1 }],
    );
    const minutesMany = vi.fn(async (p: { froms: unknown[] }) => p.froms.map((_, i) => 10 + i));
    const withEta = new FaresService(
      {} as never,
      {} as never,
      { nearby } as never,
      { minutesMany } as never,
      { all: vi.fn(async () => SETTING_DEFAULTS) } as unknown as SettingsService,
      {} as never,
    );
    const out = await withEta.withPickupEta(quotes, pickup, { womenOnly: false });
    expect(minutesMany).toHaveBeenCalledTimes(1);
    expect((minutesMany.mock.calls[0][0] as { froms: unknown[] }).froms).toHaveLength(4);
    const byKind = Object.fromEntries(out.map((q) => [q.vehicleKind, q.pickupEtaMin]));
    // Bike's drivers are origins 0-1, auto's 2-3 (nearest first); nobody near for a cab.
    expect(byKind).toEqual({ [VehicleKind.BIKE]: 10, [VehicleKind.AUTO]: 12, [VehicleKind.CAB]: null });
  });
});
