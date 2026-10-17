import type { PrismaService } from '../../core/prisma/prisma.service.js';
import { VehicleKind } from '../../generated/prisma/enums.js';
import { readPrefs, serviceOn } from './booking-prefs.js';

/**
 * Which drivers can take a trip booked as a vehicle kind.
 * - Parcel on bike (like Rapido's "Parcel on Scooty"): bike and scooter drivers also carry goods-bike parcels, unless
 *   they turned it off or paused it (Services, booking-prefs.ts). A goods-bike driver never gets passengers.
 * - Parcel on Scooty (SCOOTY_PARCEL, up to 20 kg, like Porter's "Scooter"): scooter drivers with parcels on; bikes and
 *   goods bikes don't take it (the load rides on the footboard).
 * - Parcel on Auto (AUTO_PARCEL, up to 100 kg inside the auto): auto drivers who switched parcels on (off by default:
 *   it's their passenger seat) and goods 3-wheelers.
 * - Scooters (SCOOTY) also take Bike rides (a two-wheeler either way, at the Bike fare); bikes don't take Scooty rides.
 * - Auto Priority is a booking tier, not a vehicle: auto drivers serve it at its higher fare, and it is offered first.
 * Cab tiers (Mini, Sedan, SUV) are served only by their own vehicles.
 */

/** Two-wheelers that can carry goods-bike parcels too. */
export const PARCEL_TWO_WHEELERS: readonly VehicleKind[] = [VehicleKind.BIKE, VehicleKind.SCOOTY];

/** Passenger vehicles that can take parcels too (Services › Parcels): the two-wheelers and autos. */
export const PARCEL_RIDE_VEHICLES: readonly VehicleKind[] = [...PARCEL_TWO_WHEELERS, VehicleKind.AUTO];

/** Booking tiers: served by other vehicles, never a driver's own. */
const BOOKING_TIERS: readonly VehicleKind[] = [VehicleKind.AUTO_PRIORITY, VehicleKind.SCOOTY_PARCEL, VehicleKind.AUTO_PARCEL];

/** Vehicle kinds a driver can register with (every kind except booking tiers). */
export const DRIVER_VEHICLE_KINDS: readonly VehicleKind[] = Object.values(VehicleKind).filter((k) => !BOOKING_TIERS.includes(k));

/** The driver vehicles that can take a trip booked as [kind]: its own drivers first, then the others listed above. */
export function driverKindsFor(kind: VehicleKind): VehicleKind[] {
  switch (kind) {
    case VehicleKind.GOODS_BIKE:
      return [VehicleKind.GOODS_BIKE, ...PARCEL_TWO_WHEELERS];
    case VehicleKind.SCOOTY_PARCEL:
      return [VehicleKind.SCOOTY_PARCEL, VehicleKind.SCOOTY];
    case VehicleKind.AUTO_PARCEL:
      return [VehicleKind.AUTO_PARCEL, VehicleKind.AUTO, VehicleKind.THREE_WHEELER];
    case VehicleKind.BIKE:
      return [VehicleKind.BIKE, VehicleKind.SCOOTY];
    case VehicleKind.AUTO_PRIORITY:
      return [VehicleKind.AUTO];
    default:
      return [kind];
  }
}

/**
 * The vehicle a [driverKind] driver takes a trip booked as [booked] as, with the [also] vehicles the rider added ("Book
 * any"): the booked one when they serve it, else their own vehicle, else the first added one they serve (a bike on a
 * parcel is a goods bike; a scooter a goods bike or Parcel on Scooty; an auto Parcel on Auto).
 */
export function servedAs(driverKind: VehicleKind, booked: VehicleKind, also: readonly VehicleKind[]): VehicleKind {
  if (driverKindsFor(booked).includes(driverKind)) return booked;
  if (also.includes(driverKind)) return driverKind;
  return also.find((k) => driverKindsFor(k).includes(driverKind)) ?? booked;
}

/** Trips offered first in a batch (Auto Priority). */
export function isPriority(kind: VehicleKind): boolean {
  return kind === VehicleKind.AUTO_PRIORITY;
}

/**
 * The ids among [drivers] (passenger vehicles offered a parcel) who don't take parcels now: switched off, paused, or
 * an auto driver who never switched them on.
 */
export async function noParcelsAmong(
  prisma: PrismaService,
  drivers: readonly { driverId: string; kind: VehicleKind }[],
  now: Date,
): Promise<Set<string>> {
  if (drivers.length === 0) return new Set();
  const rows = await prisma.driver.findMany({
    where: { id: { in: [...new Set(drivers.map((d) => d.driverId))] } },
    select: { id: true, bookingPrefs: true },
  });
  const prefs = new Map(rows.map((r) => [r.id, readPrefs(r.bookingPrefs, now)]));
  return new Set(drivers.filter((d) => !serviceOn(prefs.get(d.driverId), 'parcels', d.kind)).map((d) => d.driverId));
}
