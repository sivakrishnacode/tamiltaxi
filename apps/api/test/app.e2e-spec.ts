// End-to-end: needs Postgres + Redis (`docker compose up -d postgres redis` and `npm run prisma:deploy -w @tamiltaxi/api`).
import { createHmac } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/core/prisma/prisma.service.js';
import { DriverStateCache } from '../src/core/driver-state/driver-state.cache.js';
import { JobsService } from '../src/core/jobs/jobs.service.js';
import { RedisService } from '../src/core/redis/redis.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { SettingsService } from '../src/modules/settings/settings.service.js';
import { DriverBlocksService } from '../src/modules/trips/driver-blocks.service.js';
import { statsKey } from '../src/modules/trips/driver-rank.js';
import { DEMAND_RES, DemandService, SURGE_CELLS_KEY } from '../src/modules/geo/demand.service.js';
import { cellAt } from '../src/modules/geo/h3.util.js';
import { haversineMeters } from '../src/modules/fares/fare-engine.js';
import { DriverLocationService } from '../src/modules/drivers/driver-location.service.js';
import { DiditClient } from '../src/modules/kyc/didit.client.js';
import type { DiditDecision } from '../src/modules/kyc/didit.js';

const GANDHIPURAM = { lat: 11.0183, lng: 76.9725, placeId: 'gandhipuram', name: 'Gandhipuram Central Bus Stand' };
const BROOKEFIELDS = { lat: 11.009, lng: 76.96, placeId: 'brookefields', name: 'Brookefields Mall' };

const ADMIN_PHONE = '9000000001';

/** Random valid number plate (plates are unique and the test database keeps earlier runs' drivers). */
function randomPlate(): string {
  const letters = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return `TN ${10 + Math.floor(Math.random() * 90)} ${letters()}${letters()}${letters()} ${Math.floor(1000 + Math.random() * 8999)}`;
}

