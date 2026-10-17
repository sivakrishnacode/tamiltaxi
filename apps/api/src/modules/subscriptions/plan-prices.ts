import type { PlanPeriod, VehicleKind } from '../../generated/prisma/enums.js';

/** Driver plan prices in rupees, GST-inclusive (paid plans are off while `driverPlansEnabled` is false). */
export const PLAN_PRICES: Readonly<Record<VehicleKind, Readonly<Record<PlanPeriod, number>>>> = {
  BIKE: { DAILY: 79, WEEKLY: 449, MONTHLY: 1499 },
  SCOOTY: { DAILY: 79, WEEKLY: 449, MONTHLY: 1499 },
  AUTO: { DAILY: 35, WEEKLY: 199, MONTHLY: 749 },
  // A booking tier, not a vehicle (auto drivers serve it); priced like AUTO so every kind has a plan row.
  AUTO_PRIORITY: { DAILY: 35, WEEKLY: 199, MONTHLY: 749 },
  // Parcel on Auto: also a booking tier, served by autos and goods 3-wheelers.
  AUTO_PARCEL: { DAILY: 35, WEEKLY: 199, MONTHLY: 749 },
  CAB: { DAILY: 49, WEEKLY: 279, MONTHLY: 999 },
  SEDAN: { DAILY: 59, WEEKLY: 329, MONTHLY: 1199 },
  SUV: { DAILY: 79, WEEKLY: 449, MONTHLY: 1499 },
  GOODS_BIKE: { DAILY: 79, WEEKLY: 449, MONTHLY: 1499 },
  // Parcel on Scooty: a booking tier, served by scooters.
  SCOOTY_PARCEL: { DAILY: 79, WEEKLY: 449, MONTHLY: 1499 },
  THREE_WHEELER: { DAILY: 99, WEEKLY: 549, MONTHLY: 1999 },
  MINI_TRUCK: { DAILY: 149, WEEKLY: 799, MONTHLY: 2999 },
  PICKUP: { DAILY: 199, WEEKLY: 1099, MONTHLY: 3999 },
  TRUCK: { DAILY: 199, WEEKLY: 1099, MONTHLY: 3999 },
} as const;

/** Length of each period in days. */
export const PERIOD_DAYS: Readonly<Record<PlanPeriod, number>> = { DAILY: 1, WEEKLY: 7, MONTHLY: 30 } as const;

/** Days a lapsed plan can still go online. */
export const GRACE_DAYS = 2;

/** Free trial length for new drivers. */
export const TRIAL_DAYS = 30;
