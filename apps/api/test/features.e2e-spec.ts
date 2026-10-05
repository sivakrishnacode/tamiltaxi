// End-to-end: driver registration, profile and account features (same set-up as app.e2e-spec.ts: Postgres + Redis,
// a fake Didit). The e2e config runs the files one after another (they share the test database and Redis).
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/core/prisma/prisma.service.js';
import { RedisService } from '../src/core/redis/redis.service.js';
import { accessKey, blockedFlagKey } from '../src/core/auth/user-access.service.js';
import { FileStorageService } from '../src/core/storage/file-storage.service.js';
import { DiditClient } from '../src/modules/kyc/didit.client.js';
import { TripEventsService } from '../src/modules/realtime/trip-events.service.js';

const ADMIN_PHONE = '9000000001';
/** A stored photo so drivers approved directly in the database may go online (photo required with Didit on). */
const E2E_PHOTO = '00000000-0000-4000-8000-00000000e2e0.jpg';
/** Smallest valid JPEG header bytes: enough for storage (it only checks the type). */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
const AT = { lat: 11.019, lng: 76.973 };

type Auth = { Authorization: string };

/** Random valid number plate (plates are unique and the test database keeps earlier runs' drivers). */
function randomPlate(): string {
  const letter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return `TN ${10 + Math.floor(Math.random() * 90)} ${letter()}${letter()}${letter()} ${Math.floor(1000 + Math.random() * 8999)}`;
}