/** Random valid Indian mobile number so runs don't collide. */
function phone(): string {
  return `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
}

const WEBHOOK_SECRET = 'whsec_e2e';
/** A stored photo so drivers approved directly in the database may go online (photo required with Didit on). */
const E2E_PHOTO = '00000000-0000-4000-8000-00000000e2e0.jpg';
/** Smallest valid JPEG header bytes: enough for storage (it only checks the type). */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);

/** Stands in for Didit: sessions are per user, decisions are set by the test. */
const fakeDidit = {
  isEnabled: true,
  decisions: new Map<string, DiditDecision>(),
  createSession: async (p: { userId: string }) => ({ sessionId: `sess-${p.userId}`, sessionToken: `tok-${p.userId}`, status: 'Not Started' }),
  decision: async (sessionId: string) => fakeDidit.decisions.get(sessionId) ?? { session_id: sessionId, status: 'In Progress' },
  image: async (url: string) => (url.startsWith('https://') ? { buffer: JPEG, mimetype: 'image/jpeg' } : null),
  /** Next face-match result for a profile photo. */
  nextMatch: { score: 97 as number | null, faces: 1, isMatch: true },
  faceMatch: async () => fakeDidit.nextMatch,
};

/** Signs a webhook body like Didit (X-Signature-V2 over sorted compact JSON). */
function signed(body: Record<string, unknown>): { headers: Record<string, string>; body: Record<string, unknown> } {
  const sort = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])])) : v;
  const sig = createHmac('sha256', WEBHOOK_SECRET).update(JSON.stringify(sort(body))).digest('hex');
  return { headers: { 'x-signature-v2': sig, 'x-timestamp': String(Math.floor(Date.now() / 1000)) }, body };
}

describe('Tamil Taxi API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  /** A signed-in passenger for quotes, routes and place lookups (those need a sign-in and are limited per user). */
  let quoter: { Authorization: string };

  beforeAll(async () => {
    process.env.OTP_DEV_MODE = 'true';
    process.env.ADMIN_PHONES = ADMIN_PHONE;
    process.env.GOOGLE_MAPS_API_KEY = ''; // no paid Google calls in tests
    // Didit is "set up" with a fake client, so drivers need an identity check to be approved.
    process.env.DIDIT_API_KEY = 'e2e';
    process.env.DIDIT_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.DIDIT_DRIVER_WORKFLOW_ID = 'wf-driver';
    process.env.DIDIT_RIDER_WORKFLOW_ID = 'wf-rider';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DiditClient).useValue(fakeDidit).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    prisma = app.get(PrismaService);
    const redis = app.get(RedisService);
    const otpKeys = [...(await redis.keys('otp:*')), ...(await redis.keys('rl:*'))];
    if (otpKeys.length) await redis.del(...otpKeys);
    const keys = [...(await redis.keys('h3:*')), ...(await redis.keys('hexstats:*')), ...(await redis.keys('driver:*')), ...(await redis.keys('dispatch:*')), ...(await redis.keys('jobs:*'))];
    if (keys.length) await redis.del(...keys);
    http = request(app.getHttpServer());
    quoter = { Authorization: `Bearer ${await login()}` };
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(): Promise<string> {
    const p = phone();
    await http.post('/v1/auth/otp').send({ phone: p }).expect(200);
    const res = await http.post('/v1/auth/verify').send({ phone: p, code: '123456' }).expect(200);
    return res.body.accessToken as string;
  }

  let adminHeaders: { Authorization: string } | null = null;
  /** The admin's token, signed in once (OTP sends are limited to 5 per 15 min per phone). */
  async function adminAuth(): Promise<{ Authorization: string }> {
    if (!adminHeaders) {
      await http.post('/v1/auth/otp').send({ phone: ADMIN_PHONE }).expect(200);
      adminHeaders = { Authorization: `Bearer ${(await http.post('/v1/auth/verify').send({ phone: ADMIN_PHONE, code: '123456', app: 'admin' }).expect(200)).body.accessToken}` };
    }
    return adminHeaders;
  }

  it('reports ready', async () => {
    await http.get('/health/ready').expect(200, { status: 'ok', database: 'up', redis: 'up' });
  });

  it('rejects the wrong OTP and protected routes without a token', async () => {
    const p = phone();
    // No code was sent to this phone: even a code dev mode would take is refused.
    expect((await http.post('/v1/auth/verify').send({ phone: p, code: '123456' }).expect(401)).body.message).toBe('Request a new OTP first');
    await http.post('/v1/auth/otp').send({ phone: p }).expect(200);
    expect((await http.post('/v1/auth/verify').send({ phone: p, code: '000000' }).expect(401)).body.message).toBe('Incorrect OTP');
    await http.get('/v1/me').expect(401);
  });

  it('limits OTP requests per client IP: 429 with Retry-After, other clients unaffected', async () => {
    // Behind Caddy (a loopback / private peer) the client is the X-Forwarded-For address.
    const client = '203.0.113.10';
    for (let i = 0; i < 10; i++) await http.post('/v1/auth/otp').set('x-forwarded-for', client).send({ phone: phone() }).expect(200);
    const limited = await http.post('/v1/auth/otp').set('x-forwarded-for', client).send({ phone: phone() }).expect(429);
    expect(limited.body).toMatchObject({ statusCode: 429, message: 'Too many requests. Please wait a moment and try again.', code: 'RATE_LIMITED' });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(800);
    await http.post('/v1/auth/otp').set('x-forwarded-for', '203.0.113.11').send({ phone: phone() }).expect(200);
  });

  it('quotes fares with no peak markup by default', async () => {
    const res = await http.post('/v1/fares/quote').set(quoter).send({ pickup: GANDHIPURAM, drop: BROOKEFIELDS }).expect(200);
    // Bike, Scooty, Auto, Auto Priority, Mini, Sedan, SUV.
    expect(res.body.quotes.map((q: { vehicleKind: string }) => q.vehicleKind)).toEqual(['BIKE', 'SCOOTY', 'AUTO', 'AUTO_PRIORITY', 'CAB', 'SEDAN', 'SUV']);
    expect(res.body.quotes.map((q: { total: number }) => q.total)).toEqual([35, 39, 66, 80, 132, 158, 210]);
  });

  it('runs a bike ride end to end', async () => {
    // Arrange: a passenger and an approved, online bike driver near the pickup.
    const passenger = await login();
    const driverUser = await login();
    const plate = randomPlate();
    const reg = await http
      .post('/v1/drivers')
      .set('Authorization', `Bearer ${driverUser}`)
      .send({ name: 'Karthik S', workType: 'RIDES', vehicleKind: 'BIKE', vehicleModel: 'Honda Activa', vehicleColor: 'Grey', plate, upiId: 'karthik@okaxis' })
      .expect(201);
    const driver = reg.body.accessToken as string;
    await prisma.driver.update({ where: { id: reg.body.driver.id }, data: { status: 'APPROVED', photoFile: E2E_PHOTO } });
    await http.post('/v1/drivers/me/online').set('Authorization', `Bearer ${driver}`).send({ lat: 11.019, lng: 76.973 }).expect(200);

    // Act: book, accept, arrive, start with OTP, complete, rate.
    const trip = (await http
      .post('/v1/trips')
      .set('Authorization', `Bearer ${passenger}`)
      .send({ kind: 'RIDE', vehicleKind: 'BIKE', pickup: GANDHIPURAM, drop: BROOKEFIELDS, pickupLandmark: 'Near KG Hospital' })
      .expect(201)).body;
    // The pickup's landmark is kept for the driver.
    expect(trip.pickupLandmark).toBe('Near KG Hospital');
    // A second trip for now while this one is searching is refused, pointing at it.
    const twice = await http.post('/v1/trips').set('Authorization', `Bearer ${passenger}`).send({ kind: 'RIDE', vehicleKind: 'AUTO', pickup: GANDHIPURAM, drop: BROOKEFIELDS }).expect(409);
    expect(twice.body).toMatchObject({ code: 'TRIP_IN_PROGRESS', message: 'You already have a trip in progress', details: { tripId: trip.id } });
    const auth = { Authorization: `Bearer ${driver}` };
    // Matching runs in ~2 s batches: retry until this driver has the offer.
    let accepted = 0;
    for (let i = 0; i < 30 && accepted !== 200; i++) {
      accepted = (await http.post(`/v1/trips/${trip.id}/accept`).set(auth)).status;
      if (accepted !== 200) await new Promise((r) => setTimeout(r, 250));
    }
    expect(accepted).toBe(200);
    const arrived = (await http.post(`/v1/trips/${trip.id}/arrived`).set(auth).expect(200)).body;
    // The driver never gets the OTP: the rider reads it out.
    expect(arrived).toMatchObject({ otp: '' });
    expect(arrived.arrivedAt).not.toBeNull();
    const wrongOtp = { otp: '0000' === trip.otp ? '1111' : '0000' };
    await http.post(`/v1/trips/${trip.id}/start`).set(auth).send(wrongOtp).expect(400);
    // 5 tries a minute: the 5th wrong one locks the OTP, even the right one, until the minute is up.
    for (let i = 0; i < 3; i++) await http.post(`/v1/trips/${trip.id}/start`).set(auth).send(wrongOtp).expect(400);
    expect((await http.post(`/v1/trips/${trip.id}/start`).set(auth).send(wrongOtp).expect(429)).body.code).toBe('OTP_LOCKED');
    await http.post(`/v1/trips/${trip.id}/start`).set(auth).send({ otp: trip.otp }).expect(429);
    await app.get(RedisService).del(`trip:otp-tries:${trip.id}`); // the minute is up
    await http.post(`/v1/trips/${trip.id}/start`).set(auth).send({ otp: trip.otp }).expect(200);
    // A retried start is fine; the passenger can't cancel a ride that has started.
    expect((await http.post(`/v1/trips/${trip.id}/start`).set(auth).send({ otp: trip.otp }).expect(200)).body.status).toBe('IN_PROGRESS');
    await http.post(`/v1/trips/${trip.id}/cancel`).set('Authorization', `Bearer ${passenger}`).send({}).expect(400);
    // The server's fresh GPS fix (still at the pickup) wins over coordinates the app claims.
    const end = { lat: BROOKEFIELDS.lat, lng: BROOKEFIELDS.lng };
    expect((await http.post(`/v1/trips/${trip.id}/complete`).set(auth).send(end).expect(422)).body.code).toBe('TOO_FAR');
    await http.post('/v1/drivers/me/location').set(auth).send(end).expect(204);
    // Ended at the drop (farther than dropRadiusM would need a reason). A double tap counts the ride once.
    const [done, again] = await Promise.all([
      http.post(`/v1/trips/${trip.id}/complete`).set(auth).send(end),
      http.post(`/v1/trips/${trip.id}/complete`).set(auth).send(end),
    ]);
    expect([done.status, again.status]).toEqual([200, 200]);
    expect((await prisma.driver.findUniqueOrThrow({ where: { id: reg.body.driver.id } })).ridesCount).toBe(1);
    // Rating = mean of the ratings given (not averaged over rides); a second rating is refused.
    await http.post(`/v1/trips/${trip.id}/rate`).set('Authorization', `Bearer ${passenger}`).send({ rating: 4 }).expect(200);
    await http.post(`/v1/trips/${trip.id}/rate`).set('Authorization', `Bearer ${passenger}`).send({ rating: 1 }).expect(409);
    expect(await prisma.driver.findUniqueOrThrow({ where: { id: reg.body.driver.id } })).toMatchObject({ rating: 4, ratingSum: 4, ratingCount: 1 });

    // Assert
    expect(trip.fareTotal).toBe(35);
    expect(done.body.status).toBe('COMPLETED');
    const history = await http.get('/v1/trips').set('Authorization', `Bearer ${passenger}`).expect(200);
    expect(history.body[0].id).toBe(trip.id);
  });

  /** An approved driver of [vehicleKind], online at [at]. Returns their token. */
  async function onlineDriver(vehicleKind: string, at: { lat: number; lng: number }, gender?: 'FEMALE' | 'MALE'): Promise<string> {
    const user = await login();
    const plate = randomPlate();
    const reg = await http
      .post('/v1/drivers')
      .set('Authorization', `Bearer ${user}`)
      .send({ name: 'Test Driver', workType: 'RIDES', vehicleKind, vehicleModel: 'Test', vehicleColor: 'White', plate, upiId: 'test@okaxis', gender })
      .expect(201);
    await prisma.driver.update({ where: { id: reg.body.driver.id }, data: { status: 'APPROVED', photoFile: E2E_PHOTO } });
    const token = reg.body.accessToken as string;
    await http.post('/v1/drivers/me/online').set('Authorization', `Bearer ${token}`).send(at).expect(200);
    return token;
  }

  /** Retries accept while matching runs (~2 s batches); returns the last response. */
  async function acceptWhenOffered(tripId: string, driver: string, tries = 40): Promise<request.Response> {
    let res = await http.post(`/v1/trips/${tripId}/accept`).set('Authorization', `Bearer ${driver}`);
    for (let i = 1; i < tries && res.status !== 200; i++) {
      await new Promise((r) => setTimeout(r, 250));
      res = await http.post(`/v1/trips/${tripId}/accept`).set('Authorization', `Bearer ${driver}`);
    }
    return res;
  }

  it('Auto Priority goes to an auto at its own fare; a scooter takes a Bike ride; nobody registers as Auto Priority', async () => {
    const user = await login();
    const reg = { name: 'Test Driver', workType: 'RIDES', vehicleKind: 'AUTO_PRIORITY', vehicleModel: 'Test', vehicleColor: 'White', plate: randomPlate(), upiId: 'test@okaxis' };
    await http.post('/v1/drivers').set('Authorization', `Bearer ${user}`).send(reg).expect(400);

    // Away from the Gandhipuram tests, so these bookings don't count as demand (surge) there.
    const pickup = { lat: 11.0004, lng: 77.028, name: 'Singanallur' };
    const near = { lat: 11.0007, lng: 77.0284 };
    const quotes = (await http.post('/v1/fares/quote').set(quoter).send({ pickup, drop: BROOKEFIELDS }).expect(200)).body.quotes as { vehicleKind: string; total: number }[];
    const fare = (kind: string): number => quotes.find((q) => q.vehicleKind === kind)!.total;
    expect(fare('AUTO_PRIORITY')).toBeGreaterThan(fare('AUTO'));

    const rider = await login();
    const pax = { Authorization: `Bearer ${rider}` };
    const auto = await onlineDriver('AUTO', near);
    // The rider's map shows it nearby: kind and a rounded position, no id; signed-in riders only.
    await http.get('/v1/drivers/nearby').query({ lat: pickup.lat, lng: pickup.lng }).expect(401);
    const around = (await http.get('/v1/drivers/nearby').query({ lat: pickup.lat, lng: pickup.lng }).set(pax).expect(200)).body.vehicles;
    expect(around.map((v: { kind: string }) => v.kind)).toContain('AUTO');
    expect(around[0]).not.toHaveProperty('driverId');
    const priority = (await http.post('/v1/trips').set(pax).send({ kind: 'RIDE', vehicleKind: 'AUTO_PRIORITY', pickup, drop: BROOKEFIELDS }).expect(201)).body;
    expect(priority.fareTotal).toBe(fare('AUTO_PRIORITY'));
    expect((await acceptWhenOffered(priority.id, auto)).status).toBe(200);
    // The auto takes it as Auto Priority, at the priority fare.
    expect(await prisma.trip.findUniqueOrThrow({ where: { id: priority.id }, select: { vehicleKind: true, fareTotal: true } })).toEqual({
      vehicleKind: 'AUTO_PRIORITY',
      fareTotal: fare('AUTO_PRIORITY'),
    });
    await http.post(`/v1/trips/${priority.id}/cancel`).set(pax).send({}).expect(200);
    await http.post('/v1/drivers/me/offline').set('Authorization', `Bearer ${auto}`).expect(200);

    const scooty = await onlineDriver('SCOOTY', near);
    const bike = (await http.post('/v1/trips').set(pax).send({ kind: 'RIDE', vehicleKind: 'BIKE', pickup, drop: BROOKEFIELDS }).expect(201)).body;
    expect((await acceptWhenOffered(bike.id, scooty)).status).toBe(200);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: bike.id } })).fareTotal).toBe(fare('BIKE'));
    await http.post(`/v1/trips/${bike.id}/cancel`).set(pax).send({}).expect(200);
    await http.post('/v1/drivers/me/offline').set('Authorization', `Bearer ${scooty}`).expect(200);
  }, 30_000);

  it('rents a sedan by the hour, end to end, at the package price', async () => {
    // Away from the Gandhipuram tests (their demand doesn't touch these fixed prices anyway).
    const pickup = { lat: 11.0252, lng: 77.0091, name: 'Hope College' };
    const packages = (await http.get('/v1/fares/rental-packages').expect(200)).body;
    expect(packages.packages.find((p: { id: string }) => p.id === '4h')).toMatchObject({ hours: 4, km: 40, prices: { CAB: 849, SEDAN: 979, SUV: 1279 } });
    const quotes = (await http.post('/v1/fares/quote').set(quoter).send({ pickup, rideMode: 'RENTAL', rentalPackageId: '4h' }).expect(200)).body.quotes;
    expect(quotes.map((q: { vehicleKind: string; total: number }) => [q.vehicleKind, q.total])).toEqual([['CAB', 849], ['SEDAN', 979], ['SUV', 1279]]);
    expect(quotes[1].modeTerms).toMatchObject({ mode: 'RENTAL', hours: 4, km: 40, extraKmRate: 14 });

    const rider = await login();
    const pax = { Authorization: `Bearer ${rider}` };
    // Rentals are cab tiers only; booking for later is for rentals and outstation.
    await http.post('/v1/trips').set(pax).send({ kind: 'RIDE', vehicleKind: 'BIKE', pickup, rideMode: 'RENTAL', rentalPackageId: '4h' }).expect(400);
    const later = new Date(Date.now() + 3 * 3_600_000).toISOString();
    await http.post('/v1/trips').set(pax).send({ kind: 'RIDE', vehicleKind: 'BIKE', pickup, drop: BROOKEFIELDS, scheduledAt: later }).expect(400);

    const driver = await onlineDriver('SEDAN', { lat: 11.0255, lng: 77.0095 });
    const auth = { Authorization: `Bearer ${driver}` };
    const trip = (await http.post('/v1/trips').set(pax).send({ kind: 'RIDE', vehicleKind: 'SEDAN', pickup, rideMode: 'RENTAL', rentalPackageId: '4h' }).expect(201)).body;
    expect(trip).toMatchObject({ rideMode: 'RENTAL', status: 'SEARCHING', fareTotal: 979, dropLat: pickup.lat, modeTerms: { packageId: '4h' } });
    expect((await acceptWhenOffered(trip.id, driver)).status).toBe(200);
    await http.post(`/v1/trips/${trip.id}/arrived`).set(auth).expect(200);
    await http.post(`/v1/trips/${trip.id}/start`).set(auth).send({ otp: trip.otp }).expect(200);
    // A rental ends wherever the rider gets off: no "too far from the drop".
    await http.post('/v1/drivers/me/location').set(auth).send({ lat: 11.05, lng: 77.03 }).expect(204);
    const done = (await http.post(`/v1/trips/${trip.id}/complete`).set(auth).send({}).expect(200)).body;
    expect(done).toMatchObject({ status: 'COMPLETED', fareTotal: 979 });
    await http.post('/v1/drivers/me/offline').set(auth).expect(200);
  });

  it('books an outstation round trip for later: upcoming until its time, then it searches', async () => {
    const pickup = { lat: 11.0252, lng: 77.0091, name: 'Hope College' };
    const drop = { lat: 11.1085, lng: 77.3411, name: 'Out of town' };
    const leave = new Date(Date.now() + 2 * 86_400_000);
    const back = new Date(leave.getTime() + 30 * 3_600_000);
    const body = { pickup, drop, rideMode: 'OUTSTATION', roundTrip: true, scheduledAt: leave.toISOString(), returnAt: back.toISOString() };
    const quotes = (await http.post('/v1/fares/quote').set(quoter).send(body).expect(200)).body.quotes;
    const mini = quotes.find((q: { vehicleKind: string }) => q.vehicleKind === 'CAB');
    expect(mini.modeTerms).toMatchObject({ mode: 'OUTSTATION', roundTrip: true, perKm: 11, allowancePerDay: 300 });
    expect(mini.total).toBe(mini.modeTerms.includedKm * 11 + 300 * mini.modeTerms.days);
    // The drop is outside the service area: fine for outstation, refused for a local ride.
    const rider = await login();
    const pax = { Authorization: `Bearer ${rider}` };
    await http.post('/v1/trips').set(pax).send({ kind: 'RIDE', vehicleKind: 'CAB', pickup, drop }).expect(400);
    await http.post('/v1/trips').set(pax).send({ kind: 'RIDE', vehicleKind: 'CAB', ...body, returnAt: undefined }).expect(400);

    const trip = (await http.post('/v1/trips').set(pax).send({ kind: 'RIDE', vehicleKind: 'CAB', ...body }).expect(201)).body;
    expect(trip).toMatchObject({ status: 'SCHEDULED', rideMode: 'OUTSTATION', fareTotal: mini.total });
    expect((await http.get('/v1/trips/upcoming').set(pax).expect(200)).body.map((t: { id: string }) => t.id)).toEqual([trip.id]);
    // Not "active" until its search starts.
    expect((await http.get('/v1/trips/active').set(pax).expect(200)).body).toEqual({});
    const jobs = app.get(JobsService);
    const due = await jobs.scheduledAt('trip.scheduled-dispatch', trip.id);
    expect(due).toBe(leave.getTime() - 30 * 60_000);
    await jobs.runDue(due!);
    const searching = await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } });
    expect(searching.status).toBe('SEARCHING');
    expect(searching.searchFrom.getTime()).toBeGreaterThan(searching.createdAt.getTime());
    expect((await http.get('/v1/trips/upcoming').set(pax).expect(200)).body).toEqual([]);
    await http.post(`/v1/trips/${trip.id}/cancel`).set(pax).send({}).expect(200);

    // Cancelling while still scheduled drops its start job.
    const other = (await http.post('/v1/trips').set(pax).send({ kind: 'RIDE', vehicleKind: 'SUV', ...body }).expect(201)).body;
    await http.post(`/v1/trips/${other.id}/cancel`).set(pax).send({}).expect(200);
    expect(await jobs.scheduledAt('trip.scheduled-dispatch', other.id)).toBeNull();
    const redis = app.get(RedisService);
    const demand = [...(await redis.keys('h3:req:*')), ...(await redis.keys('h3:riders:*')), ...(await redis.keys('h3:surge:*'))];
    if (demand.length) await redis.del(...demand);
  });

  it('goods to another town: goods trucks only, one way, by the km; booked for later it waits', async () => {
    const pickup = { lat: 11.0252, lng: 77.0091, name: 'Hope College' };
    const drop = { lat: 11.1085, lng: 77.3411, name: 'Out of town' };
    const quotes = (await http.post('/v1/fares/quote').set(quoter).send({ pickup, drop, kind: 'PARCEL', rideMode: 'OUTSTATION' }).expect(200)).body.quotes;
    expect(quotes.map((q: { vehicleKind: string }) => q.vehicleKind)).toEqual(['THREE_WHEELER', 'MINI_TRUCK', 'PICKUP', 'TRUCK']);
    const threeW = quotes[0];
    expect(threeW.modeTerms).toMatchObject({ mode: 'OUTSTATION', roundTrip: false, perKm: 22, allowancePerDay: 0 });
    expect(threeW.total).toBe(threeW.modeTerms.includedKm * 22);
    await http.post('/v1/fares/quote').set(quoter).send({ pickup, drop, kind: 'PARCEL', rideMode: 'OUTSTATION', roundTrip: true }).expect(400);
    await http.post('/v1/fares/quote').set(quoter).send({ pickup, kind: 'PARCEL', rideMode: 'RENTAL', rentalPackageId: '4h' }).expect(400);

    const pax = { Authorization: `Bearer ${await login()}` };
    const book = { kind: 'PARCEL', pickup, drop, rideMode: 'OUTSTATION' };
    // Not by goods bike; a local parcel can't leave the service area.
    await http.post('/v1/trips').set(pax).send({ ...book, vehicleKind: 'GOODS_BIKE' }).expect(400);
    await http.post('/v1/trips').set(pax).send({ ...book, vehicleKind: 'THREE_WHEELER', rideMode: undefined }).expect(400);
    const later = new Date(Date.now() + 26 * 3_600_000).toISOString();
    const trip = (await http.post('/v1/trips').set(pax).send({ ...book, vehicleKind: 'THREE_WHEELER', scheduledAt: later }).expect(201)).body;
    expect(trip).toMatchObject({ status: 'SCHEDULED', rideMode: 'OUTSTATION', kind: 'PARCEL', fareTotal: threeW.total, modeTerms: { perKm: 22 } });
    await http.post(`/v1/trips/${trip.id}/cancel`).set(pax).send({}).expect(200);
  });

  it('house shifting: lines, vehicles and days to compare; booked for a slot with typed items; the mover sees them', async () => {
    const pickup = { lat: 11.0252, lng: 77.0091, name: 'Hope College' };
    const shifting = {
      homeSize: 'ONE_BHK', between: false, pickupFloor: 2, pickupLift: false, dropFloor: 5, dropLift: true,
      packing: 'BASIC', dismantlePieces: 1, unpack: false, extraHelpers: 0,
    };
    const slot = new Date(Date.now() + 2 * 86_400_000);
    slot.setUTCMinutes(0, 0, 0);
    const q = (await http.post('/v1/fares/shifting-quote').set(quoter).send({ pickup, drop: BROOKEFIELDS, shifting, at: slot.toISOString() }).expect(200)).body;
    // 1 BHK: a pickup truck, 2 helpers in town, 2 floors of stairs, basic packing, one piece taken apart.
    expect(q.vehicleKind).toBe('PICKUP');
    expect(q.lines).toMatchObject({ helperCount: 2, helpers: 900, stairs: 300, packing: 699, dismantle: 199, unpack: 0 });
    expect(q.lines.total).toBe(q.lines.subtotal + q.lines.weekend);
    expect(q.vehicles.map((v: { vehicleKind: string }) => v.vehicleKind)).toEqual(['THREE_WHEELER', 'MINI_TRUCK', 'PICKUP', 'TRUCK']);
    expect(q.vehicles.find((v: { suggested: boolean }) => v.suggested).vehicleKind).toBe('PICKUP');
    expect(q.days).toHaveLength(7);
    expect(q.days.some((d: { weekend: boolean }) => d.weekend)).toBe(true);
    // A shift by the goods bike, or without its items, or without a slot, is refused.
    await http.post('/v1/fares/shifting-quote').set(quoter).send({ pickup, drop: BROOKEFIELDS, shifting, vehicleKind: 'GOODS_BIKE' }).expect(400);
    const pax = { Authorization: `Bearer ${await login()}` };
    const items = [{ name: '  Double cot ', qty: 1, note: 'comes apart' }, { name: 'Fridge', qty: 1 }, { name: 'Cartons', qty: 12, note: '' }];
    const book = { kind: 'PARCEL', vehicleKind: 'PICKUP', pickup, drop: BROOKEFIELDS, scheduledAt: slot.toISOString() };
    await http.post('/v1/trips').set(pax).send({ ...book, shifting }).expect(400);
    await http.post('/v1/trips').set(pax).send({ ...book, shifting: { ...shifting, items }, scheduledAt: undefined }).expect(400);
    await http.post('/v1/trips').set(pax).send({ ...book, vehicleKind: 'GOODS_BIKE', shifting: { ...shifting, items } }).expect(400);

    const trip = (await http.post('/v1/trips').set(pax).send({ ...book, shifting: { ...shifting, items } }).expect(201)).body;
    expect(trip).toMatchObject({ status: 'SCHEDULED', kind: 'PARCEL', rideMode: 'LOCAL', fareTotal: q.lines.total });
    expect(trip.shifting.items).toEqual([{ name: 'Double cot', qty: 1, note: 'comes apart' }, { name: 'Fridge', qty: 1 }, { name: 'Cartons', qty: 12 }]);
    expect(trip.shifting.lines.total).toBe(q.lines.total);
    expect((await http.get('/v1/trips/upcoming').set(pax).expect(200)).body.map((t: { id: string }) => t.id)).toContain(trip.id);

    // Who gets it: only movers who switched house shifting on, with enough helpers. The closest pickup driver hasn't
    // switched it on; the next brings 1 helper (2 needed); the one farther away brings 2.
    const closest = await onlineDriver('PICKUP', { lat: 11.0253, lng: 77.0092 });
    const short = await onlineDriver('PICKUP', { lat: 11.0254, lng: 77.0093 });
    const mover = await onlineDriver('PICKUP', { lat: 11.0262, lng: 77.0102 });
    const bike = await onlineDriver('BIKE', { lat: 11.03, lng: 77.02 });
    await http.put('/v1/drivers/me/booking-preferences').set('Authorization', `Bearer ${bike}`).send({ shifting: true }).expect(400);
    await http.put('/v1/drivers/me/booking-preferences').set('Authorization', `Bearer ${short}`).send({ shifting: true, helpers: 1 }).expect(200);
    await http.put('/v1/drivers/me/booking-preferences').set('Authorization', `Bearer ${mover}`).send({ shifting: true, helpers: 9 }).expect(400);
    const prefs = (await http.put('/v1/drivers/me/booking-preferences').set('Authorization', `Bearer ${mover}`).send({ shifting: true, helpers: 2 }).expect(200)).body;
    expect(prefs).toMatchObject({ shifting: true, helpers: 2 });
    expect((await http.get('/v1/drivers/me/booking-preferences').set('Authorization', `Bearer ${mover}`).expect(200)).body.helpers).toBe(2);

    // Its time comes: the mover is offered it with the items, floors and helpers.
    const jobs = app.get(JobsService);
    await jobs.runDue((await jobs.scheduledAt('trip.scheduled-dispatch', trip.id))!);
    const accepted = await acceptWhenOffered(trip.id, mover);
    expect(accepted.status).toBe(200);
    expect(accepted.body.shifting).toMatchObject({ homeSize: 'ONE_BHK', pickupFloor: 2, pickupLift: false, lines: { helperCount: 2 } });
    for (const other of [closest, short]) {
      expect((await http.post(`/v1/trips/${trip.id}/accept`).set('Authorization', `Bearer ${other}`)).status).not.toBe(200);
    }
    await http.post(`/v1/trips/${trip.id}/cancel`).set(pax).send({}).expect(200);
    // Off again: the test drivers are shared with other tests.
    await http.put('/v1/drivers/me/booking-preferences').set('Authorization', `Bearer ${mover}`).send({ shifting: false }).expect(200);
    for (const d of [closest, short, mover, bike]) await http.post('/v1/drivers/me/offline').set('Authorization', `Bearer ${d}`).expect(200);
  }, 30_000);

  it("admin pricing: a city's own rental, outstation, goods and shifting prices quote and book; reset goes back", async () => {
    const admin = await adminAuth();
    const pickup = { lat: 11.0252, lng: 77.0091, name: 'Hope College' };
    const before = (await http.get('/v1/admin/cities/coimbatore/pricing').set(admin).expect(200)).body;
    expect(before.sections.rental).toMatchObject({ isDefault: true, value: { SEDAN: { extraKm: 14 } } });
    expect(before.packages).toHaveLength(8);
    // Not without an admin; a broken section is refused with what's wrong.
    await http.get('/v1/admin/cities/coimbatore/pricing').expect(401);
    const rental = before.sections.rental.value;
    await http.put('/v1/admin/cities/coimbatore/pricing/rental').set(admin).send({ ...rental, SUV: undefined }).expect(400);
    await http.put('/v1/admin/cities/coimbatore/pricing/surge').set(admin).send({}).expect(400);

    const sedan = { ...rental.SEDAN, prices: rental.SEDAN.prices.map((p: number) => p + 21) };
    const saved = (await http.put('/v1/admin/cities/coimbatore/pricing/rental').set(admin).send({ ...rental, SEDAN: sedan }).expect(200)).body;
    expect(saved.sections.rental).toMatchObject({ isDefault: false, value: { SEDAN: { prices: sedan.prices } } });
    const shifting = { ...before.sections.shifting.value, helperCity: 600 };
    await http.put('/v1/admin/cities/coimbatore/pricing/shifting').set(admin).send(shifting).expect(200);

    // The apps read the city's prices; quotes and bookings use them.
    const rates = (await http.get('/v1/fares/rates').query({ lat: pickup.lat, lng: pickup.lng }).expect(200)).body;
    expect(rates.pricing.rental.SEDAN.prices[3]).toBe(1000);
    expect(rates.pricing.shifting.helperCity).toBe(600);
    expect((await http.get('/v1/fares/rates').expect(200)).body.pricing.rental.SEDAN.prices[3]).toBe(979);
    const quotes = (await http.post('/v1/fares/quote').set(quoter).send({ pickup, rideMode: 'RENTAL', rentalPackageId: '4h' }).expect(200)).body.quotes;
    expect(quotes.find((q: { vehicleKind: string }) => q.vehicleKind === 'SEDAN').total).toBe(1000);
    const pax = { Authorization: `Bearer ${await login()}` };
    const trip = (await http.post('/v1/trips').set(pax).send({ kind: 'RIDE', vehicleKind: 'SEDAN', pickup, rideMode: 'RENTAL', rentalPackageId: '4h' }).expect(201)).body;
    expect(trip.fareTotal).toBe(1000);
    await http.post(`/v1/trips/${trip.id}/cancel`).set(pax).send({}).expect(200);
    const details = {
      homeSize: 'ONE_BHK', between: false, pickupFloor: 0, pickupLift: false, dropFloor: 0, dropLift: false,
      packing: 'NONE', dismantlePieces: 0, unpack: false, extraHelpers: 0,
    };
    const shift = (await http.post('/v1/fares/shifting-quote').set(quoter).send({ pickup, drop: BROOKEFIELDS, shifting: details }).expect(200)).body;
    expect(shift.lines).toMatchObject({ helperCount: 2, helpers: 1200 });

    // Reset: the built-in prices again.
    await http.delete('/v1/admin/cities/coimbatore/pricing/rental').set(admin).expect(204);
    await http.delete('/v1/admin/cities/coimbatore/pricing/shifting').set(admin).expect(204);
    const after = (await http.get('/v1/admin/cities/coimbatore/pricing').set(admin).expect(200)).body;
    expect(after.sections.rental.isDefault).toBe(true);
    expect(after.sections.shifting.isDefault).toBe(true);
    const again = (await http.post('/v1/fares/quote').set(quoter).send({ pickup, rideMode: 'RENTAL', rentalPackageId: '4h' }).expect(200)).body.quotes;
    expect(again.find((q: { vehicleKind: string }) => q.vehicleKind === 'SEDAN').total).toBe(979);
  });

  it('quotes carry the nearest driver\'s pickup ETA (null when nobody is near)', async () => {
    const bikeDriver = await onlineDriver('BIKE', { lat: 11.0185, lng: 76.9727 });
    const quotes = (await http.post('/v1/fares/quote').set(quoter).send({ pickup: GANDHIPURAM, drop: BROOKEFIELDS }).expect(200)).body.quotes;
    const bike = quotes.find((q: { vehicleKind: string }) => q.vehicleKind === 'BIKE');
    expect(typeof bike.pickupEtaMin).toBe('number');
    expect(bike.total).toBe(35);
    const far = { lat: 11.2, lng: 77.2, name: 'Far away' };
    const empty = (await http.post('/v1/fares/quote').set(quoter).send({ pickup: far, drop: BROOKEFIELDS }).expect(200)).body.quotes;
    expect(empty.every((q: { pickupEtaMin: number | null }) => q.pickupEtaMin === null)).toBe(true);
    await http.post('/v1/drivers/me/offline').set('Authorization', `Bearer ${bikeDriver}`).expect(200);
  });

  it('Butterfly "only": needs a woman rider and goes to the woman driver, never the closer man', async () => {
    // Arrange: a man right at the pickup, a woman a little further.
    const at = { lat: 11.0184, lng: 76.9726 };
    const man = await onlineDriver('CAB', at, 'MALE');
    const woman = await onlineDriver('CAB', { lat: 11.0195, lng: 76.9738 }, 'FEMALE');
    const rider = await login();
    const pax = { Authorization: `Bearer ${rider}` };
    const book = { kind: 'RIDE', vehicleKind: 'CAB', pickup: GANDHIPURAM, drop: BROOKEFIELDS, womenDriver: 'ONLY' };

    // Act + assert: no gender set → refused; FEMALE → booked with the preference.
    await http.post('/v1/trips').set(pax).send(book).expect(400);
    await http.patch('/v1/me').set(pax).send({ gender: 'FEMALE' }).expect(200);
    const womenOnlyQuote = (await http.post('/v1/fares/quote').set(quoter).send({ pickup: GANDHIPURAM, drop: BROOKEFIELDS, womenOnly: true }).expect(200)).body.quotes;
    expect(womenOnlyQuote.find((q: { vehicleKind: string }) => q.vehicleKind === 'CAB').pickupEtaMin).not.toBeNull();
    const trip = (await http.post('/v1/trips').set(pax).send(book).expect(201)).body;
    expect(trip.womenDriver).toBe('ONLY');
    const accepted = await acceptWhenOffered(trip.id, woman);
    expect(accepted.status).toBe(200);
    expect((await http.post(`/v1/trips/${trip.id}/accept`).set('Authorization', `Bearer ${man}`)).status).not.toBe(200);
    await http.post(`/v1/trips/${trip.id}/cancel`).set(pax).send({}).expect(200);
    for (const d of [man, woman]) await http.post('/v1/drivers/me/offline').set('Authorization', `Bearer ${d}`);
  });

  it('booking preferences: a driver who only wants long trips is skipped for a short one', async () => {
    const picky = await onlineDriver('CAB', { lat: 11.0184, lng: 76.9726 });
    const other = await onlineDriver('CAB', { lat: 11.0196, lng: 76.9739 });
    const auth = { Authorization: `Bearer ${picky}` };
    await http.put('/v1/drivers/me/booking-preferences').set(auth).send({ minTripKm: 8, maxTripKm: 5 }).expect(400);
    const saved = (await http.put('/v1/drivers/me/booking-preferences').set(auth).send({ minTripKm: 8, maxPickupKm: 2 }).expect(200)).body;
    expect(saved).toMatchObject({ minTripKm: 8, maxPickupKm: 2, maxTripKm: null, goTo: null });
    expect((await http.get('/v1/drivers/me/booking-preferences').set(auth).expect(200)).body.minTripKm).toBe(8);

    // Gandhipuram → Brookefields is ~2 km: the closer, picky driver never gets it.
    const pax = { Authorization: `Bearer ${await login()}` };
    const trip = (await http.post('/v1/trips').set(pax).send({ kind: 'RIDE', vehicleKind: 'CAB', pickup: GANDHIPURAM, drop: BROOKEFIELDS }).expect(201)).body;
    expect((await acceptWhenOffered(trip.id, other)).status).toBe(200);
    expect((await http.post(`/v1/trips/${trip.id}/accept`).set(auth)).status).not.toBe(200);
    await http.post(`/v1/trips/${trip.id}/cancel`).set(pax).send({}).expect(200);

    // A go-to switches itself off after two hours.
    const goTo = (await http.put('/v1/drivers/me/booking-preferences').set(auth).send({ goTo: { lat: 11.08, lng: 77, name: 'Home' } }).expect(200)).body.goTo;
    expect(new Date(goTo.until).getTime() - Date.now()).toBeGreaterThan(119 * 60_000);
    await http.put('/v1/drivers/me/booking-preferences').set(auth).send({}).expect(200);
    for (const d of [picky, other]) await http.post('/v1/drivers/me/offline').set('Authorization', `Bearer ${d}`);
  });

  it('Stay In: only trips inside the area; one of Go To / Stay In at a time; saved areas stay', async () => {
    const staying = await onlineDriver('AUTO', { lat: 11.0184, lng: 76.9726 });
    const other = await onlineDriver('AUTO', { lat: 11.0196, lng: 76.9739 });
    const auth = { Authorization: `Bearer ${staying}` };
    const home = { name: 'Home', lat: 11.0797, lng: 76.9997 };
    const saravanampatti = { ...home, name: 'Saravanampatti', radiusKm: 5 };
    await http.put('/v1/drivers/me/booking-preferences').set(auth).send({ goTo: home, stayIn: saravanampatti }).expect(400);
    const saved = (await http.put('/v1/drivers/me/booking-preferences').set(auth).send({ stayIn: saravanampatti, areas: [home] }).expect(200)).body;
    expect(saved).toMatchObject({ goTo: null, stayIn: { name: 'Saravanampatti', radiusKm: 5 }, areas: [home] });
    expect(new Date(saved.stayIn.until).getTime() - Date.now()).toBeGreaterThan(11.9 * 3_600_000);

    // Gandhipuram → Brookefields is outside Saravanampatti: the closer driver staying there never gets it.
    const pax = { Authorization: `Bearer ${await login()}` };
    const trip = (await http.post('/v1/trips').set(pax).send({ kind: 'RIDE', vehicleKind: 'AUTO', pickup: GANDHIPURAM, drop: BROOKEFIELDS }).expect(201)).body;
    expect((await acceptWhenOffered(trip.id, other)).status).toBe(200);
    expect((await http.post(`/v1/trips/${trip.id}/accept`).set(auth)).status).not.toBe(200);
    await http.post(`/v1/trips/${trip.id}/cancel`).set(pax).send({}).expect(200);

    // An app that doesn't send them keeps the stay-in and areas; turning Go To on turns Stay In off.
    expect((await http.put('/v1/drivers/me/booking-preferences').set(auth).send({ minTripKm: 3 }).expect(200)).body).toMatchObject({ stayIn: { name: 'Saravanampatti' }, areas: [home] });
    const goTo = (await http.put('/v1/drivers/me/booking-preferences').set(auth).send({ goTo: home }).expect(200)).body;
    expect(goTo).toMatchObject({ goTo: { name: 'Home' }, stayIn: null, areas: [home] });
    await http.put('/v1/drivers/me/booking-preferences').set(auth).send({ areas: null }).expect(200);
    for (const d of [staying, other]) await http.post('/v1/drivers/me/offline').set('Authorization', `Bearer ${d}`);
  });

  it('parcel on bike: a bike driver takes a goods-bike parcel at its fare; one who turned parcels off is skipped', async () => {
    // In Peelamedu, well away from the first test's bike driver (still online at Gandhipuram).
    const PEELAMEDU = { lat: 11.0247, lng: 77.0028, name: 'Peelamedu' };
    const bike = await onlineDriver('BIKE', { lat: 11.0248, lng: 77.0029 });
    const farther = await onlineDriver('BIKE', { lat: 11.026, lng: 77.004 });
    const auth = { Authorization: `Bearer ${bike}` };
    // Only bikes are online: the goods bike still has a pickup ETA on the parcel vehicle list.
    const quotes = (await http.post('/v1/fares/quote').set(quoter).send({ pickup: PEELAMEDU, drop: BROOKEFIELDS, kind: 'PARCEL' }).expect(200)).body.quotes;
    const goodsBike = quotes.find((q: { vehicleKind: string }) => q.vehicleKind === 'GOODS_BIKE');
    expect(typeof goodsBike.pickupEtaMin).toBe('number');

    const pax = { Authorization: `Bearer ${await login()}` };
    const parcel = { kind: 'PARCEL', vehicleKind: 'GOODS_BIKE', pickup: PEELAMEDU, drop: BROOKEFIELDS };
    const trip = (await http.post('/v1/trips').set(pax).send(parcel).expect(201)).body;
    const accepted = await acceptWhenOffered(trip.id, bike);
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({ kind: 'PARCEL', vehicleKind: 'GOODS_BIKE', fareTotal: goodsBike.total });
    await http.post(`/v1/trips/${trip.id}/cancel`).set(pax).send({}).expect(200);

    // Parcels off: the closer bike driver is skipped, the other one takes it.
    expect((await http.put('/v1/drivers/me/booking-preferences').set(auth).send({ parcels: false }).expect(200)).body.parcels).toBe(false);
    const next = (await http.post('/v1/trips').set(pax).send(parcel).expect(201)).body;
    expect((await acceptWhenOffered(next.id, farther)).status).toBe(200);
    expect((await http.post(`/v1/trips/${next.id}/accept`).set(auth)).status).not.toBe(200);
    await http.post(`/v1/trips/${next.id}/cancel`).set(pax).send({}).expect(200);
    await http.put('/v1/drivers/me/booking-preferences').set(auth).send({ parcels: true }).expect(200);
    for (const d of [bike, farther]) await http.post('/v1/drivers/me/offline').set('Authorization', `Bearer ${d}`);
  });

  it('Parcel on Auto: an auto takes parcels only once switched on in Services, and not while paused', async () => {
    // Race Course, away from the other tests' drivers.
    const RACE_COURSE = { lat: 11.0005, lng: 76.9757, name: 'Race Course' };
    const auto = await onlineDriver('AUTO', { lat: 11.0006, lng: 76.9758 });
    const auth = { Authorization: `Bearer ${auto}` };
    const pax = { Authorization: `Bearer ${await login()}` };
    const parcel = { kind: 'PARCEL', vehicleKind: 'AUTO_PARCEL', pickup: RACE_COURSE, drop: BROOKEFIELDS };
    const quotes = (await http.post('/v1/fares/quote').set(quoter).send({ pickup: RACE_COURSE, drop: BROOKEFIELDS, kind: 'PARCEL' }).expect(200)).body.quotes;
    const autoParcel = quotes.find((q: { vehicleKind: string }) => q.vehicleKind === 'AUTO_PARCEL');
    expect(autoParcel).toBeDefined();

    // Off by default for autos: no offer.
    const first = (await http.post('/v1/trips').set(pax).send(parcel).expect(201)).body;
    expect((await http.post(`/v1/trips/${first.id}/accept`).set(auth)).status).not.toBe(200);
    await http.post(`/v1/trips/${first.id}/cancel`).set(pax).send({}).expect(200);

    // Switched on: the auto takes it as Parcel on Auto at its fare.
    expect((await http.put('/v1/drivers/me/services/parcels').set(auth).send({ on: true }).expect(200)).body.parcels).toBe(true);
    const trip = (await http.post('/v1/trips').set(pax).send(parcel).expect(201)).body;
    const accepted = await acceptWhenOffered(trip.id, auto);
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({ kind: 'PARCEL', vehicleKind: 'AUTO_PARCEL', fareTotal: autoParcel.total });
    await http.post(`/v1/trips/${trip.id}/cancel`).set(pax).send({}).expect(200);

    // Paused for 30 minutes, with a reason: skipped again. Rentals aren't an auto's service.
    const paused = (await http.put('/v1/drivers/me/services/parcels').set(auth).send({ on: false, pauseMinutes: 30, reason: 'Too far' }).expect(200)).body;
    expect(paused.pauses.parcels).toMatchObject({ reason: 'Too far' });
    const again = (await http.post('/v1/trips').set(pax).send(parcel).expect(201)).body;
    expect((await http.post(`/v1/trips/${again.id}/accept`).set(auth)).status).not.toBe(200);
    await http.post(`/v1/trips/${again.id}/cancel`).set(pax).send({}).expect(200);
    await http.put('/v1/drivers/me/services/rentals').set(auth).send({ on: false }).expect(400);
    await http.put('/v1/drivers/me/services/parcels').set(auth).send({ on: true }).expect(200);
    await http.post('/v1/drivers/me/offline').set(auth);
  });

  it('"Who\'s riding?": a father books Butterfly for his daughter; the driver sees her; reports switch it off', async () => {
    const woman = await onlineDriver('AUTO', { lat: 11.0186, lng: 76.9728 }, 'FEMALE');
    const father = await login(); // no gender set
    const pax = { Authorization: `Bearer ${father}` };
    const daughter = { name: 'Anjali', phone: '9876512345', isWoman: true };
    const book = { kind: 'RIDE', vehicleKind: 'AUTO', pickup: GANDHIPURAM, drop: BROOKEFIELDS, womenDriver: 'ONLY' };

    // Not a woman rider → refused; for a woman rider → booked with her details.
    await http.post('/v1/trips').set(pax).send({ ...book, rider: { ...daughter, isWoman: false } }).expect(400);
    await http.post('/v1/trips').set(pax).send({ ...book, rider: { ...daughter, phone: '123' } }).expect(400);
    const trip = (await http.post('/v1/trips').set(pax).send({ ...book, rider: daughter }).expect(201)).body;
    expect(trip).toMatchObject({ womenDriver: 'ONLY', riderName: 'Anjali', riderPhone: '+919876512345', riderIsWoman: true });

    // The driver's request card shows the rider, "booked by" the account holder, but no phone number before accepting.
    let offer: { passenger: Record<string, unknown>; trip: Record<string, unknown> } | null = null;
    for (let i = 0; i < 40 && !offer; i++) {
      const res = await http.get('/v1/trips/offer').set('Authorization', `Bearer ${woman}`);
      offer = res.status === 200 && res.body?.trip?.id === trip.id ? res.body : null;
      if (!offer) await new Promise((r) => setTimeout(r, 250));
    }
    expect(offer?.passenger).toMatchObject({ name: 'Anjali' });
    expect(offer?.passenger).not.toHaveProperty('phone');
    expect(offer?.trip.riderPhone).toBeNull();
    const open = (await http.get('/v1/trips/offers').set('Authorization', `Bearer ${woman}`).expect(200)).body as { passenger: object; trip: { riderPhone: unknown } }[];
    expect(open.every((o) => !('phone' in o.passenger) && o.trip.riderPhone === null)).toBe(true);
    // Once accepted: the rider's number and the account holder's, in the answer and on GET /trips/active.
    const accepted = await acceptWhenOffered(trip.id, woman);
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({ riderPhone: '+919876512345', passenger: { phone: expect.stringMatching(/^\+91\d{10}$/) }, otp: '' });
    expect((await http.get('/v1/trips/active').set('Authorization', `Bearer ${woman}`).expect(200)).body).toMatchObject({ id: trip.id, riderPhone: '+919876512345', passenger: { phone: expect.stringMatching(/^\+91/) } });
    // An older driver app sends only the reason text: it becomes the Butterfly-mismatch code (no fault).
    const reported = (await http.post(`/v1/trips/${trip.id}/cancel`).set('Authorization', `Bearer ${woman}`).send({ reason: 'Rider is not a woman' }).expect(200)).body;
    expect(reported).toMatchObject({ status: 'CANCELLED', cancelledBy: 'DRIVER', cancelCode: 'BUTTERFLY_MISMATCH', cancelReason: 'Rider is not a woman' });
    expect(await prisma.tripCancellation.findMany({ where: { tripId: trip.id } })).toMatchObject([{ by: 'DRIVER', code: 'BUTTERFLY_MISMATCH', isDriverFault: false, fault: 'PASSENGER', faultRule: 'butterfly_mismatch' }]);

    // A second report switches Butterfly-for-others off for this account (own rides are not affected by it).
    const second = (await http.post('/v1/trips').set(pax).send({ ...book, rider: daughter }).expect(201)).body;
    await prisma.trip.update({ where: { id: second.id }, data: { status: 'CANCELLED', cancelledBy: 'DRIVER', cancelCode: 'BUTTERFLY_MISMATCH' } });
    await http.post('/v1/trips').set(pax).send({ ...book, rider: daughter }).expect(403);
    const plain = (await http.post('/v1/trips').set(pax).send({ ...book, womenDriver: undefined, rider: daughter }).expect(201)).body;
    expect(plain.womenDriver).toBe('NONE');
    // On a ride that isn't Butterfly the report means nothing: it counts as OTHER and the ride finds another driver.
    expect((await acceptWhenOffered(plain.id, woman)).status).toBe(200);
    const dropped = (await http.post(`/v1/trips/${plain.id}/cancel`).set('Authorization', `Bearer ${woman}`).send({ code: 'BUTTERFLY_MISMATCH' }).expect(200)).body;
    expect(dropped.status).toBe('SEARCHING');
    expect(await prisma.tripCancellation.findMany({ where: { tripId: plain.id } })).toMatchObject([{ by: 'DRIVER', code: 'OTHER' }]);
    await http.post(`/v1/trips/${plain.id}/cancel`).set(pax).send({}).expect(200);
    await http.post('/v1/drivers/me/offline').set('Authorization', `Bearer ${woman}`);
  });

  it('add extra: the driver who said no gets the ride again at the higher fare', async () => {
    const cab = await onlineDriver('CAB', { lat: 11.0184, lng: 76.9726 });
    const auth = { Authorization: `Bearer ${cab}` };
    const pax = { Authorization: `Bearer ${await login()}` };
    const trip = (await http.post('/v1/trips').set(pax).send({ kind: 'RIDE', vehicleKind: 'CAB', pickup: GANDHIPURAM, drop: BROOKEFIELDS }).expect(201)).body;
    let offered = false;
    for (let i = 0; i < 40 && !offered; i++) {
      offered = (await http.get('/v1/trips/offer').set(auth)).body?.trip?.id === trip.id;
      if (!offered) await new Promise((r) => setTimeout(r, 250));
    }
    expect(offered).toBe(true);
    await http.post(`/v1/trips/${trip.id}/decline`).set(auth).expect(204);

    // Only more than before, within the cap; the fare shows the extra as its own line.
    const boosted = (await http.post(`/v1/trips/${trip.id}/extra`).set(pax).send({ amount: 20 }).expect(200)).body;
    expect(boosted).toMatchObject({ fareTotal: trip.fareTotal + 20, fare: { extra: 20, total: trip.fareTotal + 20 } });
    await http.post(`/v1/trips/${trip.id}/extra`).set(pax).send({ amount: 10 }).expect(400);
    await http.post(`/v1/trips/${trip.id}/extra`).set(pax).send({ amount: 500 }).expect(400);

    // The driver who declined is offered it again, at the new fare.
    const accepted = await acceptWhenOffered(trip.id, cab);
    expect(accepted.status).toBe(200);
    expect(accepted.body.fareTotal).toBe(trip.fareTotal + 20);
    await http.post(`/v1/trips/${trip.id}/extra`).set(pax).send({ amount: 30 }).expect(409);
    await http.post(`/v1/trips/${trip.id}/cancel`).set(pax).send({}).expect(200);
    await http.post('/v1/drivers/me/offline').set(auth);
  });

  it('"Book any": adds sent at the same moment keep the 3-vehicle cap and every fare', async () => {
    const pax = { Authorization: `Bearer ${await login()}` };
    const trip = (await http.post('/v1/trips').set(pax).send({ kind: 'RIDE', vehicleKind: 'CAB', pickup: GANDHIPURAM, drop: BROOKEFIELDS }).expect(201)).body;
    // Truly parallel requests need a listening server (supertest would otherwise start and stop one per request).
    const server = app.getHttpServer();
    if (!server.address()) await new Promise<void>((resolve) => server.listen(0, resolve));
    const kinds = ['SEDAN', 'SUV', 'AUTO', 'BIKE'];
    const answers = await Promise.all(kinds.map((vehicleKind) => request(server).post(`/v1/trips/${trip.id}/also`).set(pax).send({ vehicleKind })));
    expect(answers.filter((a) => a.status === 200)).toHaveLength(3);
    expect(answers.filter((a) => a.status !== 200).every((a) => a.status === 400 || a.status === 409)).toBe(true);
    const now = await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } });
    expect(now.alsoKinds).toHaveLength(3);
    expect(Object.keys(now.alsoFares as object).sort()).toEqual([...now.alsoKinds].sort());
    await http.post(`/v1/trips/${trip.id}/cancel`).set(pax).send({}).expect(200);
  });

  it('"Book any": a slow cab search adds Auto, and the auto driver takes it at the auto fare', async () => {
    // Arrange: no cab nearby, an auto driver at the pickup.
    const passenger = await login();
    const auto = await onlineDriver('AUTO', { lat: 11.0185, lng: 76.9727 });
    const pax = { Authorization: `Bearer ${passenger}` };
    const trip = (await http.post('/v1/trips').set(pax).send({ kind: 'RIDE', vehicleKind: 'CAB', pickup: GANDHIPURAM, drop: BROOKEFIELDS }).expect(201)).body;

    // Act
    const alts = (await http.get(`/v1/trips/${trip.id}/alternatives`).set(pax).expect(200)).body;
    const added = (await http.post(`/v1/trips/${trip.id}/also`).set(pax).send({ vehicleKind: 'AUTO' }).expect(200)).body;
    await http.post(`/v1/trips/${trip.id}/also`).set(pax).send({ vehicleKind: 'GOODS_BIKE' }).expect(400);
    const accepted = await acceptWhenOffered(trip.id, auto);
    expect(accepted.body.otp).toBe('');

    // Assert
    const autoAlt = alts.find((a: { vehicleKind: string }) => a.vehicleKind === 'AUTO');
    expect(autoAlt.quote.total).toBe(66);
    expect(autoAlt.driversNearby).toBeGreaterThan(0);
    expect(alts.map((a: { vehicleKind: string }) => a.vehicleKind)).not.toContain('CAB');
    expect(added.alsoKinds).toEqual(['AUTO']);
    expect(accepted.status).toBe(200);
    expect(accepted.body.vehicleKind).toBe('AUTO');
    expect(accepted.body.fareTotal).toBe(66);
    // A passenger cancel with a code and a note; a driver-only code from a passenger becomes OTHER.
    const cancelled = (await http.post(`/v1/trips/${trip.id}/cancel`).set(pax).send({ code: 'WAIT_TOO_LONG', note: 'Too slow' }).expect(200)).body;
    expect(cancelled).toMatchObject({ cancelledBy: 'PASSENGER', cancelCode: 'WAIT_TOO_LONG', cancelReason: 'Too slow' });
    expect(new Date(cancelled.cancelledAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
    await http.post(`/v1/trips/${trip.id}/cancel`).set(pax).send({ code: 'NOT_A_CODE' }).expect(400);
    const other = (await http.post('/v1/trips').set(pax).send({ kind: 'RIDE', vehicleKind: 'CAB', pickup: GANDHIPURAM, drop: BROOKEFIELDS }).expect(201)).body;
    expect((await http.post(`/v1/trips/${other.id}/cancel`).set(pax).send({ code: 'PASSENGER_NO_SHOW' }).expect(200)).body.cancelCode).toBe('OTHER');
  });

  it('widens the search radius: a cab 7 km away (outside the 5 km start) still gets the request', async () => {
    const settings = app.get(SettingsService);
    await settings.update({ searchRadiusKm: 5, maxSearchRadiusKm: 15, searchExpandSeconds: 4 });
    try {
      // Arrange: the only cab is ~7 km east of the pickup.
      const passenger = await login();
      const cab = await onlineDriver('CAB', { lat: 11.0183, lng: 77.0365 });
      const trip = (await http
        .post('/v1/trips')
        .set('Authorization', `Bearer ${passenger}`)
        .send({ kind: 'RIDE', vehicleKind: 'CAB', pickup: GANDHIPURAM, drop: BROOKEFIELDS })
        .expect(201)).body;

      // Act
      const accepted = await acceptWhenOffered(trip.id, cab);

      // Assert
      expect(accepted.status).toBe(200);
      expect(accepted.body.vehicleKind).toBe('CAB');
      await http.post(`/v1/trips/${trip.id}/cancel`).set('Authorization', `Bearer ${passenger}`).send({}).expect(200);
    } finally {
      await settings.update({ searchRadiusKm: 5, maxSearchRadiusKm: 15, searchExpandSeconds: 45 });
    }
  });

  it('stacked offers: one driver holds both requests, taking one releases the other; one active trip per driver', async () => {
    // Arrange: only this bike driver is indexed (earlier tests leave bikes online); two riders book bikes.
    const redis = app.get(RedisService);
    const settings = app.get(SettingsService);
    const cells = await redis.keys('h3:drv:BIKE:*');
    if (cells.length) await redis.del(...cells);
    const bike = await onlineDriver('BIKE', { lat: 11.0185, lng: 76.9727 });
    const auth = { Authorization: `Bearer ${bike}` };
    const driverId = (await http.get('/v1/drivers/me').set(auth).expect(200)).body.id as string;
    const book = { kind: 'RIDE', vehicleKind: 'BIKE', pickup: GANDHIPURAM, drop: BROOKEFIELDS };
    const [paxA, paxB] = [await login(), await login()];
    const a = (await http.post('/v1/trips').set('Authorization', `Bearer ${paxA}`).send(book).expect(201)).body;
    const b = (await http.post('/v1/trips').set('Authorization', `Bearer ${paxB}`).send(book).expect(201)).body;

    // Act: wait until both requests are open for the driver at once (maxOpenOffers 3).
    let open: string[] = [];
    for (let i = 0; i < 60 && open.length < 2; i++) {
      open = (await http.get('/v1/trips/offers').set(auth).expect(200)).body.map((o: { trip: { id: string } }) => o.trip.id);
      if (open.length < 2) await new Promise((r) => setTimeout(r, 250));
    }
    expect([...open].sort()).toEqual([a.id, b.id].sort());
    expect((await http.get('/v1/trips/offer').set(auth).expect(200)).body.trip.id).toBe(open[0]);

    // Assert: taking one hands the other straight back to dispatch; a second active trip is refused.
    const [taken, other] = [a.id, b.id];
    await http.post(`/v1/trips/${taken}/accept`).set(auth).expect(200);
    expect(await redis.get(`dispatch:${other}:offer`)).not.toBe(driverId);
    expect((await http.get('/v1/trips/offers').set(auth).expect(200)).body).toEqual([]);
    expect(await redis.ttl(`driver:busy:${driverId}`)).toBeGreaterThan(3600);
    await redis.set(`dispatch:${other}:offer`, driverId, 'EX', 20);
    const second = await http.post(`/v1/trips/${other}/accept`).set(auth).expect(409);
    expect(second.body.message).toBe('Finish your current trip first');
    await redis.del(`dispatch:${other}:offer`);

    // A cancel frees the driver for the other trip, which searches again every few seconds.
    await http.post(`/v1/trips/${taken}/cancel`).set('Authorization', `Bearer ${paxA}`).send({}).expect(200);
    expect(await redis.exists(`driver:busy:${driverId}`)).toBe(0);
    expect((await acceptWhenOffered(other, bike, 80)).status).toBe(200);
    await http.post(`/v1/trips/${other}/cancel`).set('Authorization', `Bearer ${paxB}`).send({}).expect(200);

    // maxOpenOffers 1: back to one request at a time.
    await settings.update({ maxOpenOffers: 1 });
    try {
      const c = (await http.post('/v1/trips').set('Authorization', `Bearer ${paxA}`).send(book).expect(201)).body;
      const d = (await http.post('/v1/trips').set('Authorization', `Bearer ${paxB}`).send(book).expect(201)).body;
      let one: string[] = [];
      for (let i = 0; i < 40 && one.length === 0; i++) {
        one = (await http.get('/v1/trips/offers').set(auth).expect(200)).body.map((o: { trip: { id: string } }) => o.trip.id);
        if (!one.length) await new Promise((r) => setTimeout(r, 250));
      }
      await new Promise((r) => setTimeout(r, 2500)); // another batch: still one
      expect((await http.get('/v1/trips/offers').set(auth).expect(200)).body).toHaveLength(1);
      await http.post(`/v1/trips/${c.id}/cancel`).set('Authorization', `Bearer ${paxA}`).send({}).expect(200);
      await http.post(`/v1/trips/${d.id}/cancel`).set('Authorization', `Bearer ${paxB}`).send({}).expect(200);
    } finally {
      await settings.update({ maxOpenOffers: 3 });
    }
    await http.post('/v1/drivers/me/offline').set(auth).expect(200);
  }, 60_000);

  it('ranks equidistant drivers by their 7-day offer record: the one who ignores offers is asked second', async () => {
    // Arrange: only these two bike drivers are indexed, at the same spot; one ignored most offers this week.
    const redis = app.get(RedisService);
    const cells = await redis.keys('h3:drv:BIKE:*');
    if (cells.length) await redis.del(...cells);
    const at = { lat: 11.0185, lng: 76.9727 };
    const [flaky, steady] = [await onlineDriver('BIKE', at), await onlineDriver('BIKE', at)];
    const idOf = async (t: string) => (await http.get('/v1/drivers/me').set('Authorization', `Bearer ${t}`).expect(200)).body.id as string;
    const [flakyId, steadyId] = [await idOf(flaky), await idOf(steady)];
    const today = statsKey(flakyId, Date.now()).slice(-8);
    await redis.hset(`drv:stats:${flakyId}:${today}`, { o: 20, a: 4, d: 6, i: 10 });
    await redis.hset(`drv:stats:${steadyId}:${today}`, { o: 20, a: 19, i: 1 });
    const since = String(Date.now());
    for (const id of [flakyId, steadyId]) await redis.set(`drv:onlineSince:${id}`, since, 'EX', 600);
    const pax = await login();
    const trip = (await http.post('/v1/trips').set('Authorization', `Bearer ${pax}`).send({ kind: 'RIDE', vehicleKind: 'BIKE', pickup: GANDHIPURAM, drop: BROOKEFIELDS }).expect(201)).body;
    const offerOf = async (t: string) => {
      const res = await http.get('/v1/trips/offer').set('Authorization', `Bearer ${t}`);
      return res.status === 200 ? ((res.body?.trip?.id as string | undefined) ?? null) : null;
    };

    // Act + assert: the steady driver gets it first; the flaky one only after the steady one declines.
    let first: string | null = null;
    for (let i = 0; i < 40 && !first; i++) {
      if ((await offerOf(steady)) === trip.id) first = steadyId;
      else if ((await offerOf(flaky)) === trip.id) first = flakyId;
      else await new Promise((r) => setTimeout(r, 250));
    }
    expect(first).toBe(steadyId);
    await http.post(`/v1/trips/${trip.id}/decline`).set('Authorization', `Bearer ${steady}`).expect((r) => expect(r.status).toBeLessThan(300));
    expect((await acceptWhenOffered(trip.id, flaky)).status).toBe(200);

    // The admin sees the counters: the decline and the accept were recorded.
    const admin = await adminAuth();
    const steadyStats = (await http.get(`/v1/admin/drivers/${steadyId}/offer-stats`).set(admin).expect(200)).body;
    expect(steadyStats).toMatchObject({ offered: 21, accepted: 19, declined: 1, isRanked: true, days: 7 });
    const flakyStats = (await http.get(`/v1/admin/drivers/${flakyId}/offer-stats`).set(admin).expect(200)).body;
    expect(flakyStats).toMatchObject({ offered: 21, accepted: 5 });
    await http.post(`/v1/trips/${trip.id}/cancel`).set('Authorization', `Bearer ${pax}`).send({}).expect(200);
    for (const d of [flaky, steady]) await http.post('/v1/drivers/me/offline').set('Authorization', `Bearer ${d}`).expect(200);
  }, 30_000);

  it('a driver cancel before pickup finds another driver; the reassign limit then cancels the trip', async () => {
    // Arrange: only these two bike drivers are indexed; one rider.
    const redis = app.get(RedisService);
    const settings = app.get(SettingsService);
    const cells = await redis.keys('h3:drv:BIKE:*');
    if (cells.length) await redis.del(...cells);
    const drivers = [await onlineDriver('BIKE', { lat: 11.0185, lng: 76.9727 }), await onlineDriver('BIKE', { lat: 11.0188, lng: 76.973 })];
    const pax = { Authorization: `Bearer ${await login()}` };
    const trip = (await http.post('/v1/trips').set(pax).send({ kind: 'RIDE', vehicleKind: 'BIKE', pickup: GANDHIPURAM, drop: BROOKEFIELDS }).expect(201)).body;
    /** Waits for whichever of [tokens] has the offer, accepts it, returns that driver's token. */
    const acceptByAnyone = async (tokens: string[]): Promise<string> => {
      for (let i = 0; i < 80; i++) {
        for (const t of tokens) {
          if ((await http.post(`/v1/trips/${trip.id}/accept`).set('Authorization', `Bearer ${t}`)).status === 200) return t;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      throw new Error('nobody got the offer');
    };
    await settings.update({ maxReassigns: 1 });
    try {
      // Act 1: the first driver arrives, then cancels with a code.
      const first = await acceptByAnyone(drivers);
      const firstId = (await http.get('/v1/drivers/me').set('Authorization', `Bearer ${first}`).expect(200)).body.id as string;
      await http.post(`/v1/trips/${trip.id}/arrived`).set('Authorization', `Bearer ${first}`).expect(200);
      const dropped = (await http.post(`/v1/trips/${trip.id}/cancel`).set('Authorization', `Bearer ${first}`).send({ code: 'VEHICLE_ISSUE' }).expect(200)).body;

      // Assert 1: back to searching without them; they are free, excluded, and the drop is on record.
      expect(dropped).toMatchObject({ status: 'SEARCHING', driverId: null, reassignCount: 1, arrivedAt: null, cancelledBy: null, otp: '' });
      expect((await http.get(`/v1/trips/${trip.id}`).set(pax).expect(200)).body.status).toBe('SEARCHING');
      expect(await redis.exists(`driver:busy:${firstId}`)).toBe(0);
      expect(await redis.sismember(`dispatch:${trip.id}:excluded`, firstId)).toBe(1);
      expect(await prisma.tripCancellation.findMany({ where: { tripId: trip.id } })).toMatchObject([
        { by: 'DRIVER', code: 'VEHICLE_ISSUE', driverId: firstId, fromStatus: 'DRIVER_ARRIVED', reassigned: true, isDriverFault: true, fault: 'DRIVER', faultRule: 'driver_after_arrival' },
      ]);
      // The rider adds extra: drivers who said no may get it again, the one who dropped it still not.
      await http.post(`/v1/trips/${trip.id}/extra`).set(pax).send({ amount: 10 }).expect(200);
      expect(await redis.sismember(`dispatch:${trip.id}:excluded`, firstId)).toBe(1);

      // Act 2: the other driver gets it (never the one who dropped it), then cancels too: the limit is reached.
      const second = await acceptByAnyone(drivers);
      expect(second).not.toBe(first);
      const ended = (await http.post(`/v1/trips/${trip.id}/cancel`).set('Authorization', `Bearer ${second}`).send({ code: 'TOO_FAR' }).expect(200)).body;

      // Assert 2: cancelled by the system; the history keeps both drivers' reasons.
      expect(ended).toMatchObject({ status: 'CANCELLED', cancelledBy: 'SYSTEM', cancelCode: 'NO_DRIVERS' });
      const history = await prisma.tripCancellation.findMany({ where: { tripId: trip.id }, orderBy: { createdAt: 'asc' } });
      expect(history.map((h) => [h.code, h.reassigned])).toEqual([['VEHICLE_ISSUE', true], ['TOO_FAR', false]]);
    } finally {
      await settings.update({ maxReassigns: 2 });
      for (const d of drivers) await http.post('/v1/drivers/me/offline').set('Authorization', `Bearer ${d}`);
    }
  }, 60_000);

  /** Only this bike driver is indexed, online at [at]; a new rider books a bike ride and the driver accepts it. */
  async function assignedBikeTrip(at: { lat: number; lng: number }) {
    const redis = app.get(RedisService);
    const cells = await redis.keys('h3:drv:BIKE:*');
    if (cells.length) await redis.del(...cells);
    const token = await onlineDriver('BIKE', at);
    const driver = { Authorization: `Bearer ${token}` };
    const driverId = (await http.get('/v1/drivers/me').set(driver).expect(200)).body.id as string;
    const pax = { Authorization: `Bearer ${await login()}` };
    const trip = (await http.post('/v1/trips').set(pax).send({ kind: 'RIDE', vehicleKind: 'BIKE', pickup: GANDHIPURAM, drop: BROOKEFIELDS }).expect(201)).body;
    expect((await acceptWhenOffered(trip.id, token)).status).toBe(200);
    return { trip, driver, driverId, pax };
  }

  it('no-show: the driver may cancel without fault only after waiting at the pickup', async () => {
    const jobs = app.get(JobsService);
    const { trip, driver, pax } = await assignedBikeTrip({ lat: 11.0185, lng: 76.9727 });
    expect(await jobs.scheduledAt('trip.pickup-progress', trip.id)).not.toBeNull();

    // Too early: before arriving, and right after.
    const early = await http.post(`/v1/trips/${trip.id}/cancel`).set(driver).send({ code: 'PASSENGER_NO_SHOW' }).expect(400);
    expect(early.body.code).toBe('NO_SHOW_TOO_EARLY');
    const arrived = (await http.post(`/v1/trips/${trip.id}/arrived`).set(driver).expect(200)).body;
    expect(new Date(arrived.noShowAt).getTime() - new Date(arrived.arrivedAt).getTime()).toBe(5 * 60_000);
    expect(await jobs.scheduledAt('trip.pickup-progress', trip.id)).toBeNull();
    expect(await jobs.scheduledAt('trip.no-show', trip.id)).toBe(new Date(arrived.noShowAt).getTime());
    const wait = await http.post(`/v1/trips/${trip.id}/cancel`).set(driver).send({ code: 'PASSENGER_NO_SHOW' }).expect(400);
    expect(wait.body.details.retryInSeconds).toBeGreaterThan(250);

    // The wait is over (the job fires, then the clock moves past noShowAt): cancelled, not held against the driver.
    expect(await jobs.runDue(new Date(arrived.noShowAt).getTime())).toBeGreaterThanOrEqual(1);
    await prisma.trip.update({ where: { id: trip.id }, data: { noShowAt: new Date(Date.now() - 1000) } });
    const done = (await http.post(`/v1/trips/${trip.id}/cancel`).set(driver).send({ code: 'PASSENGER_NO_SHOW' }).expect(200)).body;
    expect(done).toMatchObject({ status: 'CANCELLED', cancelledBy: 'DRIVER', cancelCode: 'PASSENGER_NO_SHOW' });
    expect(await prisma.tripCancellation.findFirst({ where: { tripId: trip.id } })).toMatchObject({ reassigned: false, isDriverFault: false, fault: 'PASSENGER', faultRule: 'passenger_no_show' });
    for (const kind of ['trip.no-show', 'trip.pickup-cap', 'trip.pickup-progress']) expect(await jobs.scheduledAt(kind, trip.id)).toBeNull();
    expect((await http.get(`/v1/trips/${trip.id}`).set(pax).expect(200)).body.status).toBe('CANCELLED');
    await http.post('/v1/drivers/me/offline').set(driver);
  }, 45_000);

  it('stores a fault verdict with its signals on every cancellation', async () => {
    const verdictOf = async (tripId: string) =>
      (await prisma.tripCancellation.findFirstOrThrow({ where: { tripId }, orderBy: { createdAt: 'desc' } }));
    // A passenger cancel right after accept: nobody's fault.
    const early = await assignedBikeTrip({ lat: 11.0185, lng: 76.9727 });
    await http.post(`/v1/trips/${early.trip.id}/cancel`).set(early.pax).send({ code: 'CHANGED_MIND' }).expect(200);
    const e = await verdictOf(early.trip.id);
    expect(e).toMatchObject({ fault: 'NONE', faultRule: 'early_passenger_cancel', isDriverFault: false });
    expect(e.signals).toMatchObject({ by: 'PASSENGER', hasDriver: true, isArrived: false, isMovingAway: false });
    await http.post('/v1/drivers/me/offline').set(early.driver);

    // The driver arrived and waited 4 min, then the passenger cancels: the passenger's fault.
    const late = await assignedBikeTrip({ lat: 11.0185, lng: 76.9727 });
    await http.post(`/v1/trips/${late.trip.id}/arrived`).set(late.driver).expect(200);
    await prisma.trip.update({ where: { id: late.trip.id }, data: { arrivedAt: new Date(Date.now() - 240_000), assignedAt: new Date(Date.now() - 600_000) } });
    await http.post(`/v1/trips/${late.trip.id}/cancel`).set(late.pax).send({ code: 'CHANGED_MIND' }).expect(200);
    const l = await verdictOf(late.trip.id);
    expect(l).toMatchObject({ fault: 'PASSENGER', faultRule: 'passenger_after_wait' });
    expect((l.signals as { waitedSec: number }).waitedSec).toBeGreaterThanOrEqual(240);
    await http.post('/v1/drivers/me/offline').set(late.driver);

    // The admin trip page gets the verdicts.
    const admin = await adminAuth();
    const detail = (await http.get(`/v1/admin/trips/${late.trip.id}`).set(admin).expect(200)).body;
    expect(detail.cancellations).toMatchObject([{ fault: 'PASSENGER', faultRule: 'passenger_after_wait' }]);
  }, 45_000);

  it('cancellation fee (off by default): owed after a late passenger cancel, collected on the next ride', async () => {
    const settings = app.get(SettingsService);
    const redis = app.get(RedisService);
    /** The driver arrived 4 min ago (accepted 10 min ago) on [tripId]. */
    const waitedFourMin = (tripId: string) =>
      prisma.trip.update({ where: { id: tripId }, data: { arrivedAt: new Date(Date.now() - 240_000), assignedAt: new Date(Date.now() - 600_000) } });

    // Off (the default): a late cancel owes nothing.
    const off = await assignedBikeTrip({ lat: 11.0185, lng: 76.9727 });
    await http.post(`/v1/trips/${off.trip.id}/arrived`).set(off.driver).expect(200);
    await waitedFourMin(off.trip.id);
    await http.post(`/v1/trips/${off.trip.id}/cancel`).set(off.pax).send({ code: 'CHANGED_MIND' }).expect(200);
    expect(await prisma.cancellationDue.count({ where: { tripId: off.trip.id } })).toBe(0);
    await http.post('/v1/drivers/me/offline').set(off.driver);

    // Fares are compared to the plain quote: the suite's bookings at Gandhipuram can surge it (depending on when the
    // demand tick runs), so live surge is off while this runs.
    await settings.update({ cancellationFeeEnabled: true, dynamicSurgeEnabled: false });
    try {
      // The passenger cancels after the driver waited: ₹10 owed to that driver.
      const first = await assignedBikeTrip({ lat: 11.0185, lng: 76.9727 });
      await http.post(`/v1/trips/${first.trip.id}/arrived`).set(first.driver).expect(200);
      await waitedFourMin(first.trip.id);
      await http.post(`/v1/trips/${first.trip.id}/cancel`).set(first.pax).send({ code: 'CHANGED_MIND' }).expect(200);
      const due = await prisma.cancellationDue.findFirstOrThrow({ where: { tripId: first.trip.id } });
      expect(due).toMatchObject({ owedToDriverId: first.driverId, amount: 10, status: 'PENDING', appliedTripId: null });
      await http.post('/v1/drivers/me/offline').set(first.driver);

      // Their next ride, with another driver, carries it as its own line; that driver collects it.
      const cells = await redis.keys('h3:drv:BIKE:*');
      if (cells.length) await redis.del(...cells);
      const next = await onlineDriver('BIKE', { lat: 11.0185, lng: 76.9727 });
      const nextAuth = { Authorization: `Bearer ${next}` };
      const trip = (await http.post('/v1/trips').set(first.pax).send({ kind: 'RIDE', vehicleKind: 'BIKE', pickup: GANDHIPURAM, drop: BROOKEFIELDS }).expect(201)).body;
      expect(trip.fareTotal).toBe(35); // not in the quote: added at completion
      expect((await acceptWhenOffered(trip.id, next)).status).toBe(200);
      await http.post(`/v1/trips/${trip.id}/arrived`).set(nextAuth).expect(200);
      await http.post(`/v1/trips/${trip.id}/start`).set(nextAuth).send({ otp: trip.otp }).expect(200);
      await http.post('/v1/drivers/me/location').set(nextAuth).send({ lat: BROOKEFIELDS.lat, lng: BROOKEFIELDS.lng }).expect(204);
      const done = (await http.post(`/v1/trips/${trip.id}/complete`).set(nextAuth).send({}).expect(200)).body;
      expect(done).toMatchObject({ fareTotal: 45, fare: { previousCancellationFee: 10, total: 45, subtotal: 35 } });
      expect(await prisma.cancellationDue.findUniqueOrThrow({ where: { id: due.id } })).toMatchObject({ status: 'APPLIED', appliedTripId: trip.id });

      // The admin report shows who it was owed to and the ride that collected it.
      const admin = await adminAuth();
      const report = (await http.get('/v1/admin/cancellation-dues?status=APPLIED').set(admin).expect(200)).body;
      expect(report.items.find((d: { id: string }) => d.id === due.id)).toMatchObject({
        amount: 10,
        owedTo: { id: first.driverId },
        appliedTrip: { id: trip.id },
      });
      expect(report.totals.applied).toBeGreaterThanOrEqual(10);
      await http.post('/v1/drivers/me/offline').set(nextAuth);
    } finally {
      await settings.update({ cancellationFeeEnabled: false, dynamicSurgeEnabled: true });
    }
  }, 60_000);

  it('nudges, then pauses a driver who cancels too often; the pause ends by the job or an admin', async () => {
    const settings = app.get(SettingsService);
    const redis = app.get(RedisService);
    const jobs = app.get(JobsService);
    const cells = await redis.keys('h3:drv:BIKE:*');
    if (cells.length) await redis.del(...cells);
    const at = { lat: 11.0185, lng: 76.9727 };
    const token = await onlineDriver('BIKE', at);
    const driver = { Authorization: `Bearer ${token}` };
    const driverId = (await http.get('/v1/drivers/me').set(driver).expect(200)).body.id as string;
    const pax = { Authorization: `Bearer ${await login()}` };
    const passengerId = (await http.get('/v1/me').set(pax).expect(200)).body.id as string;
    // Two rides this week that went fine (made directly, as completed trips).
    const done = { kind: 'RIDE' as const, vehicleKind: 'BIKE' as const, passengerId, driverId, status: 'COMPLETED' as const, fare: {}, fareTotal: 35, otp: '1234' };
    const place = { pickupName: 'A', pickupAddr: '', pickupLat: 11.0183, pickupLng: 76.9725, dropName: 'B', dropAddr: '', dropLat: 11.009, dropLng: 76.96, distanceKm: 4.2, durationMin: 14 };
    for (let i = 0; i < 2; i++) await prisma.trip.create({ data: { ...done, ...place, assignedAt: new Date(), endedAt: new Date() } });
    /** Books a bike ride, this driver accepts it and drops it (it searches again; the rider then gives up). */
    const acceptAndDrop = async () => {
      const trip = (await http.post('/v1/trips').set(pax).send({ kind: 'RIDE', vehicleKind: 'BIKE', pickup: GANDHIPURAM, drop: BROOKEFIELDS }).expect(201)).body;
      expect((await acceptWhenOffered(trip.id, token)).status).toBe(200);
      await http.post(`/v1/trips/${trip.id}/cancel`).set(driver).send({ code: 'VEHICLE_ISSUE' }).expect(200);
      await http.post(`/v1/trips/${trip.id}/cancel`).set(pax).send({ code: 'WAIT_TOO_LONG' }).expect(200);
    };
    /** The rate check runs in the background after the cancel. */
    const rate = async (want: string) => {
      let r = (await http.get('/v1/drivers/me/cancel-rate').set(driver).expect(200)).body;
      for (let i = 0; i < 20 && r.level !== want; i++) {
        await new Promise((res) => setTimeout(res, 100));
        r = (await http.get('/v1/drivers/me/cancel-rate').set(driver).expect(200)).body;
      }
      return r;
    };
    await settings.update({ cancelRateMinTrips: 3 });
    try {
      // 1 of 3: 33 % → a nudge (push once a day) and the banner text.
      await acceptAndDrop();
      const nudged = await rate('NUDGE');
      expect(nudged).toMatchObject({ cancelled: 1, assigned: 3, level: 'NUDGE', blockedUntil: null });
      expect(nudged.message.title).toBe("You've cancelled 1 of your last 3 rides");
      for (let i = 0; i < 20 && !(await redis.exists(`driver:cancel-nudged:${driverId}`)); i++) await new Promise((res) => setTimeout(res, 100));
      expect(await redis.exists(`driver:cancel-nudged:${driverId}`)).toBe(1);

      // 2 of 4: 50 % → paused for 24 h: offline, can't go online, skipped by dispatch, unblock job at the end.
      await acceptAndDrop();
      let paused = await prisma.driver.findUniqueOrThrow({ where: { id: driverId } });
      for (let i = 0; i < 20 && !paused.blockedUntil; i++) {
        await new Promise((res) => setTimeout(res, 100));
        paused = await prisma.driver.findUniqueOrThrow({ where: { id: driverId } });
      }
      const until = paused.blockedUntil!.getTime();
      expect(until - Date.now()).toBeGreaterThan(23.9 * 3_600_000);
      expect(paused.isOnline).toBe(false);
      expect(await prisma.driverBlock.findMany({ where: { driverId } })).toMatchObject([{ reason: 'CANCELLATION_RATE', details: { cancelled: 2, assigned: 4 } }]);
      expect(await jobs.scheduledAt('driver.unblock', driverId)).toBe(until);
      expect(Number(await redis.get(`driver:tblock:${driverId}`))).toBe(until);
      const refused = await http.post('/v1/drivers/me/online').set(driver).send(at).expect(403);
      expect(refused.body).toMatchObject({ code: 'DRIVER_TEMP_BLOCKED', details: { until: new Date(until).toISOString() } });
      expect((await http.get('/v1/drivers/me/cancel-rate').set(driver).expect(200)).body.blockedUntil).toBe(new Date(until).toISOString());

      // The job at the end lifts it: online again, and counting starts over.
      await jobs.runDue(until);
      expect((await prisma.driver.findUniqueOrThrow({ where: { id: driverId } })).blockedUntil).toBeNull();
      expect(await redis.exists(`driver:tblock:${driverId}`)).toBe(0);
      await http.post('/v1/drivers/me/online').set(driver).send(at).expect(200);

      // Paused again this week → 72 h; an admin lifts it (audit logged).
      const trip = await prisma.trip.findFirstOrThrow({ where: { driverId } });
      await prisma.tripCancellation.createMany({
        data: Array.from({ length: 3 }, () => ({ tripId: trip.id, driverId, passengerId, by: 'DRIVER' as const, code: 'TOO_FAR' as const, fromStatus: 'DRIVER_ASSIGNED' as const, reassigned: true, isDriverFault: true, fault: 'DRIVER' as const })),
      });
      await prisma.driverBlock.updateMany({ where: { driverId }, data: { untilAt: new Date(Date.now() - 60_000) } }); // so the window starts before these rows
      // A request open for them when the pause starts goes to the next driver; accepting is refused while paused.
      const rider = { Authorization: `Bearer ${await login()}` };
      const waiting = (await http.post('/v1/trips').set(rider).send({ kind: 'RIDE', vehicleKind: 'BIKE', pickup: GANDHIPURAM, drop: BROOKEFIELDS }).expect(201)).body;
      let offered = false;
      for (let i = 0; i < 40 && !offered; i++) {
        offered = (await http.get('/v1/trips/offer').set(driver)).body?.trip?.id === waiting.id;
        if (!offered) await new Promise((res) => setTimeout(res, 250));
      }
      expect(offered).toBe(true);
      expect(await app.get(DriverBlocksService).afterCancel(driverId)).toBe('BLOCK');
      const again = (await prisma.driver.findUniqueOrThrow({ where: { id: driverId } })).blockedUntil!.getTime();
      expect(again - Date.now()).toBeGreaterThan(71.9 * 3_600_000);
      expect(await redis.zcard(`dispatch:driver:${driverId}:offers`)).toBe(0);
      expect(await redis.get(`dispatch:${waiting.id}:offer`)).not.toBe(driverId);
      await redis.set(`dispatch:${waiting.id}:offer`, driverId, 'EX', 20); // even with the offer still theirs
      expect((await http.post(`/v1/trips/${waiting.id}/accept`).set(driver).expect(403)).body.code).toBe('DRIVER_TEMP_BLOCKED');
      await redis.del(`dispatch:${waiting.id}:offer`);
      await http.post(`/v1/trips/${waiting.id}/cancel`).set(rider).send({}).expect(200);
      const admin = await adminAuth();
      const detail = (await http.get(`/v1/admin/drivers/${driverId}`).set(admin).expect(200)).body;
      expect(detail.blocks).toHaveLength(2);
      expect(detail.cancelRate.blockedUntil).not.toBeNull();
      const lifted = (await http.post(`/v1/admin/drivers/${driverId}/lift-block`).set(admin).expect(201)).body;
      expect(lifted.liftedAt).not.toBeNull();
      await http.post(`/v1/admin/drivers/${driverId}/lift-block`).set(admin).expect(409);
      expect(await jobs.scheduledAt('driver.unblock', driverId)).toBeNull();
      expect(await prisma.auditLog.count({ where: { action: { contains: 'lift-block' }, entityId: driverId } })).toBeGreaterThanOrEqual(1);
      await http.post('/v1/drivers/me/online').set(driver).send(at).expect(200);

      // Passengers are only measured (admin user page), never blocked.
      const user = (await http.get(`/v1/admin/users/${passengerId}`).set(admin).expect(200)).body;
      expect(user.cancelRate).toMatchObject({ cancelled: 2 });
      expect(user.cancelRate.booked).toBeGreaterThanOrEqual(4);
    } finally {
      await settings.update({ cancelRateMinTrips: 5 });
      await http.post('/v1/drivers/me/offline').set(driver);
    }
  }, 90_000);

  it('charges waiting past the free minutes at start, as its own fare line (not surged)', async () => {
    // The suite's bookings at Gandhipuram can surge it, depending on when the demand tick runs: this test is about
    // waiting, so live surge is off while it runs.
    const settings = app.get(SettingsService);
    await settings.update({ dynamicSurgeEnabled: false });
    try {
      await waitingCharges();
    } finally {
      await settings.update({ dynamicSurgeEnabled: true });
    }
  }, 45_000);

  async function waitingCharges(): Promise<void> {
    const { trip, driver } = await assignedBikeTrip({ lat: 11.0185, lng: 76.9727 });
    expect(trip.fare).toMatchObject({ waitingCharge: 0, freeWaitMin: 3, waitPerMin: 1, waitMaxCharge: 30 });
    await http.post(`/v1/trips/${trip.id}/arrived`).set(driver).expect(200);
    // The driver has been waiting 5 min 30 s: 3 free, then 3 started minutes at ₹1.
    await prisma.trip.update({ where: { id: trip.id }, data: { arrivedAt: new Date(Date.now() - 330_000) } });
    const started = (await http.post(`/v1/trips/${trip.id}/start`).set(driver).send({ otp: trip.otp }).expect(200)).body;
    expect(started.fare).toMatchObject({ waitingCharge: 3, total: 38, subtotal: 35, peakCharge: 0 });
    expect(started.fareTotal).toBe(38);
    // A retried start doesn't charge again.
    expect((await http.post(`/v1/trips/${trip.id}/start`).set(driver).send({ otp: trip.otp }).expect(200)).body.fareTotal).toBe(38);
    await http.post('/v1/drivers/me/location').set(driver).send({ lat: BROOKEFIELDS.lat, lng: BROOKEFIELDS.lng }).expect(204);
    await http.post(`/v1/trips/${trip.id}/complete`).set(driver).send({}).expect(200);
    const earnings = (await http.get('/v1/drivers/me/earnings?period=today').set(driver).expect(200)).body;
    expect(earnings.trips.find((t: { id: string }) => t.id === trip.id)).toMatchObject({ fare: 38, waitingCharge: 3 });

    // Started within the free minutes: no charge.
    const quick = await assignedBikeTrip({ lat: 11.0185, lng: 76.9727 });
    await http.post(`/v1/trips/${quick.trip.id}/arrived`).set(quick.driver).expect(200);
    const q = (await http.post(`/v1/trips/${quick.trip.id}/start`).set(quick.driver).send({ otp: quick.trip.otp }).expect(200)).body;
    expect(q).toMatchObject({ fareTotal: 35, fare: { waitingCharge: 0 } });
    await http.post('/v1/drivers/me/location').set(quick.driver).send({ lat: BROOKEFIELDS.lat, lng: BROOKEFIELDS.lng }).expect(204);
    await http.post(`/v1/trips/${quick.trip.id}/complete`).set(quick.driver).send({}).expect(200);
    for (const d of [driver, quick.driver]) await http.post('/v1/drivers/me/offline').set(d);
  }

  it('a driver who is not moving is nudged, then the ride goes to another driver', async () => {
    const jobs = app.get(JobsService);
    const redis = app.get(RedisService);
    // ~1.5 km east of the pickup, and staying there.
    const { trip, driver, driverId, pax } = await assignedBikeTrip({ lat: 11.0183, lng: 76.9862 });
    const accepted = await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } });
    expect(accepted.acceptDistanceM).toBeGreaterThan(1300);
    const firstCheck = await jobs.scheduledAt('trip.pickup-progress', trip.id);
    expect(firstCheck! - accepted.assignedAt!.getTime()).toBeGreaterThanOrEqual(3 * 60_000);

    // First check: nudge and check again. Second: the trip goes back to searching without them.
    await jobs.runDue(firstCheck!);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })).status).toBe('DRIVER_ASSIGNED');
    const recheck = await jobs.scheduledAt('trip.pickup-progress', trip.id);
    expect(recheck).not.toBeNull();
    await http.post('/v1/drivers/me/location').set(driver).send({ lat: 11.0183, lng: 76.9862 }).expect(204);
    await jobs.runDue(recheck!);

    const now = await prisma.trip.findUniqueOrThrow({ where: { id: trip.id }, include: { cancellations: true } });
    expect(now).toMatchObject({ status: 'SEARCHING', driverId: null, reassignCount: 1 });
    expect(now.cancellations).toMatchObject([{ by: 'SYSTEM', code: 'DRIVER_NOT_MOVING', driverId, reassigned: true, isDriverFault: true, fault: 'DRIVER' }]);
    expect(await redis.exists(`driver:busy:${driverId}`)).toBe(0);
    await http.post(`/v1/trips/${trip.id}/cancel`).set(pax).send({ code: 'WAIT_TOO_LONG' }).expect(200);
    await http.post('/v1/drivers/me/offline').set(driver);
  }, 45_000);

  it('flags a started trip that runs far too long, and cancels one never started (safety net)', async () => {
    const jobs = app.get(JobsService);
    const { trip, driver } = await assignedBikeTrip({ lat: 11.0185, lng: 76.9727 });

    // Never started: the pickup cap cancels it (by the system).
    const cap = await jobs.scheduledAt('trip.pickup-cap', trip.id);
    expect(cap! - Date.now()).toBeGreaterThan(55 * 60_000);
    await app.get(RedisService).zadd('jobs:due', Date.now() - 1, `trip.pickup-cap|${trip.id}`);
    await jobs.runDue();
    expect(await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })).toMatchObject({ status: 'CANCELLED', cancelledBy: 'SYSTEM', cancelCode: 'STUCK' });
    await http.post('/v1/drivers/me/offline').set(driver);

    // Started and still running long after its estimate: flagged for admins, never completed.
    const second = await assignedBikeTrip({ lat: 11.0185, lng: 76.9727 });
    await http.post(`/v1/trips/${second.trip.id}/arrived`).set(second.driver).expect(200);
    await http.post(`/v1/trips/${second.trip.id}/start`).set(second.driver).send({ otp: second.trip.otp }).expect(200);
    const stuck = await jobs.scheduledAt('trip.stuck', second.trip.id);
    expect(stuck! - Date.now()).toBeGreaterThan(115 * 60_000);
    expect(await jobs.scheduledAt('trip.no-show', second.trip.id)).toBeNull();
    await app.get(RedisService).zadd('jobs:due', Date.now() - 1, `trip.stuck|${second.trip.id}`);
    await jobs.runDue();
    expect(await prisma.trip.findUniqueOrThrow({ where: { id: second.trip.id } })).toMatchObject({ status: 'IN_PROGRESS', needsReview: true });
    await http.post('/v1/drivers/me/location').set(second.driver).send({ lat: BROOKEFIELDS.lat, lng: BROOKEFIELDS.lng }).expect(204);
    await http.post(`/v1/trips/${second.trip.id}/complete`).set(second.driver).send({}).expect(200);
    expect(await jobs.scheduledAt('trip.stuck', second.trip.id)).toBeNull();
    await http.post('/v1/drivers/me/offline').set(second.driver);
  }, 60_000);

  /** [n] fixes from [from] to [to], 5 s apart, the last one [endAgoMs] before now. */
  function streamed(from: { lat: number; lng: number }, to: { lat: number; lng: number }, n: number, extra: Record<string, unknown> = {}, endAgoMs = 0) {
    const t0 = Date.now() - endAgoMs - (n - 1) * 5000;
    return Array.from({ length: n }, (_, i) => ({
      lat: from.lat + ((to.lat - from.lat) * i) / (n - 1),
      lng: from.lng + ((to.lng - from.lng) * i) / (n - 1),
      ts: t0 + i * 5000,
      acc: 6,
      ...extra,
    }));
  }

  it('records the trip path and stores the actual distance at completion', async () => {
    const redis = app.get(RedisService);
    const start = { lat: 11.0215, lng: 76.9725 }; // ~350 m north of the pickup
    const { trip, driver } = await assignedBikeTrip(start);
    expect(await redis.get(`trip:phase:${trip.id}`)).toBe('p');
    // To the pickup (live fixes), arrive, start.
    // (Stamped before the ride's fixes below, which are sent as if buffered over the last 2.5 min.)
    for (const f of streamed(start, GANDHIPURAM, 4, {}, 150_000)) await http.post('/v1/drivers/me/location').set(driver).send(f).expect(204);
    await http.post(`/v1/trips/${trip.id}/arrived`).set(driver).expect(200);
    await http.post(`/v1/trips/${trip.id}/start`).set(driver).send({ otp: trip.otp }).expect(200);
    expect(await redis.get(`trip:phase:${trip.id}`)).toBe('t');
    // The ride, flushed as one batch after an outage: plus a vague fix (dropped) and a GPS jump (filtered).
    const ride = streamed(GANDHIPURAM, BROOKEFIELDS, 30);
    const extras = [
      { ...ride[10], ts: ride[10].ts + 1000, lat: ride[10].lat + 0.001, acc: 120 },
      { ...ride[20], ts: ride[20].ts + 1000, lat: ride[20].lat + 0.05 },
    ];
    expect((await http.post('/v1/drivers/me/locations').set(driver).send({ fixes: [...ride, ...extras] }).expect(200)).body).toEqual({ accepted: 32, isLive: true });
    expect(await redis.llen(`trip:pts:${trip.id}`)).toBe(4 + 31);
    const done = (await http.post(`/v1/trips/${trip.id}/complete`).set(driver).send({}).expect(200)).body;

    const straight = haversineMeters(GANDHIPURAM, BROOKEFIELDS);
    expect(Math.abs(done.actualDistanceM - straight)).toBeLessThan(15);
    expect(done).toMatchObject({ gpsPoints: 30, gpsMockCount: 0, distanceCalcFailed: false, needsReview: false });
    expect(Math.abs(done.approachDistanceM - haversineMeters(start, GANDHIPURAM))).toBeLessThan(15);
    expect(done.pathPolyline.length).toBeGreaterThan(4);
    expect(done.pathPolyline.length).toBeLessThan(40); // a straight line simplifies to its ends
    for (const k of ['pts', 'phase', 'ptmeta']) expect(await redis.exists(`trip:${k}:${trip.id}`)).toBe(0);
    await http.post('/v1/drivers/me/offline').set(driver);
  }, 45_000);

  it('flags a trip with mock GPS fixes or no measurable distance for review; an admin clears it', async () => {
    const admin = await adminAuth();
    const { trip, driver } = await assignedBikeTrip({ lat: 11.0185, lng: 76.9727 });
    await http.post(`/v1/trips/${trip.id}/arrived`).set(driver).expect(200);
    await http.post(`/v1/trips/${trip.id}/start`).set(driver).send({ otp: trip.otp }).expect(200);
    // A fake-location app: the fixes say mock. The fare stays the quote.
    await http.post('/v1/drivers/me/locations').set(driver).send({ fixes: streamed(GANDHIPURAM, BROOKEFIELDS, 20, { mock: true }) }).expect(200);
    const done = (await http.post(`/v1/trips/${trip.id}/complete`).set(driver).send({}).expect(200)).body;
    expect(done).toMatchObject({ needsReview: true, gpsMockCount: 20, distanceCalcFailed: false, fareTotal: trip.fareTotal });
    expect(done.reviewNote).toContain('Mock GPS: 20 fixes');
    // The admin list and filter show it (without the path); the admin clears it with a note.
    const flagged = (await http.get('/v1/admin/trips?review=true&pageSize=100').set(admin).expect(200)).body.items;
    const row = flagged.find((t: { id: string }) => t.id === trip.id);
    expect(row).toBeDefined();
    expect(row.pathPolyline).toBeUndefined();
    const cleared = (await http.patch(`/v1/admin/trips/${trip.id}/review`).set(admin).send({ needsReview: false, note: 'Checked with driver' }).expect(200)).body;
    expect(cleared.needsReview).toBe(false);
    expect(cleared.reviewNote).toMatch(/Mock GPS: 20 fixes.*; Reviewed: Checked with driver$/);
    expect((await http.get(`/v1/admin/trips/${trip.id}`).set(admin).expect(200)).body.pathPolyline).toBeTruthy();
    await http.post('/v1/drivers/me/offline').set(driver);

    // No GPS during the ride (old app, socket down): the distance can't be measured → flagged.
    const second = await assignedBikeTrip({ lat: 11.0185, lng: 76.9727 });
    await http.post(`/v1/trips/${second.trip.id}/arrived`).set(second.driver).expect(200);
    await http.post(`/v1/trips/${second.trip.id}/start`).set(second.driver).send({ otp: second.trip.otp }).expect(200);
    await http.post('/v1/drivers/me/location').set(second.driver).send({ lat: BROOKEFIELDS.lat, lng: BROOKEFIELDS.lng }).expect(204);
    const blind = (await http.post(`/v1/trips/${second.trip.id}/complete`).set(second.driver).send({}).expect(200)).body;
    expect(blind).toMatchObject({ needsReview: true, distanceCalcFailed: true, actualDistanceM: null, gpsPoints: 1 });
    await http.post('/v1/drivers/me/offline').set(second.driver);
  }, 60_000);

  it('keeps offer timeouts as durable Redis jobs', async () => {
    // Arrange: the only bike driver gets the offer.
    const redis = app.get(RedisService);
    const jobs = app.get(JobsService);
    const cells = await redis.keys('h3:drv:BIKE:*');
    if (cells.length) await redis.del(...cells);
    const bike = await onlineDriver('BIKE', { lat: 11.0185, lng: 76.9727 });
    const driverId = (await http.get('/v1/drivers/me').set('Authorization', `Bearer ${bike}`).expect(200)).body.id as string;
    const pax = { Authorization: `Bearer ${await login()}` };
    const trip = (await http.post('/v1/trips').set(pax).send({ kind: 'RIDE', vehicleKind: 'BIKE', pickup: GANDHIPURAM, drop: BROOKEFIELDS }).expect(201)).body;
    for (let i = 0; i < 40 && (await redis.get(`dispatch:${trip.id}:offer`)) !== driverId; i++) await new Promise((r) => setTimeout(r, 250));

    // Assert: the timeout is a job in Redis (survives a restart), due after offerSeconds.
    const due = await jobs.scheduledAt('offer.expire', trip.id);
    expect(due).not.toBeNull();
    expect(due! - Date.now()).toBeGreaterThan(5_000);
    expect(await redis.zscore('jobs:due', `offer.expire|${trip.id}`)).not.toBeNull();

    // Act: time passes (run the due jobs as if 20 s later): the offer times out and moves on.
    await jobs.runDue(Date.now() + 20_000);
    expect(await redis.get(`dispatch:${trip.id}:offer`)).not.toBe(driverId);
    await http.post(`/v1/trips/${trip.id}/accept`).set('Authorization', `Bearer ${bike}`).expect(409);
    await http.post(`/v1/trips/${trip.id}/cancel`).set(pax).send({}).expect(200);
    expect(await jobs.scheduledAt('offer.expire', trip.id)).toBeNull();
    expect(await jobs.scheduledAt('dispatch.research', trip.id)).toBeNull();
    await http.post('/v1/drivers/me/offline').set('Authorization', `Bearer ${bike}`).expect(200);
  });

  it('takes rich GPS fixes and buffered batches; an older batch never overwrites a newer position', async () => {
    const redis = app.get(RedisService);
    const token = await onlineDriver('BIKE', { lat: 11.0185, lng: 76.9727 });
    const driver = { Authorization: `Bearer ${token}` };
    const driverId = (await http.get('/v1/drivers/me').set(driver).expect(200)).body.id as string;
    const now = Date.now();
    // New apps send the phone's timestamp, accuracy, speed, heading and the mock flag; junk is refused.
    await http.post('/v1/drivers/me/location').set(driver).send({ lat: 11.019, lng: 76.973, ts: now, acc: 6, spd: 4.2, hdg: 90, mock: false }).expect(204);
    await http.post('/v1/drivers/me/location').set(driver).send({ lat: 11.019, lng: 76.973, acc: 'far' }).expect(400);
    // A flush after an outage: sorted by time, the newest fix becomes the live position at its own time.
    await new Promise((r) => setTimeout(r, 30));
    const t = Date.now();
    const fixes = [
      { lat: 11.021, lng: 76.975, ts: t, acc: 5 },
      { lat: 11.02, lng: 76.974, ts: t - 10, acc: 5 },
      { lat: 0, lng: 0, ts: t - 5 },
    ];
    expect((await http.post('/v1/drivers/me/locations').set(driver).send({ fixes }).expect(200)).body).toEqual({ accepted: 2, isLive: true });
    expect(await redis.get(`driver:alive:${driverId}`)).toBe(`11.021,76.975,${t}`);
    const stale = await http.post('/v1/drivers/me/locations').set(driver).send({ fixes: [{ lat: 11.03, lng: 76.98, ts: now - 60_000 }] }).expect(200);
    expect(stale.body).toEqual({ accepted: 1, isLive: false });
    expect((await redis.get(`driver:alive:${driverId}`))?.startsWith('11.021,76.975,')).toBe(true);
    // Offline drivers' uploads are ignored.
    await http.post('/v1/drivers/me/offline').set(driver).expect(200);
    expect((await http.post('/v1/drivers/me/locations').set(driver).send({ fixes: [{ lat: 11.02, lng: 76.97 }] }).expect(200)).body.accepted).toBe(0);
  });

  it('checks drivers from a Redis cache on each fix, refreshed when an admin blocks or holds them', async () => {
    const redis = app.get(RedisService);
    const admin = await adminAuth();
    const token = await onlineDriver('BIKE', { lat: 11.0185, lng: 76.9727 });
    const driver = { Authorization: `Bearer ${token}` };
    const me = (await http.get('/v1/drivers/me').set(driver).expect(200)).body;
    expect(await redis.get(`driver:state:${me.id}`)).toBe('1|BIKE|0');
    const moved = async (lat: number): Promise<boolean> => {
      await http.post('/v1/drivers/me/location').set(driver).send({ lat, lng: 76.973 }).expect(204);
      return (await redis.get(`driver:alive:${me.id}`))?.startsWith(`${lat},`) ?? false;
    };
    expect(await moved(11.0191)).toBe(true);
    // Blocked: fixes are ignored at once (the cache entry is dropped, not left to expire).
    await http.patch(`/v1/admin/users/${me.userId}`).set(admin).send({ isBlocked: true, blockedReason: 'Test block' }).expect(200);
    expect(await redis.get(`driver:state:${me.id}`)).toBeNull();
    await http.post('/v1/drivers/me/locations').set(driver).send({ fixes: [{ lat: 11.0192, lng: 76.973 }] }).expect(403);
    await app.get(DriverStateCache).get(me.id);
    expect(await redis.get(`driver:state:${me.id}`)).toBe('1|BIKE|1');
    await http.patch(`/v1/admin/users/${me.userId}`).set(admin).send({ isBlocked: false }).expect(200);
    expect(await moved(11.0193)).toBe(true);
    // Put on hold: offline in the database and in the cache.
    await http.patch(`/v1/admin/drivers/${me.id}`).set(admin).send({ status: 'ON_HOLD' }).expect(200);
    expect(await moved(11.0194)).toBe(false);
    expect(await redis.get(`driver:state:${me.id}`)).toBe('0|BIKE|0');
  });

  it('falls back to seeded places and a curved route without a Google key', async () => {
    const auth = quoter;
    const ac = await http.get('/v1/places/autocomplete?q=brook&session=t1').set(auth).expect(200);
    expect(ac.body.results.length).toBeGreaterThan(0);
    // Under 4 characters: nothing is looked up.
    expect((await http.get('/v1/places/autocomplete').query({ q: ' bro ', session: 't1' }).set(auth).expect(200)).body).toEqual({ source: 'local', results: [] });
    const details = await http.get(`/v1/places/details/${ac.body.results[0].placeId}`).set(auth).expect(200);
    expect(details.body.lat).toBeCloseTo(11.0, 0);
    const route = await http.post('/v1/maps/route').set(auth).send({ from: GANDHIPURAM, to: BROOKEFIELDS }).expect(200);
    expect(route.body.points.length).toBeGreaterThan(2);
  });

  it('paid lookups need a sign-in and are limited per user (admins are not)', async () => {
    await http.get('/v1/places/autocomplete?q=brook&session=t1').expect(401);
    await http.get('/v1/places/details/local:x').expect(401);
    await http.get('/v1/places/reverse').query(GANDHIPURAM).expect(401);
    await http.post('/v1/maps/route').send({ from: GANDHIPURAM, to: BROOKEFIELDS }).expect(401);
    await http.post('/v1/fares/quote').send({ pickup: GANDHIPURAM, drop: BROOKEFIELDS }).expect(401);
    await http.post('/v1/fares/shifting-quote').send({ pickup: GANDHIPURAM, drop: BROOKEFIELDS }).expect(401);
    // Free lookups stay public.
    await http.get('/v1/places?q=brook').expect(200);
    await http.get('/v1/fares/rates').expect(200);

    // Reverse geocode: 30 a minute per user, then 429 with Retry-After; another user has their own allowance.
    const me = { Authorization: `Bearer ${await login()}` };
    for (let i = 0; i < 30; i++) await http.get('/v1/places/reverse').query(GANDHIPURAM).set(me).expect(200);
    const limited = await http.get('/v1/places/reverse').query(GANDHIPURAM).set(me).expect(429);
    expect(limited.body.message).toBe('Too many requests. Please wait a moment and try again.');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    await http.get('/v1/places/reverse').query(GANDHIPURAM).set(quoter).expect(200);
    const admin = await adminAuth();
    for (let i = 0; i < 31; i++) await http.get('/v1/places/reverse').query(GANDHIPURAM).set(admin).expect(200);
  });

  it('lets only ADMIN_PHONES use the admin API', async () => {
    const passenger = await login();
    await http.get('/v1/admin/stats').set('Authorization', `Bearer ${passenger}`).expect(403);
    await http.post('/v1/auth/otp').send({ phone: ADMIN_PHONE }).expect(200);
    // An older panel names no app: an admin phone without a driver profile still gets ADMIN.
    const admin = (await http.post('/v1/auth/verify').send({ phone: ADMIN_PHONE, code: '123456' }).expect(200)).body;
    expect(admin.user.role).toBe('ADMIN');
    const auth = { Authorization: `Bearer ${admin.accessToken}` };
    const stats = await http.get('/v1/admin/stats').set(auth).expect(200);
    expect(stats.body.tripsLast7Days).toHaveLength(7);
    const drivers = await http.get('/v1/admin/drivers?pageSize=5').set(auth).expect(200);
    expect(drivers.body.items.length).toBeGreaterThan(0);
    const driverId = drivers.body.items[0].id as string;
    // Nothing to verify until a file is in (registration creates the row as NOT_UPLOADED).
    await prisma.kycDocument.update({ where: { driverId_type: { driverId, type: 'VEHICLE_RC' } }, data: { status: 'NOT_UPLOADED', fileUrl: null } });
    await http.post(`/v1/admin/drivers/${driverId}/documents/VEHICLE_RC`).set(auth).send({ status: 'VERIFIED' }).expect(400);
    await prisma.kycDocument.update({ where: { driverId_type: { driverId, type: 'VEHICLE_RC' } }, data: { status: 'UNDER_REVIEW', fileUrl: 'rc.jpg' } });
    const docs = await http.post(`/v1/admin/drivers/${driverId}/documents/VEHICLE_RC`).set(auth).send({ status: 'VERIFIED' }).expect(201);
    expect(docs.body.find((d: { type: string }) => d.type === 'VEHICLE_RC').status).toBe('VERIFIED');
    await http.get('/v1/admin/trips').set(auth).expect(200);
    const heat = await http.get('/v1/admin/heatmap?metric=pickups').set(auth).expect(200);
    expect(heat.body.cells.length).toBeGreaterThan(0);
    expect(heat.body.cells[0].intensity).toBe(1);
    await http.get('/v1/admin/heatmap?metric=unmet&hourFrom=7&hourTo=10&resolution=7').set(auth).expect(200);
    await http.get('/v1/admin/plans').set(auth).expect(200);

    // List filters, sorting and counts; phone search ignores spaces and +91.
    const autos = (await http.get('/v1/admin/drivers?vehicle=AUTO&online=false&sort=rating&pageSize=100').set(auth).expect(200)).body;
    expect(autos.items.every((d: { vehicleKind: string; isOnline: boolean }) => d.vehicleKind === 'AUTO' && !d.isOnline)).toBe(true);
    expect(Object.keys(autos.counts).sort()).toEqual(['APPROVED', 'ON_HOLD', 'PENDING', 'REJECTED']);
    expect(autos.items[0]).not.toHaveProperty('upiId');
    const one = drivers.body.items[0] as { user: { phone: string } };
    const spaced = `+91 ${one.user.phone.slice(-10, -5)} ${one.user.phone.slice(-5)}`;
    const byPhone = (await http.get(`/v1/admin/drivers?q=${encodeURIComponent(spaced)}`).set(auth).expect(200)).body;
    expect(byPhone.items.map((d: { id: string }) => d.id)).toContain(driverId);
    await http.get('/v1/admin/drivers?sort=bogus').set(auth).expect(400);
    // Global search: drivers by plate, trips by the short id the panel shows.
    const found = (await http.get(`/v1/admin/search?q=${encodeURIComponent(autos.items[0]?.plate ?? drivers.body.items[0].plate)}`).set(auth).expect(200)).body;
    expect(found.drivers.length).toBeGreaterThan(0);
    const anyTrip = (await http.get('/v1/admin/trips?pageSize=1').set(auth).expect(200)).body.items[0] as { id: string };
    const byShortId = (await http.get(`/v1/admin/search?q=%23${anyTrip.id.slice(-8).toUpperCase()}`).set(auth).expect(200)).body;
    expect(byShortId.trips.map((t: { id: string }) => t.id)).toContain(anyTrip.id);
    expect((await http.get('/v1/admin/search?q=a').set(auth).expect(200)).body).toEqual({ drivers: [], people: [], trips: [] });
    await http.get('/v1/admin/passengers?sort=trips&blocked=false&women=true').set(auth).expect(200);
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const recent = (await http.get(`/v1/admin/trips?sort=fare&from=${since}&pageSize=100`).set(auth).expect(200)).body;
    const fares = recent.items.map((t: { fareTotal: number }) => t.fareTotal);
    expect(fares).toEqual([...fares].sort((a, b) => b - a));
    expect(recent.items.every((t: { createdAt: string }) => t.createdAt >= since)).toBe(true);
  });

  it('a registered driver can book in the passenger app while their driver session still works', async () => {
    const p = phone();
    await http.post('/v1/auth/otp').send({ phone: p }).expect(200);
    const first = (await http.post('/v1/auth/verify').send({ phone: p, code: '123456', app: 'driver' }).expect(200)).body;
    const reg = (await http.post('/v1/drivers').set('Authorization', `Bearer ${first.accessToken}`)
      .send({ name: 'Passenger Driver', workType: 'RIDES', vehicleKind: 'BIKE', vehicleModel: 'Test', vehicleColor: 'White', plate: randomPlate(), upiId: 'test@okaxis' }).expect(201)).body;
    const driverAuth = { Authorization: `Bearer ${reg.accessToken}` };
    await http.post('/v1/auth/otp').send({ phone: p }).expect(200);
    const passenger = (await http.post('/v1/auth/verify').send({ phone: p, code: '123456', app: 'passenger' }).expect(200)).body;
    const pax = { Authorization: `Bearer ${passenger.accessToken}` };
    expect(passenger.driverId).toBeUndefined();
    await http.get('/v1/drivers/me').set(pax).expect(403);
    await http.get('/v1/admin/stats').set(pax).expect(403);
    const trip = (await http.post('/v1/trips').set(pax).send({ kind: 'RIDE', vehicleKind: 'BIKE', pickup: GANDHIPURAM, drop: BROOKEFIELDS }).expect(201)).body;
    expect((await http.get('/v1/drivers/me').set(driverAuth).expect(200)).body.id).toBe(reg.driver.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: reg.driver.userId } })).role).toBe('DRIVER');
    await http.post(`/v1/trips/${trip.id}/cancel`).set(pax).send({}).expect(200);
  });

  it('a driver booking in the passenger app is never offered their own trip', async () => {
    // Arrange: only these two bike drivers are indexed; the one who books stands right at the pickup.
    const redis = app.get(RedisService);
    const cells = await redis.keys('h3:drv:BIKE:*');
    if (cells.length) await redis.del(...cells);
    const self = await onlineDriver('BIKE', { lat: GANDHIPURAM.lat, lng: GANDHIPURAM.lng });
    const other = await onlineDriver('BIKE', { lat: 11.0188, lng: 76.973 });
    const selfId = (await http.get('/v1/drivers/me').set('Authorization', `Bearer ${self}`).expect(200)).body.id as string;
    const p = (await prisma.user.findFirstOrThrow({ where: { driver: { id: selfId } } })).phone.slice(3);
    await http.post('/v1/auth/otp').send({ phone: p }).expect(200);
    const pax = { Authorization: `Bearer ${(await http.post('/v1/auth/verify').send({ phone: p, code: '123456', app: 'passenger' }).expect(200)).body.accessToken}` };
    try {
      // Act: they book a bike; matching runs until the other driver takes it.
      const trip = (await http.post('/v1/trips').set(pax).send({ kind: 'RIDE', vehicleKind: 'BIKE', pickup: GANDHIPURAM, drop: BROOKEFIELDS }).expect(201)).body;
      let accepted = false;
      for (let i = 0; i < 40 && !accepted; i++) {
        const offer = await http.get('/v1/trips/offer').set('Authorization', `Bearer ${self}`);
        expect(offer.status === 200 ? offer.body?.trip?.id : undefined).not.toBe(trip.id);
        accepted = (await http.post(`/v1/trips/${trip.id}/accept`).set('Authorization', `Bearer ${other}`)).status === 200;
        if (!accepted) await new Promise((r) => setTimeout(r, 250));
      }
      // Assert: the nearer driver (themselves) was skipped; the other one has the trip.
      expect(accepted).toBe(true);
      await http.post(`/v1/trips/${trip.id}/cancel`).set(pax).send({}).expect(200);
    } finally {
      for (const d of [self, other]) await http.post('/v1/drivers/me/offline').set('Authorization', `Bearer ${d}`);
    }
  }, 30_000);

  it('an admin who also drives: the driver app gets a DRIVER token, the panel an ADMIN one', async () => {
    // A driver made an admin (same as an ADMIN_PHONES number that registered a vehicle).
    const p = phone();
    await http.post('/v1/auth/otp').send({ phone: p }).expect(200);
    const first = (await http.post('/v1/auth/verify').send({ phone: p, code: '123456', app: 'driver' }).expect(200)).body;
    const reg = (await http.post('/v1/drivers').set('Authorization', `Bearer ${first.accessToken}`)
      .send({ name: 'Admin Driver', workType: 'RIDES', vehicleKind: 'BIKE', vehicleModel: 'Test', vehicleColor: 'White', plate: randomPlate(), upiId: 'test@okaxis' }).expect(201)).body;
    await prisma.user.update({ where: { id: reg.driver.userId }, data: { role: 'ADMIN' } });
    const signIn = async (app?: string) => {
      await http.post('/v1/auth/otp').send({ phone: p }).expect(200);
      return (await http.post('/v1/auth/verify').send({ phone: p, code: '123456', app }).expect(200)).body as { accessToken: string; driverId?: string; user: { role: string } };
    };

    // Driver app (and an older one that names no app): the driver routes work.
    for (const app of ['driver', undefined]) {
      const asDriver = await signIn(app);
      expect(asDriver.driverId).toBe(reg.driver.id);
      expect((await http.get('/v1/drivers/me').set('Authorization', `Bearer ${asDriver.accessToken}`).expect(200)).body.id).toBe(reg.driver.id);
      await http.get('/v1/admin/stats').set('Authorization', `Bearer ${asDriver.accessToken}`).expect(403);
    }
    // The panel (any case: older panels send ADMIN): admin routes work, the account stays an admin.
    const asAdmin = await signIn('ADMIN');
    expect(asAdmin.user.role).toBe('ADMIN');
    await http.get('/v1/admin/stats').set('Authorization', `Bearer ${asAdmin.accessToken}`).expect(200);
    await http.post('/v1/auth/verify').send({ phone: p, code: '123456', app: 'website' }).expect(400);
  });

  it('role changes apply to existing tokens at once (the role comes from the account, not the 30-day token)', async () => {
    // A passenger token, then registering as a driver: the old token now works on driver routes too.
    const before = await login();
    const reg = (await http.post('/v1/drivers').set('Authorization', `Bearer ${before}`)
      .send({ name: 'Role Test', workType: 'RIDES', vehicleKind: 'BIKE', vehicleModel: 'Test', vehicleColor: 'White', plate: randomPlate(), upiId: 'test@okaxis' }).expect(201)).body;
    expect((await http.get('/v1/drivers/me').set('Authorization', `Bearer ${before}`).expect(200)).body.id).toBe(reg.driver.id);

    // Made an admin, then demoted (what the admin panel's role change does, plus its cache drop): the panel token stops.
    const userId = reg.driver.userId as string;
    await prisma.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });
    await app.get(AuthService).invalidateRole(userId);
    const p = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).phone.slice(3);
    await http.post('/v1/auth/otp').send({ phone: p }).expect(200);
    const panel = { Authorization: `Bearer ${(await http.post('/v1/auth/verify').send({ phone: p, code: '123456', app: 'admin' }).expect(200)).body.accessToken}` };
    await http.get('/v1/admin/stats').set(panel).expect(200);
    await prisma.user.update({ where: { id: userId }, data: { role: 'DRIVER' } });
    await app.get(AuthService).invalidateRole(userId);
    await http.get('/v1/admin/stats').set(panel).expect(403);
    // The same token now acts as the account's own role (DRIVER).
    expect((await http.get('/v1/drivers/me').set(panel).expect(200)).body.id).toBe(reg.driver.id);
  });

  it('uses H3 service areas: outside is refused, admins add cities, zones and blocks', async () => {
    const passenger = await login();
    await http.post('/v1/auth/otp').send({ phone: ADMIN_PHONE }).expect(200);
    const admin = { Authorization: `Bearer ${(await http.post('/v1/auth/verify').send({ phone: ADMIN_PHONE, code: '123456', app: 'admin' })).body.accessToken}` };

    // Gandhipuram is inside the seeded Coimbatore hexes; Mettupalayam (~31 km) is not.
    const inside = await http.get('/v1/geo/check?lat=11.0183&lng=76.9725').expect(200);
    expect(inside.body).toMatchObject({ cityId: 'coimbatore', isServiceable: true });
    const outside = { lat: 11.299, lng: 76.935, name: 'Mettupalayam' };
    await http.post('/v1/trips').set('Authorization', `Bearer ${passenger}`)
      .send({ kind: 'RIDE', vehicleKind: 'BIKE', pickup: GANDHIPURAM, drop: outside }).expect(400);

    // A new city with a custom hex area and a surge zone.
    const id = `tiruppur-${Date.now()}`;
    const city = await http.post('/v1/admin/cities').set(admin)
      .send({ id, name: 'Tiruppur', state: 'Tamil Nadu', centerLat: 11.1085, centerLng: 77.3411, radiusKm: 3 }).expect(201);
    expect(city.body.serviceCells.length).toBeGreaterThan(10);
    const cells = city.body.serviceCells.slice(0, 7) as string[];
    await http.put(`/v1/admin/cities/${id}/service-cells`).set(admin).send({ cells: [...cells, 'bogus'] }).expect(200, { count: 7, rejected: ['bogus'] });
    await http.post(`/v1/admin/cities/${id}/zones`).set(admin)
      .send({ name: 'Old bus stand', kind: 'SURGE', cells: cells.slice(0, 1), surgeMultiplier: 1.3 }).expect(201);
    const area = await http.get(`/v1/cities/${id}/service-area`).expect(200);
    expect(area.body.cells).toHaveLength(7);
    expect(area.body.zones[0].kind).toBe('SURGE');
    await http.delete(`/v1/admin/cities/${id}`).set(admin).expect(204);

    // Blocking takes effect on the next request.
    const me = (await http.get('/v1/me').set('Authorization', `Bearer ${passenger}`).expect(200)).body;
    await http.patch(`/v1/admin/users/${me.id}`).set(admin).send({ isBlocked: true, blockedReason: 'Test block' }).expect(200);
    await http.get('/v1/me').set('Authorization', `Bearer ${passenger}`).expect(403);
    await http.patch(`/v1/admin/users/${me.id}`).set(admin).send({ isBlocked: false }).expect(200);
    await http.get('/v1/me').set('Authorization', `Bearer ${passenger}`).expect(200);

    const blockedList = await http.get('/v1/admin/users?role=PASSENGER&blocked=false&pageSize=5').set(admin).expect(200);
    expect(blockedList.body.items.every((u: { role: string }) => u.role === 'PASSENGER')).toBe(true);

    // Every admin change is audited.
    const audit = await http.get('/v1/admin/audit?pageSize=5').set(admin).expect(200);
    expect(audit.body.items.length).toBeGreaterThan(0);
  });

  it('surges from live H3 demand and learns hex-to-hex speeds', async () => {
    await http.post('/v1/auth/otp').send({ phone: ADMIN_PHONE }).expect(200);
    const admin = { Authorization: `Bearer ${(await http.post('/v1/auth/verify').send({ phone: ADMIN_PHONE, code: '123456', app: 'admin' })).body.accessToken}` };
    const peelamedu = { lat: 11.029, lng: 77.027, name: 'Peelamedu' };
    const raceCourse = { lat: 10.999, lng: 76.978, name: 'Race Course' };
    // Demand counts each passenger once per window: five different riders.
    for (let i = 0; i < 5; i++) {
      const rider = await login();
      await http.post('/v1/trips').set('Authorization', `Bearer ${rider}`)
        .send({ kind: 'RIDE', vehicleKind: 'AUTO', pickup: peelamedu, drop: raceCourse }).expect(201);
    }
    // No drivers near Peelamedu: demand ÷ supply is high → the cell (and, smoothed, its neighbours) surges.
    const snap = await http.get('/v1/admin/demand?refresh=true').set(admin).expect(200);
    // Peelamedu's own cell (other tests' bookings may make Gandhipuram busy too).
    const hot = snap.body.cells.find((c: { cell: string }) => c.cell === cellAt(peelamedu.lat, peelamedu.lng, DEMAND_RES));
    expect(hot.requests).toBeGreaterThanOrEqual(5);
    expect(hot.level).toBe('high');
    expect(hot.multiplier).toBeGreaterThan(1.1);
    const here = await http.get(`/v1/geo/check?lat=${peelamedu.lat}&lng=${peelamedu.lng}`).expect(200);
    expect(here.body.multiplier).toBe(hot.multiplier);
    const publicDemand = await http.get('/v1/demand').expect(200);
    expect(publicDemand.body.cells.some((c: { cell: string }) => c.cell === hot.cell)).toBe(true);

    // Learned speeds: rebuild from completed trips (the ride test completed one) and read the summary.
    const rebuilt = await http.post('/v1/admin/hex-stats/rebuild').set(admin).expect(200);
    expect(rebuilt.body.pairs).toBeGreaterThanOrEqual(0);
    const stats = await http.get('/v1/admin/hex-stats').set(admin).expect(200);
    expect(stats.body.lastRun).not.toBeNull();
    const compact = await http.get('/v1/cities/coimbatore/service-area?compact=true').expect(200);
    expect(compact.body.compacted).toBe(true);
  });

  it('serves the public app config: plans off, contribute page without a cost until one is set', async () => {
    const res = await http.get('/v1/app-config').expect(200);
    expect(res.body.driverPlansEnabled).toBe(false);
    expect(res.body.contribute).toMatchObject({ upiId: '', payeeName: 'Tamil Taxi', monthlyCost: null });
  });

  it('starts a free trial and lists daily/weekly/monthly plans', async () => {
    const plans = await http.get('/v1/plans?vehicleKind=BIKE').expect(200);
    expect(plans.body.map((p: { price: number }) => p.price)).toEqual([79, 449, 1499]);
  });
  it('holds ready drivers for an admin when auto-approval is off, then approves them in bulk', async () => {
    const admin = await adminAuth();
    await http.put('/v1/admin/settings').set(admin).send({ driverAutoApprove: false }).expect(200);
    try {
      const plate = randomPlate();
      const driverUser = await login();
      const reg = await http
        .post('/v1/drivers')
        .set('Authorization', `Bearer ${driverUser}`)
        .send({ name: 'Selvi R', workType: 'RIDES', vehicleKind: 'AUTO', vehicleModel: 'Bajaj RE', vehicleColor: 'Green', plate, upiId: 'selvi@okaxis' })
        .expect(201);
      const driver = { Authorization: `Bearer ${reg.body.accessToken as string}` };
      const driverId = reg.body.driver.id as string;
      await prisma.user.update({ where: { id: reg.body.driver.userId as string }, data: { identityStatus: 'APPROVED' } });

      // Waiting on the driver until the documents are in; verified documents leave them ready, not approved.
      const waiting = (await http.get(`/v1/admin/approvals?stage=driver&q=${encodeURIComponent(plate)}`).set(admin).expect(200)).body;
      expect(waiting.items.map((d: { id: string }) => d.id)).toEqual([driverId]);
      for (const type of ['VEHICLE_RC', 'INSURANCE']) {
        await http.post(`/v1/drivers/me/documents/${type}`).set(driver).attach('file', JPEG, { filename: 'doc.jpg', contentType: 'image/jpeg' }).expect(201);
        await http.post(`/v1/admin/drivers/${driverId}/documents/${type}`).set(admin).send({ status: 'VERIFIED' }).expect(201);
      }
      expect((await http.get('/v1/drivers/me').set(driver).expect(200)).body.status).toBe('PENDING');
      const ready = (await http.get(`/v1/admin/approvals?stage=ready&q=${encodeURIComponent(plate)}`).set(admin).expect(200)).body;
      expect(ready).toMatchObject({ stage: 'ready', autoApprove: false, identityRequired: true, total: 1 });
      expect(ready.counts.ready).toBeGreaterThanOrEqual(1);
      expect(ready.items[0].checklist).toMatchObject({ isReady: true, isRejected: false });
      await http.get('/v1/admin/approvals?stage=bogus').set(admin).expect(400);

      // Bulk approve: unknown ids and drivers already decided are skipped, with the reason.
      const res = (await http.post('/v1/admin/drivers/approve').set(admin).send({ ids: [driverId, 'missing'] }).expect(200)).body;
      expect(res).toEqual({ approved: [driverId], skipped: [{ id: 'missing', reason: 'Not found' }] });
      expect((await http.get('/v1/drivers/me').set(driver).expect(200)).body.status).toBe('APPROVED');
      expect((await http.post('/v1/admin/drivers/approve').set(admin).send({ ids: [driverId] }).expect(200)).body.skipped).toEqual([{ id: driverId, reason: 'Already approved' }]);
      // One approval in the driver's history, though the second request named them too.
      const history = (await http.get(`/v1/admin/users/${reg.body.driver.userId as string}/activity`).set(admin).expect(200)).body as { summary: string }[];
      expect(history.filter((h) => h.summary === 'Approved (bulk approval)')).toHaveLength(1);

      // Hold with a reason (kept in the audit log); a too-short reason is refused.
      await http.patch(`/v1/admin/drivers/${driverId}`).set(admin).send({ status: 'ON_HOLD', reason: 'ab' }).expect(400);
      await http.patch(`/v1/admin/drivers/${driverId}`).set(admin).send({ status: 'ON_HOLD', reason: 'Insurance expired' }).expect(200);
      const audit = await prisma.auditLog.findFirst({ where: { entity: 'drivers', entityId: driverId }, orderBy: { createdAt: 'desc' } });
      expect(audit?.data).toMatchObject({ body: { status: 'ON_HOLD', reason: 'Insurance expired' } });
    } finally {
      await http.put('/v1/admin/settings').set(admin).send({ driverAutoApprove: true }).expect(200);
    }
  });

  it('keeps notes and a history per person, fixes driver details, takes them offline and pushes a message', async () => {
    const admin = await adminAuth();
    const token = await onlineDriver('AUTO', { lat: 11.019, lng: 76.973 });
    const me = (await http.get('/v1/drivers/me').set('Authorization', `Bearer ${token}`).expect(200)).body as { id: string; userId: string; plate: string };

    // The vehicle can't change while they're online; an admin takes them offline (once).
    await http.patch(`/v1/admin/drivers/${me.id}/profile`).set(admin).send({ vehicleKind: 'CAB' }).expect(409);
    await http.post(`/v1/admin/drivers/${me.id}/offline`).set(admin).expect(200);
    await http.post(`/v1/admin/drivers/${me.id}/offline`).set(admin).expect(409);
    expect((await http.get('/v1/drivers/me').set('Authorization', `Bearer ${token}`).expect(200)).body.isOnline).toBe(false);

    // Edits: bad plate refused, another driver's plate is a conflict, a new one is stored upper-case.
    await http.patch(`/v1/admin/drivers/${me.id}/profile`).set(admin).send({ plate: 'not a plate' }).expect(400);
    const other = (await http.get('/v1/admin/drivers?pageSize=5').set(admin).expect(200)).body.items.find((d: { id: string }) => d.id !== me.id);
    await http.patch(`/v1/admin/drivers/${me.id}/profile`).set(admin).send({ plate: other.plate }).expect(409);
    const plate = randomPlate();
    const edited = (await http.patch(`/v1/admin/drivers/${me.id}/profile`).set(admin).send({ plate: plate.toLowerCase(), vehicleColor: 'Yellow', vehicleKind: 'CAB' }).expect(200)).body;
    expect(edited).toMatchObject({ plate, vehicleColor: 'Yellow', vehicleKind: 'CAB' });
    await http.patch(`/v1/admin/users/${me.userId}`).set(admin).send({ email: 'not-an-email' }).expect(400);
    await http.patch(`/v1/admin/users/${me.userId}`).set(admin).send({ email: 'driver@example.com' }).expect(200);

    // Notes are shared by the driver and account pages; deleting one removes it.
    const note = (await http.post(`/v1/admin/users/${me.userId}/notes`).set(admin).send({ body: 'Called: will re-upload the RC tomorrow' }).expect(201)).body;
    expect(note.author.phone).toBe(`+91${ADMIN_PHONE}`);
    const temp = (await http.post(`/v1/admin/users/${me.userId}/notes`).set(admin).send({ body: 'Typo note' }).expect(201)).body;
    await http.delete(`/v1/admin/notes/${temp.id}`).set(admin).expect(204);
    expect((await http.get(`/v1/admin/users/${me.userId}/notes`).set(admin).expect(200)).body.map((n: { id: string }) => n.id)).toEqual([note.id]);
    await http.post(`/v1/admin/users/${me.userId}/notes`).set(admin).send({ body: 'x' }).expect(400);

    // A push to the driver's phone: no phone registered in tests, so it reports 0 devices.
    expect((await http.post(`/v1/admin/users/${me.userId}/message`).set(admin).send({ title: 'Please re-upload RC', body: 'The photo was blurred' }).expect(200)).body).toEqual({ devices: 0 });

    // The history reads like what happened, newest first, with who did it.
    const activity = (await http.get(`/v1/admin/users/${me.userId}/activity`).set(admin).expect(200)).body as { summary: string; actor: { phone: string } }[];
    const summaries = activity.map((a) => a.summary);
    expect(summaries).toEqual(expect.arrayContaining(['Taken offline by an admin', 'Edited email', 'Push sent: “Please re-upload RC”', 'Note added']));
    expect(summaries.find((x) => x.startsWith('Edited plate') || x.startsWith('Edited vehicle'))?.split(', ').length).toBe(3);
    expect(summaries.indexOf('Push sent: “Please re-upload RC”')).toBeLessThan(summaries.indexOf('Taken offline by an admin'));
    expect(activity[0].actor.phone).toBe(`+91${ADMIN_PHONE}`);
  });

  it('approves a driver after the Didit identity check and the RC + insurance review', async () => {
    const driverUser = await login();
    const plate = randomPlate();
    const reg = await http
      .post('/v1/drivers')
      .set('Authorization', `Bearer ${driverUser}`)
      .send({ name: 'Murugan Selvam', workType: 'RIDES', vehicleKind: 'AUTO', vehicleModel: 'Bajaj RE', vehicleColor: 'Green', plate, upiId: 'murugan@okaxis' })
      .expect(201);
    const driver = { Authorization: `Bearer ${reg.body.accessToken as string}` };
    const driverId = reg.body.driver.id as string;
    const userId = reg.body.driver.userId as string;

    // Only RC and insurance are uploaded now (no licence / Aadhaar / police photos).
    const docs = await http.get('/v1/drivers/me/documents').set(driver).expect(200);
    expect(docs.body.map((d: { type: string }) => d.type).sort()).toEqual(['INSURANCE', 'VEHICLE_RC']);
    await http.post('/v1/drivers/me/documents/POLICE_VERIFICATION').set(driver).attach('file', Buffer.from('x'), 'p.jpg').expect(400);

    // The app gets a token for the in-app SDK; the same unfinished session is reused.
    const started = await http.post('/v1/kyc/session').set(driver).expect(201);
    expect(started.body).toEqual({ sessionId: `sess-${userId}`, sessionToken: `tok-${userId}` });
    await http.post('/v1/kyc/session').set(driver).expect(201);
    expect(await prisma.identityVerification.count({ where: { userId } })).toBe(1);

    // Admin verifies both documents: still pending until identity passes.
    await http.post('/v1/auth/otp').send({ phone: ADMIN_PHONE }).expect(200);
    const admin = { Authorization: `Bearer ${(await http.post('/v1/auth/verify').send({ phone: ADMIN_PHONE, code: '123456', app: 'admin' })).body.accessToken}` };
    for (const type of ['VEHICLE_RC', 'INSURANCE']) {
      await http.post(`/v1/drivers/me/documents/${type}`).set(driver).attach('file', JPEG, { filename: 'doc.jpg', contentType: 'image/jpeg' }).expect(201);
      await http.post(`/v1/admin/drivers/${driverId}/documents/${type}`).set(admin).send({ status: 'VERIFIED' }).expect(201);
    }
    expect((await http.get('/v1/drivers/me').set(driver).expect(200)).body.status).toBe('PENDING');

    // Unsigned or badly signed webhooks are refused.
    const event = {
      event_id: `evt-${userId}`,
      webhook_type: 'status.updated',
      session_id: `sess-${userId}`,
      status: 'Approved',
      vendor_data: userId,
      decision: {
        status: 'Approved',
        id_verifications: [
          { document_type: 'Driving License', document_number: 'TN3820190012345', full_name: 'Murugan Selvam', date_of_birth: '1990-04-12', warnings: [] },
          { document_type: 'Identity Card', document_number: '1234 5678 9012', full_name: 'Murugan Selvam', warnings: [] },
        ],
        liveness_checks: [{ status: 'Approved', reference_image: 'https://media.didit.test/face/selfie.jpg' }],
      },
    };
    await http.post('/v1/kyc/didit/webhook').send(event).expect(401);
    const hook = signed(event);
    await http.post('/v1/kyc/didit/webhook').set(hook.headers).send(hook.body).expect(200);
    await http.post('/v1/kyc/didit/webhook').set(hook.headers).send(hook.body).expect(200); // duplicate: ignored

    const me = await http.get('/v1/kyc/me').set(driver).expect(200);
    expect(me.body).toMatchObject({
      isEnabled: true,
      status: 'APPROVED',
      fullName: 'Murugan Selvam',
      documentLast4: '2345',
      documents: [
        { type: 'Driving License', last4: '2345' },
        { type: 'Identity Card', last4: '9012' },
      ],
    });
    expect((await http.get('/v1/drivers/me').set(driver).expect(200)).body.status).toBe('APPROVED');
    // Approved: the gender (who gets Butterfly rides) is fixed; sending the same one is fine.
    await http.patch('/v1/drivers/me').set(driver).send({ gender: 'FEMALE' }).expect(403);
    await http.patch('/v1/drivers/me').set(driver).send({ gender: 'PREFER_NOT_TO_SAY', upiId: 'murugan@oksbi' }).expect(200);
    await http.post('/v1/kyc/session').set(driver).expect(409);

    // The approved live selfie is kept as the reference face; the profile photo is taken separately.
    const profile = (await http.get('/v1/drivers/me').set(driver).expect(200)).body;
    expect(profile.selfieFile).toMatch(/\.jpg$/);
    expect(profile.photoFile).toBeNull();

    // No face in the photo → retake. A clear match → riders see it at once.
    fakeDidit.nextMatch = { score: null, faces: 0, isMatch: false };
    await http.post('/v1/drivers/me/photo').set(driver).attach('file', JPEG, { filename: 'p.jpg', contentType: 'image/jpeg' }).expect(422);
    fakeDidit.nextMatch = { score: 97, faces: 1, isMatch: true };
    const up = await http.post('/v1/drivers/me/photo').set(driver).attach('file', JPEG, { filename: 'p.jpg', contentType: 'image/jpeg' }).expect(200);
    expect(up.body).toEqual({ status: 'APPROVED' });

    // The driver, admins and their riders see it; a stranger gets 404.
    const photo = await http.get(`/v1/drivers/${driverId}/photo`).set(driver).expect(200);
    expect(photo.headers['content-type']).toContain('image/jpeg');
    await http.get('/v1/drivers/me/photo').set(driver).expect(200);
    await http.get(`/v1/drivers/${driverId}/photo`).set(admin).expect(200);
    const stranger = { Authorization: `Bearer ${await login()}` };
    await http.get(`/v1/drivers/${driverId}/photo`).set(stranger).expect(404);

    // A low match waits for an admin, who approves it.
    fakeDidit.nextMatch = { score: 41, faces: 1, isMatch: false };
    const low = await http.post('/v1/drivers/me/photo').set(driver).attach('file', JPEG, { filename: 'p.jpg', contentType: 'image/jpeg' }).expect(200);
    expect(low.body).toEqual({ status: 'IN_REVIEW' });
    const pending = (await http.get('/v1/drivers/me').set(driver).expect(200)).body;
    expect(pending.pendingPhotoFile).toMatch(/\.jpg$/);
    await http.post(`/v1/admin/drivers/${driverId}/photo`).set(admin).send({ isApproved: true }).expect(200);
    expect((await http.get('/v1/drivers/me').set(driver).expect(200)).body.photoFile).toBe(pending.pendingPhotoFile);
    fakeDidit.nextMatch = { score: 97, faces: 1, isMatch: true };
  });

  it('needs the verified photo before an approved driver can go online', async () => {
    const driverUser = await login();
    const reg = await http
      .post('/v1/drivers')
      .set('Authorization', `Bearer ${driverUser}`)
      .send({ name: 'Ravi M', workType: 'RIDES', vehicleKind: 'BIKE', vehicleModel: 'Hero Splendor', vehicleColor: 'Black', plate: randomPlate(), upiId: 'ravi@okaxis' })
      .expect(201);
    const driver = { Authorization: `Bearer ${reg.body.accessToken as string}` };
    await prisma.driver.update({ where: { id: reg.body.driver.id }, data: { status: 'APPROVED' } });
    const res = await http.post('/v1/drivers/me/online').set(driver).send({ lat: 11.019, lng: 76.973 }).expect(403);
    expect(res.body.code).toBe('PHOTO_REQUIRED');
  });

  it('sends a driver approved without a driving licence to review', async () => {
    const driverUser = await login();
    const reg = await http
      .post('/v1/drivers')
      .set('Authorization', `Bearer ${driverUser}`)
      .send({ name: 'Anand K', workType: 'RIDES', vehicleKind: 'BIKE', vehicleModel: 'TVS Jupiter', vehicleColor: 'Blue', plate: randomPlate(), upiId: 'anand@okaxis' })
      .expect(201);
    const driver = { Authorization: `Bearer ${reg.body.accessToken as string}` };
    const { sessionId } = (await http.post('/v1/kyc/session').set(driver).expect(201)).body as { sessionId: string };
    fakeDidit.decisions.set(sessionId, { session_id: sessionId, status: 'Approved', id_verifications: [{ document_type: 'Identity Card', document_number: '1234 5678 9012' }] });
    const res = await http.post('/v1/kyc/sync').set(driver).expect(200);
    expect(res.body.status).toBe('IN_REVIEW');
  });

  it('gives riders an optional Verified badge via sync when the SDK closes', async () => {
    const rider = { Authorization: `Bearer ${await login()}` };
    expect((await http.get('/v1/kyc/me').set(rider).expect(200)).body.status).toBe('NOT_STARTED');
    const { sessionId } = (await http.post('/v1/kyc/session').set(rider).expect(201)).body as { sessionId: string };
    fakeDidit.decisions.set(sessionId, {
      session_id: sessionId,
      status: 'Declined',
      face_matches: [{ status: 'Declined', warnings: [{ short_description: 'Face does not match the ID', log_type: 'error' }] }],
    });
    const declined = await http.post('/v1/kyc/sync').set(rider).expect(200);
    expect(declined.body).toMatchObject({ status: 'DECLINED', reasons: ['Selfie: Face does not match the ID'] });
    fakeDidit.decisions.set(sessionId, { session_id: sessionId, status: 'Approved', id_verifications: [{ document_type: 'Aadhaar', document_number: '1234 5678 9012' }] });
    const approved = await http.post('/v1/kyc/sync').set(rider).expect(200);
    expect(approved.body).toMatchObject({ status: 'APPROVED', documentLast4: '9012' });
    expect((await http.get('/v1/me').set(rider).expect(200)).body.identityStatus).toBe('APPROVED');

    // A newer session that only expires (e.g. "Try again" opened and closed) keeps the approval.
    const userId = (await http.get('/v1/me').set(rider).expect(200)).body.id as string;
    await prisma.identityVerification.create({ data: { userId, purpose: 'RIDER', sessionId: `later-${userId}` } });
    const expired = signed({ event_id: `evt-exp-${userId}`, webhook_type: 'status.updated', session_id: `later-${userId}`, status: 'Expired', vendor_data: userId });
    await http.post('/v1/kyc/didit/webhook').set(expired.headers).send(expired.body).expect(200);
    expect((await http.get('/v1/kyc/me').set(rider).expect(200)).body.status).toBe('APPROVED');
  });

  it('driver Redis keys expire: an app that dies without going offline leaves nothing behind for ever', async () => {
    const redis = app.get(RedisService);
    const token = await onlineDriver('BIKE', { lat: 11.0185, lng: 76.9727 });
    const auth = { Authorization: `Bearer ${token}` };
    const driverId = (await http.get('/v1/drivers/me').set(auth).expect(200)).body.id as string;

    // The open online session (earnings' online hours) has a TTL, renewed by GPS fixes, and is gone once offline.
    expect(await redis.ttl(`driver:online_since:${driverId}`)).toBeGreaterThan(5 * 3600);
    await redis.expire(`driver:online_since:${driverId}`, 60);
    await http.post('/v1/drivers/me/location').set(auth).send({ lat: 11.0186, lng: 76.9728 }).expect(204);
    expect(await redis.ttl(`driver:online_since:${driverId}`)).toBeGreaterThan(5 * 3600);
    // The driver's index entries carry a TTL too.
    const [, cell] = (await redis.get(`driver:cell:${driverId}`))!.split('|');
    expect(await redis.ttl(`driver:cell:${driverId}`)).toBeGreaterThan(23 * 3600);
    expect(await redis.ttl(`h3:drv:BIKE:${cell}`)).toBeGreaterThan(23 * 3600);
    await http.post('/v1/drivers/me/offline').set(auth).expect(200);
    expect(await redis.exists(`driver:online_since:${driverId}`)).toBe(0);

    // A driver whose heartbeat is gone but who never went offline is pruned when a search meets them.
    await redis.multi().sadd(`h3:drv:BIKE:${cell}`, 'ghost-driver').set('driver:cell:ghost-driver', `BIKE|${cell}`).exec();
    const found = await app.get(DriverLocationService).nearby({ kind: 'BIKE', lat: 11.0185, lng: 76.9727, radiusKm: 2, limit: 50 });
    expect(found.map((d) => d.driverId)).not.toContain('ghost-driver');
    expect(await redis.sismember(`h3:drv:BIKE:${cell}`, 'ghost-driver')).toBe(0);
    expect(await redis.exists('driver:cell:ghost-driver')).toBe(0);

    // Surge cells are tracked in a set (no KEYS scan): a cell that stopped surging loses its multiplier.
    await redis.multi().set('h3:surge:stale-cell', '1.4', 'EX', 180).sadd(SURGE_CELLS_KEY, 'stale-cell').exec();
    await app.get(DemandService).refresh(true);
    expect(await redis.exists('h3:surge:stale-cell')).toBe(0);
    for (const c of await redis.smembers(SURGE_CELLS_KEY)) expect(await redis.exists(`h3:surge:${c}`)).toBe(1);
  });
});
