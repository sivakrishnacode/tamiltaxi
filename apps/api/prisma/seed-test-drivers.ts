// Approved test drivers you can sign into on a phone (dev OTP: any 6 digits except 000000). Ids start with "test_drv_".
// Idempotent: re-running brings each one back to approved, verified and offline.
//   npm run seed:test-drivers -w @tamiltaxi/api                        # add / refresh
//   npm run seed:test-drivers -w @tamiltaxi/api -- --photo <file name> # also set their profile photo (a stored file)
//   npm run seed:test-drivers -w @tamiltaxi/api -- --clear             # remove them
// On apps from 0.1.2, going online needs a profile photo: upload one placeholder to storage and pass its name.
// Each gets a 90-day TRIAL on its vehicle's monthly plan, so they can go online even with paid plans switched on.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client.js';
import type { Gender, KycDocType, VehicleKind, WorkType } from '../src/generated/prisma/enums.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });

interface TestDriver {
  readonly phone: string;
  readonly name: string;
  readonly gender: Gender;
  readonly vehicleKind: VehicleKind;
  readonly model: string;
  readonly color: string;
  readonly plate: string;
}

/**
 * Phone blocks by vehicle: 91000001xx cab (Mini), 2xx goods bike, 3xx truck, 4xx mini truck, 5xx pickup, 6xx bike taxi,
 * 7xx auto, 8xx scooty, 9xx sedan and SUV.
 */
export const TEST_DRIVERS: readonly TestDriver[] = [
  { phone: '+919100000101', name: 'Arun Kumar', gender: 'MALE', vehicleKind: 'CAB', model: 'Maruti Dzire', color: 'White', plate: 'TN 37 CA 1101' },
  { phone: '+919100000102', name: 'Priya Selvam', gender: 'FEMALE', vehicleKind: 'CAB', model: 'Hyundai Aura', color: 'Grey', plate: 'TN 37 CA 1102' },
  { phone: '+919100000201', name: 'Karthik Raj', gender: 'MALE', vehicleKind: 'GOODS_BIKE', model: 'TVS XL100', color: 'Black', plate: 'TN 37 GB 2201' },
  { phone: '+919100000202', name: 'Meena Murugan', gender: 'FEMALE', vehicleKind: 'GOODS_BIKE', model: 'Hero Splendor+', color: 'Red', plate: 'TN 37 GB 2202' },
  { phone: '+919100000301', name: 'Suresh Pandian', gender: 'MALE', vehicleKind: 'TRUCK', model: 'Tata 407', color: 'Yellow', plate: 'TN 37 TR 3301' },
  { phone: '+919100000302', name: 'Mani Velu', gender: 'MALE', vehicleKind: 'TRUCK', model: 'Eicher Pro 2049', color: 'Blue', plate: 'TN 37 TR 3302' },
  { phone: '+919100000401', name: 'Gokul Natarajan', gender: 'MALE', vehicleKind: 'MINI_TRUCK', model: 'Tata Ace Gold', color: 'White', plate: 'TN 37 MT 4401' },
  { phone: '+919100000501', name: 'Bala Krishnan', gender: 'MALE', vehicleKind: 'PICKUP', model: 'Mahindra Bolero Pickup', color: 'White', plate: 'TN 37 PK 5501' },
  { phone: '+919100000601', name: 'Vijay Anand', gender: 'MALE', vehicleKind: 'BIKE', model: 'Honda Shine', color: 'Black', plate: 'TN 37 BK 6601' },
  { phone: '+919100000602', name: 'Divya Ramesh', gender: 'FEMALE', vehicleKind: 'BIKE', model: 'TVS Jupiter', color: 'Blue', plate: 'TN 37 BK 6602' },
  { phone: '+919100000701', name: 'Senthil Kumar', gender: 'MALE', vehicleKind: 'AUTO', model: 'Bajaj RE', color: 'Yellow', plate: 'TN 37 AU 7701' },
  { phone: '+919100000801', name: 'Kavya Prakash', gender: 'FEMALE', vehicleKind: 'SCOOTY', model: 'Honda Activa 6G', color: 'White', plate: 'TN 37 SC 8801' },
  { phone: '+919100000901', name: 'Ramesh Babu', gender: 'MALE', vehicleKind: 'SEDAN', model: 'Honda Amaze', color: 'White', plate: 'TN 37 SD 9901' },
  { phone: '+919100000902', name: 'Lakshmi Narayanan', gender: 'MALE', vehicleKind: 'SUV', model: 'Maruti Ertiga', color: 'White', plate: 'TN 37 SU 9902' },
];

