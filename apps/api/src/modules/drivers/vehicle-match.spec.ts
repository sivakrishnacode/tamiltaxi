import { VehicleKind } from '../../generated/prisma/enums.js';
import { DRIVER_VEHICLE_KINDS, driverKindsFor, isPriority, servedAs } from './vehicle-match.js';

describe('vehicle match', () => {
  it('bike and scooter drivers are searched for goods-bike parcels, never the other way round', () => {
    expect(driverKindsFor(VehicleKind.GOODS_BIKE)).toEqual([VehicleKind.GOODS_BIKE, VehicleKind.BIKE, VehicleKind.SCOOTY]);
    expect(driverKindsFor(VehicleKind.THREE_WHEELER)).toEqual([VehicleKind.THREE_WHEELER]);
  });

  it('scooters take Bike rides; bikes do not take Scooty rides', () => {
    expect(driverKindsFor(VehicleKind.BIKE)).toEqual([VehicleKind.BIKE, VehicleKind.SCOOTY]);
    expect(driverKindsFor(VehicleKind.SCOOTY)).toEqual([VehicleKind.SCOOTY]);
  });

  it('Auto Priority is served by autos and offered first; cab tiers only by their own cars', () => {
    expect(driverKindsFor(VehicleKind.AUTO_PRIORITY)).toEqual([VehicleKind.AUTO]);
    expect(isPriority(VehicleKind.AUTO_PRIORITY)).toBe(true);
    expect(isPriority(VehicleKind.AUTO)).toBe(false);
    expect(driverKindsFor(VehicleKind.CAB)).toEqual([VehicleKind.CAB]);
    expect(driverKindsFor(VehicleKind.SEDAN)).toEqual([VehicleKind.SEDAN]);
    expect(driverKindsFor(VehicleKind.SUV)).toEqual([VehicleKind.SUV]);
  });

  it('a driver takes the booked vehicle when they serve it, else an added one they serve', () => {
    const { AUTO, AUTO_PARCEL, BIKE, GOODS_BIKE, SCOOTY, SCOOTY_PARCEL, THREE_WHEELER } = VehicleKind;
    expect(servedAs(SCOOTY, GOODS_BIKE, [SCOOTY_PARCEL])).toBe(GOODS_BIKE);
    expect(servedAs(BIKE, SCOOTY_PARCEL, [GOODS_BIKE])).toBe(GOODS_BIKE);
    expect(servedAs(SCOOTY, AUTO_PARCEL, [SCOOTY_PARCEL])).toBe(SCOOTY_PARCEL);
    expect(servedAs(SCOOTY, AUTO, [BIKE])).toBe(BIKE);
    // Its own vehicle before a tier it also serves.
    expect(servedAs(THREE_WHEELER, GOODS_BIKE, [AUTO_PARCEL, THREE_WHEELER])).toBe(THREE_WHEELER);
    expect(servedAs(AUTO, GOODS_BIKE, [THREE_WHEELER])).toBe(GOODS_BIKE);
  });

  it('Auto Priority is not a vehicle a driver registers with', () => {
    expect(DRIVER_VEHICLE_KINDS).not.toContain(VehicleKind.AUTO_PRIORITY);
    expect(DRIVER_VEHICLE_KINDS).toContain(VehicleKind.SCOOTY);
    expect(DRIVER_VEHICLE_KINDS).toContain(VehicleKind.SUV);
  });

  it('Parcel on Auto goes to autos and goods 3-wheelers; an auto takes an added one as Parcel on Auto', () => {
    expect(driverKindsFor(VehicleKind.AUTO_PARCEL)).toEqual([VehicleKind.AUTO_PARCEL, VehicleKind.AUTO, VehicleKind.THREE_WHEELER]);
    expect(servedAs(VehicleKind.AUTO, VehicleKind.GOODS_BIKE, [VehicleKind.AUTO_PARCEL])).toBe(VehicleKind.AUTO_PARCEL);
    expect(DRIVER_VEHICLE_KINDS).not.toContain(VehicleKind.AUTO_PARCEL);
  });

  it('Parcel on Scooty goes to scooters only, and is not a vehicle a driver registers with', () => {
    expect(driverKindsFor(VehicleKind.SCOOTY_PARCEL)).toEqual([VehicleKind.SCOOTY_PARCEL, VehicleKind.SCOOTY]);
    expect(DRIVER_VEHICLE_KINDS).not.toContain(VehicleKind.SCOOTY_PARCEL);
  });
});