/** Random valid Indian mobile number so runs don't collide. */
function phone(): string {
  return `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
}

/** Stands in for Didit: the next face-match result is set by the test. */
const fakeDidit = {
  isEnabled: true,
  createSession: async (p: { userId: string }) => ({ sessionId: `sess-${p.userId}`, sessionToken: `tok-${p.userId}`, status: 'Not Started' }),
  decision: async (sessionId: string) => ({ session_id: sessionId, status: 'In Progress' }),
  image: async () => null,
  nextMatch: { score: 97 as number | null, faces: 1, isMatch: true },
  faceMatch: async () => fakeDidit.nextMatch,
};

describe('Tamil Taxi features (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    process.env.OTP_DEV_MODE = 'true';
    process.env.ADMIN_PHONES = ADMIN_PHONE;
    process.env.GOOGLE_MAPS_API_KEY = '';
    process.env.DIDIT_API_KEY = 'e2e';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DiditClient).useValue(fakeDidit).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    const keys = [...(await redis.keys('otp:*')), ...(await redis.keys('driver:*')), ...(await redis.keys('h3:*')), ...(await redis.keys('dispatch:*'))];
    if (keys.length) await redis.del(...keys);
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(p = phone()): Promise<{ auth: Auth; userId: string; phone: string; isNewUser: boolean }> {
    await http.post('/v1/auth/otp').send({ phone: p }).expect(200);
    const res = await http.post('/v1/auth/verify').send({ phone: p, code: '123456' }).expect(200);
    return { auth: { Authorization: `Bearer ${res.body.accessToken as string}` }, userId: res.body.user.id as string, phone: p, isNewUser: res.body.isNewUser as boolean };
  }

  let adminHeaders: Auth | null = null;
  /** The admin's token, signed in once (OTP sends are limited per phone). */
  async function adminAuth(): Promise<Auth> {
    adminHeaders ??= (await login(ADMIN_PHONE)).auth;
    return adminHeaders;
  }

  function registration(plate = randomPlate()): Record<string, string> {
    return { name: 'Kavin R', workType: 'RIDES', vehicleKind: 'AUTO', vehicleModel: 'Bajaj RE', vehicleColor: 'Green', plate, upiId: 'kavin@okaxis' };
  }

  /** A registered driver (PENDING); returns their token and ids. */
  async function newDriver(): Promise<{ auth: Auth; driverId: string; userId: string; plate: string }> {
    const plate = randomPlate();
    const { auth } = await login();
    const res = await http.post('/v1/drivers').set(auth).send(registration(plate)).expect(201);
    return { auth: { Authorization: `Bearer ${res.body.accessToken as string}` }, driverId: res.body.driver.id, userId: res.body.driver.userId, plate };
  }

  /** A trip row (no dispatch): [kind] between [passengerId] and [driverId] in [status]. */
  async function tripRow(params: { passengerId: string; driverId?: string; kind?: 'RIDE' | 'PARCEL'; status: string }): Promise<string> {
    const trip = await prisma.trip.create({
      data: {
        kind: params.kind ?? 'PARCEL',
        status: params.status as 'SEARCHING',
        passengerId: params.passengerId,
        driverId: params.driverId,
        vehicleKind: 'GOODS_BIKE',
        pickupName: 'Gandhipuram',
        pickupAddr: 'Gandhipuram, Coimbatore',
        pickupLat: 11.0183,
        pickupLng: 76.9725,
        dropName: 'Brookefields',
        dropAddr: 'Brookefields Mall, Coimbatore',
        dropLat: 11.009,
        dropLng: 76.96,
        distanceKm: 2.1,
        durationMin: 9,
        fare: { total: 45 },
        fareTotal: 45,
        otp: '7153',
      },
    });
    return trip.id;
  }

  /** An approved driver with a photo (may go online). */
  async function approvedDriver(): Promise<{ auth: Auth; driverId: string; userId: string; plate: string }> {
    const d = await newDriver();
    await prisma.driver.update({ where: { id: d.driverId }, data: { status: 'APPROVED', photoFile: E2E_PHOTO } });
    return d;
  }

  describe('driver registration (POST /drivers)', () => {
    it('answers a repeated registration with the same driver and a fresh token', async () => {
      const { auth, userId } = await login();
      const body = registration();
      const first = await http.post('/v1/drivers').set(auth).send(body).expect(201);
      // The app lost the answer and retries with its old (passenger) token: same driver, 200, a working token.
      const again = await http.post('/v1/drivers').set(auth).send(body).expect(200);
      expect(again.body.driver.id).toBe(first.body.driver.id);
      const me = await http.get('/v1/drivers/me').set({ Authorization: `Bearer ${again.body.accessToken as string}` }).expect(200);
      expect(me.body.id).toBe(first.body.driver.id);
      // One driver, one trial.
      expect(await prisma.driver.count({ where: { userId } })).toBe(1);
      expect(await prisma.subscription.count({ where: { driverId: first.body.driver.id, status: 'TRIAL' } })).toBe(1);
    });

    it('refuses a plate another driver has, with a clear message', async () => {
      const taken = await newDriver();
      const { auth } = await login();
      const res = await http.post('/v1/drivers').set(auth).send(registration(taken.plate.toLowerCase())).expect(409);
      expect(res.body.message).toBe('This number plate is already registered');
    });

    it('refuses an admin (it would demote them)', async () => {
      const admin = await adminAuth();
      await http.post('/v1/drivers').set(admin).send(registration()).expect(403);
      expect((await http.get('/v1/me').set(admin).expect(200)).body.role).toBe('ADMIN');
    });
  });

  describe('profile edits (PATCH /drivers/me)', () => {
    it('a new plate after approval sends the driver back to pending, offline, with the RC to upload again', async () => {
      const d = await approvedDriver();
      await prisma.kycDocument.update({ where: { driverId_type: { driverId: d.driverId, type: 'VEHICLE_RC' } }, data: { status: 'VERIFIED', fileUrl: 'old-rc.jpg' } });
      await http.post('/v1/drivers/me/online').set(d.auth).send(AT).expect(200);
      expect(await redis.get(`driver:cell:${d.driverId}`)).not.toBeNull();

      // Model, colour and UPI change freely; the same plate typed differently is not a change.
      const same = await http.patch('/v1/drivers/me').set(d.auth).send({ vehicleColor: 'Yellow', upiId: 'kavin@oksbi', plate: d.plate.replace(/\s+/g, '').toLowerCase() }).expect(200);
      expect(same.body).toMatchObject({ status: 'APPROVED', isOnline: true, vehicleColor: 'Yellow', plate: d.plate });

      const plate = randomPlate();
      const res = await http.patch('/v1/drivers/me').set(d.auth).send({ plate: plate.toLowerCase() }).expect(200);
      expect(res.body).toMatchObject({ status: 'PENDING', isOnline: false, plate });
      const rc = await prisma.kycDocument.findUniqueOrThrow({ where: { driverId_type: { driverId: d.driverId, type: 'VEHICLE_RC' } } });
      expect(rc).toMatchObject({ status: 'NOT_UPLOADED', fileUrl: null, rejectReason: `Upload the RC of your new vehicle (${plate})` });
      // Out of dispatch like going offline, and it shows in the admin history.
      expect(await redis.get(`driver:cell:${d.driverId}`)).toBeNull();
      expect((await redis.get(`driver:state:${d.driverId}`)) ?? '').not.toMatch(/^1\|/);
      const history = (await http.get(`/v1/admin/users/${d.userId}/activity`).set(await adminAuth()).expect(200)).body as { summary: string }[];
      expect(history.map((h) => h.summary)).toContain(`New plate ${plate} in the app: RC to upload again`);
      await http.post('/v1/drivers/me/online').set(d.auth).send(AT).expect(403);
    });

    it("refuses another driver's plate", async () => {
      const [a, b] = [await approvedDriver(), await newDriver()];
      const res = await http.patch('/v1/drivers/me').set(b.auth).send({ plate: a.plate }).expect(409);
      expect(res.body.message).toBe('This number plate is already registered');
    });

    it('a pending driver mid sign-up just changes the plate', async () => {
      const d = await newDriver();
      const plate = randomPlate();
      expect((await http.patch('/v1/drivers/me').set(d.auth).send({ plate }).expect(200)).body).toMatchObject({ status: 'PENDING', plate });
      // Nothing uploaded yet: no reason shown on the RC.
      const rc = await prisma.kycDocument.findUniqueOrThrow({ where: { driverId_type: { driverId: d.driverId, type: 'VEHICLE_RC' } } });
      expect(rc).toMatchObject({ status: 'NOT_UPLOADED', rejectReason: null });
    });
  });

  describe('admin decisions reach the driver app (driver.status)', () => {
    /** `driver.status` events sent to [driverId]'s room while [act] runs. */
    async function statusEvents(driverId: string, act: () => Promise<unknown>): Promise<unknown[]> {
      const spy = vi.spyOn(app.get(TripEventsService), 'toDriver');
      try {
        await act();
        return spy.mock.calls.filter(([id, event]) => id === driverId && event === 'driver.status').map(([, , payload]) => payload);
      } finally {
        spy.mockRestore();
      }
    }

    it('putting an online driver on hold takes them out of dispatch and tells the app', async () => {
      const admin = await adminAuth();
      const d = await approvedDriver();
      await http.post('/v1/drivers/me/online').set(d.auth).send(AT).expect(200);
      const events = await statusEvents(d.driverId, () => http.patch(`/v1/admin/drivers/${d.driverId}`).set(admin).send({ status: 'ON_HOLD', reason: 'Insurance expired' }).expect(200));
      expect(events).toEqual([{ status: 'ON_HOLD', isOnline: false }]);
      expect(await redis.get(`driver:cell:${d.driverId}`)).toBeNull();
      // Reactivated: approved, still offline until they go online again.
      const back = await statusEvents(d.driverId, () => http.patch(`/v1/admin/drivers/${d.driverId}`).set(admin).send({ status: 'APPROVED' }).expect(200));
      expect(back).toEqual([{ status: 'APPROVED', isOnline: false }]);
    });

    it('taking a driver offline tells the app', async () => {
      const admin = await adminAuth();
      const d = await approvedDriver();
      await http.post('/v1/drivers/me/online').set(d.auth).send(AT).expect(200);
      const events = await statusEvents(d.driverId, () => http.post(`/v1/admin/drivers/${d.driverId}/offline`).set(admin).expect(200));
      expect(events).toEqual([{ status: 'APPROVED', isOnline: false }]);
      expect(await redis.get(`driver:cell:${d.driverId}`)).toBeNull();
    });

    it('a rejected document rejects an online driver, takes them offline and tells the app', async () => {
      const admin = await adminAuth();
      const d = await approvedDriver();
      await http.post('/v1/drivers/me/online').set(d.auth).send(AT).expect(200);
      await prisma.kycDocument.update({ where: { driverId_type: { driverId: d.driverId, type: 'INSURANCE' } }, data: { status: 'UNDER_REVIEW', fileUrl: 'ins.jpg' } });
      const events = await statusEvents(d.driverId, () =>
        http.post(`/v1/admin/drivers/${d.driverId}/documents/INSURANCE`).set(admin).send({ status: 'REJECTED', reason: 'Policy expired' }).expect(201),
      );
      expect(events).toEqual([{ status: 'REJECTED', isOnline: false }]);
      expect(await redis.get(`driver:cell:${d.driverId}`)).toBeNull();
      expect((await http.get('/v1/drivers/me').set(d.auth).expect(200)).body).toMatchObject({ status: 'REJECTED', isOnline: false });
    });
  });

  it('serves the booking lead time and the selfie-check switch in the public app config', async () => {
    const res = await http.get('/v1/app-config').expect(200);
    expect(res.body).toMatchObject({ scheduledDispatchLeadMin: 30, dailySelfieCheckEnabled: true });
  });

  describe('daily selfie check', () => {
    /** An approved driver whose identity check kept a reference face (so the daily check applies). */
    async function driverWithFace(): Promise<{ auth: Auth; driverId: string; userId: string; plate: string }> {
      const d = await approvedDriver();
      const selfieFile = await app.get(FileStorageService).save({ originalname: 'selfie.jpg', mimetype: 'image/jpeg', size: JPEG.length, buffer: JPEG });
      await prisma.driver.update({ where: { id: d.driverId }, data: { selfieFile } });
      return d;
    }
    const selfie = (auth: Auth) => http.post('/v1/drivers/me/selfie-check').set(auth).attach('file', JPEG, { filename: 's.jpg', contentType: 'image/jpeg' });

    afterEach(() => {
      fakeDidit.nextMatch = { score: 97, faces: 1, isMatch: true };
    });

    it('asks for the selfie before going online, once a day; a retake on no face or another person', async () => {
      const d = await driverWithFace();
      expect((await http.get('/v1/drivers/me').set(d.auth).expect(200)).body).toMatchObject({ selfieCheckRequired: true, selfieCheckedAt: null });
      const refused = await http.post('/v1/drivers/me/online').set(d.auth).send(AT).expect(403);
      expect(refused.body).toMatchObject({ code: 'SELFIE_CHECK_REQUIRED', message: 'Take your daily selfie to go online' });

      fakeDidit.nextMatch = { score: null, faces: 0, isMatch: false };
      expect((await selfie(d.auth).expect(422)).body.code).toBe('SELFIE_NO_FACE');
      fakeDidit.nextMatch = { score: 31, faces: 1, isMatch: false };
      expect((await selfie(d.auth).expect(422)).body.code).toBe('SELFIE_NO_MATCH');
      fakeDidit.nextMatch = { score: 96, faces: 1, isMatch: true };
      const ok = (await selfie(d.auth).expect(200)).body;
      expect(ok).toEqual({ passed: true, checkedAt: expect.any(String) });

      const me = (await http.get('/v1/drivers/me').set(d.auth).expect(200)).body;
      expect(me).toMatchObject({ selfieCheckRequired: false, selfieCheckedAt: ok.checkedAt });
      await http.post('/v1/drivers/me/online').set(d.auth).send(AT).expect(200);
      // Not a photo → 400.
      await http.post('/v1/drivers/me/selfie-check').set(d.auth).attach('file', Buffer.from('%PDF'), { filename: 'a.pdf', contentType: 'application/pdf' }).expect(400);
    });

    it('a driver still online from yesterday goes offline until the check is done', async () => {
      const d = await driverWithFace();
      await prisma.driver.update({ where: { id: d.driverId }, data: { isOnline: true, selfieCheckedAt: new Date(Date.now() - 2 * 86_400_000) } });
      expect((await http.post('/v1/drivers/me/online').set(d.auth).send(AT).expect(403)).body.code).toBe('SELFIE_CHECK_REQUIRED');
      expect((await prisma.driver.findUniqueOrThrow({ where: { id: d.driverId } })).isOnline).toBe(false);
    });

    it('needs a reference face first (409) and stops after 5 tries a day (429)', async () => {
      const noFace = await approvedDriver();
      expect((await http.get('/v1/drivers/me').set(noFace.auth).expect(200)).body.selfieCheckRequired).toBe(false);
      await selfie(noFace.auth).expect(409);

      const d = await driverWithFace();
      fakeDidit.nextMatch = { score: 20, faces: 1, isMatch: false };
      for (let i = 0; i < 5; i++) await selfie(d.auth).expect(422);
      expect((await selfie(d.auth).expect(429)).body.code).toBe('SELFIE_TOO_MANY_TRIES');
    });

    it('is off with the setting: nobody is asked', async () => {
      const admin = await adminAuth();
      const d = await driverWithFace();
      await http.put('/v1/admin/settings').set(admin).send({ dailySelfieCheckEnabled: false }).expect(200);
      try {
        expect((await http.get('/v1/drivers/me').set(d.auth).expect(200)).body.selfieCheckRequired).toBe(false);
        await http.post('/v1/drivers/me/online').set(d.auth).send(AT).expect(200);
      } finally {
        await http.put('/v1/admin/settings').set(admin).send({ dailySelfieCheckEnabled: true }).expect(200);
      }
    });
  });

  describe('parcel and delivery photos', () => {
    const attach = (path: string, auth: Auth, type = 'image/jpeg') => http.post(path).set(auth).attach('file', JPEG, { filename: 'p.jpg', contentType: type });

    it('the sender adds a parcel photo before pickup; the driver and admins see it, a stranger does not', async () => {
      const sender = await login();
      const d = await approvedDriver();
      const tripId = await tripRow({ passengerId: sender.userId, driverId: d.driverId, status: 'DRIVER_ASSIGNED' });
      expect((await http.get(`/v1/trips/${tripId}`).set(sender.auth).expect(200)).body.parcelPhotoFile).toBeNull();
      expect((await attach(`/v1/trips/${tripId}/parcel-photo`, sender.auth).expect(200)).body).toEqual({ ok: true });

      const forSender = (await http.get(`/v1/trips/${tripId}`).set(sender.auth).expect(200)).body;
      expect(forSender.parcelPhotoFile).toMatch(/\.jpg$/);
      expect((await http.get(`/v1/trips/${tripId}`).set(d.auth).expect(200)).body.parcelPhotoFile).toBe(forSender.parcelPhotoFile);
      expect((await http.get(`/v1/admin/trips/${tripId}`).set(await adminAuth()).expect(200)).body.parcelPhotoFile).toBe(forSender.parcelPhotoFile);
      const img = await http.get(`/v1/trips/${tripId}/parcel-photo`).set(d.auth).expect(200);
      expect(img.headers['content-type']).toContain('image/jpeg');
      await http.get(`/v1/trips/${tripId}/parcel-photo`).set(sender.auth).expect(200);
      await http.get(`/v1/trips/${tripId}/parcel-photo`).set(await adminAuth()).expect(200);
      const stranger = await login();
      await http.get(`/v1/trips/${tripId}/parcel-photo`).set(stranger.auth).expect(404);
      await attach(`/v1/trips/${tripId}/parcel-photo`, stranger.auth).expect(404);
      // Only photos; only before pickup; only parcels.
      await attach(`/v1/trips/${tripId}/parcel-photo`, sender.auth, 'application/pdf').expect(400);
      await prisma.trip.update({ where: { id: tripId }, data: { status: 'PICKED_UP' } });
      await attach(`/v1/trips/${tripId}/parcel-photo`, sender.auth).expect(409);
      const ride = await tripRow({ passengerId: sender.userId, kind: 'RIDE', status: 'SEARCHING' });
      await attach(`/v1/trips/${ride}/parcel-photo`, sender.auth).expect(400);
    });

    it('the driver adds the delivery photo at the drop; the sender and admins see it', async () => {
      const sender = await login();
      const d = await approvedDriver();
      const other = await approvedDriver();
      const tripId = await tripRow({ passengerId: sender.userId, driverId: d.driverId, status: 'DRIVER_ARRIVED' });
      // Not before pickup, and not someone else's trip.
      await attach(`/v1/trips/${tripId}/delivery-photo`, d.auth).expect(409);
      await prisma.trip.update({ where: { id: tripId }, data: { status: 'PICKED_UP' } });
      await attach(`/v1/trips/${tripId}/delivery-photo`, other.auth).expect(404);
      await attach(`/v1/trips/${tripId}/delivery-photo`, sender.auth).expect(403);
      expect((await attach(`/v1/trips/${tripId}/delivery-photo`, d.auth).expect(200)).body).toEqual({ ok: true });
      // Delivered: still allowed (taken just after marking delivered).
      await prisma.trip.update({ where: { id: tripId }, data: { status: 'DELIVERED' } });
      await attach(`/v1/trips/${tripId}/delivery-photo`, d.auth).expect(200);

      const trip = (await http.get(`/v1/trips/${tripId}`).set(sender.auth).expect(200)).body;
      expect(trip.deliveryPhotoFile).toMatch(/\.jpg$/);
      await http.get(`/v1/trips/${tripId}/delivery-photo`).set(sender.auth).expect(200);
      await http.get(`/v1/trips/${tripId}/delivery-photo`).set(await adminAuth()).expect(200);
      await http.get(`/v1/trips/${tripId}/delivery-photo`).set(other.auth).expect(404);
      // Admins also open it through the file proxy (the panel's /files/:name).
      await http.get(`/v1/admin/files/${trip.deliveryPhotoFile as string}`).set(await adminAuth()).expect(200);
    });
  });

  describe('support tickets', () => {
    it("names only the user's own trip, as rider or as its driver", async () => {
      const rider = await login();
      const d = await approvedDriver();
      const tripId = await tripRow({ passengerId: rider.userId, driverId: d.driverId, status: 'DELIVERED' });
      const body = { topic: 'Parcel issue', description: 'The box arrived wet' };
      expect((await http.post('/v1/tickets').set(rider.auth).send({ ...body, tripId }).expect(201)).body.tripId).toBe(tripId);
      await http.post('/v1/tickets').set(d.auth).send({ ...body, topic: 'Rider behaviour', tripId }).expect(201);
      const stranger = await login();
      expect((await http.post('/v1/tickets').set(stranger.auth).send({ ...body, tripId }).expect(400)).body.message).toBe('Choose one of your own trips');
      // An unknown id is a 400 too (it used to fail the foreign key with a 500).
      await http.post('/v1/tickets').set(rider.auth).send({ ...body, tripId: 'no-such-trip' }).expect(400);
    });

    it('takes one photo on the ticket; admins see it', async () => {
      const rider = await login();
      const ticket = (await http.post('/v1/tickets').set(rider.auth).send({ topic: 'Lost item', description: 'Left my bag in the cab' }).expect(201)).body;
      expect(ticket.attachmentFile).toBeNull();
      const attach = (auth: Auth, type = 'image/jpeg') => http.post(`/v1/tickets/${ticket.id as string}/attachment`).set(auth).attach('file', JPEG, { filename: 'p.jpg', contentType: type });
      const res = (await attach(rider.auth).expect(200)).body;
      expect(res).toMatchObject({ id: ticket.id, attachmentFile: expect.stringMatching(/\.jpg$/) });
      await attach(rider.auth, 'application/pdf').expect(400);
      await attach((await login()).auth).expect(404);
      const admin = await adminAuth();
      const listed = (await http.get('/v1/admin/tickets?pageSize=100').set(admin).expect(200)).body.items.find((t: { id: string }) => t.id === ticket.id);
      expect(listed.attachmentFile).toBe(res.attachmentFile);
      await http.get(`/v1/admin/files/${res.attachmentFile as string}`).set(admin).expect(200);
    });
  });

  describe('account deletion (DELETE /me)', () => {
    const stored = () => app.get(FileStorageService).save({ originalname: 'x.jpg', mimetype: 'image/jpeg', size: JPEG.length, buffer: JPEG });
    const exists = (name: string) => app.get(FileStorageService).open(name).then(() => true, () => false);

    it("wipes a rider's personal details, keeps their trips, and frees the number for a new account", async () => {
      const rider = await login();
      await http.patch('/v1/me').set(rider.auth).send({ name: 'Meena K', email: 'meena@example.com' }).expect(200);
      await prisma.savedPlace.create({ data: { userId: rider.userId, label: 'Home', name: 'Home', address: '12 Race Course Rd', lat: 11, lng: 76.9 } });
      await prisma.emergencyContact.create({ data: { userId: rider.userId, name: 'Ravi', relation: 'Brother', phone: '+919876500000' } });
      await prisma.deviceToken.create({ data: { token: `tok-${rider.userId}`, userId: rider.userId, app: 'PASSENGER' } });
      await prisma.identityVerification.create({ data: { userId: rider.userId, purpose: 'RIDER', sessionId: `del-${rider.userId}`, fullName: 'Meena K', dateOfBirth: '1990-01-01', documentLast4: '1234' } });
      const done = await tripRow({ passengerId: rider.userId, status: 'DELIVERED' });
      const photo = await stored();
      await prisma.trip.update({
        where: { id: done },
        data: { riderName: 'Amma', riderPhone: '+919876511111', parcelPhotoFile: photo, parcel: { category: 'documents', senderName: 'Meena', senderPhone: '+919876522222', receiverName: 'Raja', receiverPhone: '+919876533333', dropNote: 'Gate 2' } },
      });
      const later = await tripRow({ passengerId: rider.userId, status: 'SCHEDULED' });
      const ticket = (await http.post('/v1/tickets').set(rider.auth).send({ topic: 'Parcel issue', description: 'Box was wet', tripId: done }).expect(201)).body;
      await http.post(`/v1/tickets/${ticket.id as string}/attachment`).set(rider.auth).attach('file', JPEG, { filename: 'p.jpg', contentType: 'image/jpeg' }).expect(200);
      const ticketPhoto = (await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } })).attachmentFile!;

      await http.delete('/v1/me').set(rider.auth).expect(204);

      // Signed out everywhere at once.
      await http.get('/v1/me').set(rider.auth).expect(403);
      expect(await redis.get(accessKey(rider.userId))).toBeNull();
      // The retained row cannot be unblocked or edited, and losing Redis state cannot restore its old token.
      await http.patch(`/v1/admin/users/${rider.userId}`).set(await adminAuth()).send({ isBlocked: false }).expect(404);
      await redis.del(blockedFlagKey(rider.userId), accessKey(rider.userId));
      await http.get('/v1/me').set(rider.auth).expect(401);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: rider.userId } });
      expect(user).toMatchObject({ name: null, email: null, gender: null, phone: `deleted:${rider.userId}`, identityStatus: 'NOT_STARTED' });
      expect(user.deletedAt).not.toBeNull();
      for (const count of [
        prisma.savedPlace.count({ where: { userId: rider.userId } }),
        prisma.emergencyContact.count({ where: { userId: rider.userId } }),
        prisma.deviceToken.count({ where: { userId: rider.userId } }),
        prisma.identityVerification.count({ where: { userId: rider.userId } }),
      ]) expect(await count).toBe(0);
      // Trips stay for the records, without the personal details; the one booked for later is cancelled.
      const kept = await prisma.trip.findUniqueOrThrow({ where: { id: done } });
      expect(kept).toMatchObject({ passengerId: rider.userId, riderName: null, riderPhone: null, parcelPhotoFile: null, parcel: { category: 'documents' } });
      expect(kept.parcel).not.toHaveProperty('senderPhone');
      expect(kept.parcel).not.toHaveProperty('receiverName');
      expect((await prisma.trip.findUniqueOrThrow({ where: { id: later } })).status).toBe('CANCELLED');
      expect((await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } })).attachmentFile).toBeNull();
      expect(await exists(photo)).toBe(false);
      expect(await exists(ticketPhoto)).toBe(false);
      const audit = await prisma.auditLog.findFirst({ where: { entity: 'users', entityId: rider.userId, action: 'DELETE /v1/me' } });
      expect(audit).not.toBeNull();

      // The number signs up again as a fresh account.
      const again = await login(rider.phone);
      expect(again.userId).not.toBe(rider.userId);
      expect(again.isNewUser).toBe(true);
    });

    it('waits for an unfinished trip', async () => {
      const rider = await login();
      await tripRow({ passengerId: rider.userId, kind: 'RIDE', status: 'SEARCHING' });
      expect((await http.delete('/v1/me').set(rider.auth).expect(409)).body.message).toMatch(/current trip/);
      const d = await approvedDriver();
      await tripRow({ passengerId: rider.userId, driverId: d.driverId, status: 'PICKED_UP' });
      await http.delete('/v1/me').set(d.auth).expect(409);
    });

    it('takes a driver offline, rejects them and deletes their documents and photos; the plate is free again', async () => {
      const d = await approvedDriver();
      const [rc, selfie] = [await stored(), await stored()];
      await prisma.kycDocument.update({ where: { driverId_type: { driverId: d.driverId, type: 'VEHICLE_RC' } }, data: { status: 'VERIFIED', fileUrl: rc } });
      await prisma.driver.update({ where: { id: d.driverId }, data: { selfieFile: selfie, selfieCheckedAt: new Date(), bookingPrefs: { maxPickupKm: 3 } } });
      await http.post('/v1/drivers/me/online').set(d.auth).send(AT).expect(200);

      await http.delete('/v1/me').set(d.auth).expect(204);

      const driver = await prisma.driver.findUniqueOrThrow({ where: { id: d.driverId } });
      expect(driver).toMatchObject({ status: 'REJECTED', isOnline: false, upiId: '', photoFile: null, selfieFile: null, bookingPrefs: null });
      expect(driver.plate).not.toBe(d.plate);
      expect(await prisma.kycDocument.count({ where: { driverId: d.driverId, fileUrl: { not: null } } })).toBe(0);
      expect(await exists(rc)).toBe(false);
      expect(await exists(selfie)).toBe(false);
      expect(await redis.get(`driver:cell:${d.driverId}`)).toBeNull();
      // The same vehicle can be registered again.
      const { auth } = await login();
      await http.post('/v1/drivers').set(auth).send(registration(d.plate)).expect(201);
    });

    it('an admin deletes an account from the panel (audited), never their own', async () => {
      const admin = await adminAuth();
      const rider = await login();
      const me = (await http.get('/v1/me').set(admin).expect(200)).body as { id: string };
      await http.delete(`/v1/admin/users/${me.id}`).set(admin).expect(400);
      await http.delete(`/v1/admin/users/${rider.userId}`).set(admin).expect(204);
      await http.delete(`/v1/admin/users/${rider.userId}`).set(admin).expect(404);
      await http.get('/v1/me').set(rider.auth).expect(403);
      const history = (await http.get(`/v1/admin/users/${rider.userId}/activity`).set(admin).expect(200)).body as { summary: string }[];
      expect(history.map((h) => h.summary)).toContain('Account deleted by an admin');
    });
  });
});