const DOCS: KycDocType[] = ['DRIVING_LICENCE', 'AADHAAR', 'VEHICLE_RC', 'INSURANCE', 'POLICE_VERIFICATION'];
const GOODS: VehicleKind[] = ['GOODS_BIKE', 'THREE_WHEELER', 'MINI_TRUCK', 'PICKUP', 'TRUCK'];
const idOf = (phone: string): string => `test_drv_${phone.slice(-3)}`;
const argAfter = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function clear(): Promise<void> {
  const test = { startsWith: 'test_drv_' };
  await prisma.trip.updateMany({ where: { driverId: test }, data: { driverId: null } });
  const { count } = await prisma.user.deleteMany({ where: { id: test } }); // cascades drivers and KYC
  console.log(`Removed ${count} test drivers`);
}

async function main(): Promise<void> {
  if (process.argv.includes('--clear')) return clear();
  const photoFile = argAfter('--photo');
  for (const t of TEST_DRIVERS) {
    const id = idOf(t.phone);
    // A phone already used by another account (e.g. you signed up with it) is left alone.
    const other = await prisma.user.findUnique({ where: { phone: t.phone }, select: { id: true } });
    if (other && other.id !== id) {
      console.log(`skip ${t.phone}: already used by user ${other.id}`);
      continue;
    }
    const workType: WorkType = GOODS.includes(t.vehicleKind) ? 'DELIVERIES' : 'RIDES';
    const vehicle = {
      vehicleKind: t.vehicleKind, workType, vehicleModel: t.model, vehicleColor: t.color, plate: t.plate,
      status: 'APPROVED' as const, isOnline: false, blockedUntil: null, ...(photoFile && { photoFile, photoUpdatedAt: new Date() }),
    };
    await prisma.user.upsert({
      where: { id },
      create: {
        id, phone: t.phone, name: t.name, role: 'DRIVER', gender: t.gender, identityStatus: 'APPROVED',
        driver: { create: { id, upiId: `${id}@okaxis`, ...vehicle } },
      },
      update: { name: t.name, role: 'DRIVER', gender: t.gender, identityStatus: 'APPROVED', isBlocked: false },
    });
    await prisma.driver.update({ where: { id }, data: vehicle });
    await prisma.kycDocument.deleteMany({ where: { driverId: id } });
    await prisma.kycDocument.createMany({ data: DOCS.map((type) => ({ driverId: id, type, status: 'VERIFIED' as const })) });
    const plan = await prisma.plan.findUnique({ where: { vehicleKind_period: { vehicleKind: t.vehicleKind, period: 'MONTHLY' } } });
    if (plan) {
      await prisma.subscription.deleteMany({ where: { driverId: id } });
      await prisma.subscription.create({ data: { driverId: id, planId: plan.id, status: 'TRIAL', endsAt: new Date(Date.now() + 90 * 86_400_000), autopay: false } });
    } else {
      console.log(`no monthly ${t.vehicleKind} plan: ${t.phone} can go online only while paid plans are off`);
    }
  }
  console.log('Test drivers (sign in with any 6-digit OTP except 000000):');
  for (const t of TEST_DRIVERS) console.log(`  ${t.phone.slice(3)}  ${t.vehicleKind.padEnd(10)} ${t.name} (${t.gender.toLowerCase()}) · ${t.model} · ${t.plate}`);
  if (!photoFile) console.log('No --photo given: on apps from 0.1.2, each driver must add a profile photo before going online.');
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
