// End-to-end safety flows (share links, SOS, stop / route checks). Same set-up as app.e2e-spec.ts; the e2e config
// runs the files one after another (they share the test database and Redis).
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { JobsService } from '../src/core/jobs/jobs.service.js';
import { PrismaService } from '../src/core/prisma/prisma.service.js';
import { RedisService } from '../src/core/redis/redis.service.js';
import { isNightIst, istHourOf } from '../src/modules/safety/night-window.js';
import { SettingsService } from '../src/modules/settings/settings.service.js';
import { encodePolyline } from '../src/modules/trips/trip-path.js';

const GANDHIPURAM = { lat: 11.0183, lng: 76.9725, placeId: 'gandhipuram', name: 'Gandhipuram Central Bus Stand' };
const BROOKEFIELDS = { lat: 11.009, lng: 76.96, placeId: 'brookefields', name: 'Brookefields Mall' };
const ADMIN_PHONE = '9000000001';
/** A stored photo so drivers approved directly in the database may go online. */
const E2E_PHOTO = '00000000-0000-4000-8000-00000000e2e0.jpg';

type Auth = { Authorization: string };

function randomPlate(): string {
  const letter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return `TN ${10 + Math.floor(Math.random() * 90)} ${letter()}${letter()}${letter()} ${Math.floor(1000 + Math.random() * 8999)}`;
}

function phone(): string {
  return `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
}

describe('Tamil Taxi safety (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    process.env.OTP_DEV_MODE = 'true';
    process.env.ADMIN_PHONES = ADMIN_PHONE;
    process.env.GOOGLE_MAPS_API_KEY = '';
    process.env.SHARE_BASE_URL = 'https://track.example.test';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    const keys = [...(await redis.keys('otp:*')), ...(await redis.keys('h3:*')), ...(await redis.keys('driver:*')), ...(await redis.keys('dispatch:*')), ...(await redis.keys('rl:*'))];
    if (keys.length) await redis.del(...keys);
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(p = phone(), app?: 'admin'): Promise<Auth> {
    await http.post('/v1/auth/otp').send({ phone: p }).expect(200);
    const res = await http.post('/v1/auth/verify').send({ phone: p, code: '123456', app }).expect(200);
    return { Authorization: `Bearer ${res.body.accessToken as string}` };
  }

  let admin: Auth | null = null;
  /** The admin's token, signed in once (OTP sends are limited per phone). */
  async function adminAuth(): Promise<Auth> {
    admin ??= await login(ADMIN_PHONE, 'admin');
    return admin;
  }

  /** Only this bike driver is indexed, online at the pickup; a new rider books a bike ride and the driver accepts. */
  async function assignedBikeTrip() {
    const cells = await redis.keys('h3:drv:BIKE:*');
    if (cells.length) await redis.del(...cells);
    const user = await login();
    const reg = await http
      .post('/v1/drivers')
      .set(user)
      .send({ name: 'Selvam Raj', workType: 'RIDES', vehicleKind: 'BIKE', vehicleModel: 'TVS Jupiter', vehicleColor: 'Blue', plate: randomPlate(), upiId: 'selvam@okaxis' })
      .expect(201);
    await prisma.driver.update({ where: { id: reg.body.driver.id }, data: { status: 'APPROVED', photoFile: E2E_PHOTO } });
    const driver = { Authorization: `Bearer ${reg.body.accessToken as string}` };
    await http.post('/v1/drivers/me/online').set(driver).send({ lat: 11.019, lng: 76.973 }).expect(200);
    const pax = await login();
    const trip = (await http.post('/v1/trips').set(pax).send({ kind: 'RIDE', vehicleKind: 'BIKE', pickup: GANDHIPURAM, drop: BROOKEFIELDS }).expect(201)).body;
    let status = 0;
    for (let i = 0; i < 40 && status !== 200; i++) {
      status = (await http.post(`/v1/trips/${trip.id}/accept`).set(driver)).status;
      if (status !== 200) await new Promise((r) => setTimeout(r, 250));
    }
    expect(status).toBe(200);
    return { trip, driver, pax, driverId: reg.body.driver.id as string };
  }

  /** Arrive and start the ride (the driver is at the pickup). */
  async function startRide(t: { trip: { id: string; otp: string }; driver: Auth }): Promise<void> {
    await http.post('/v1/drivers/me/location').set(t.driver).send({ lat: GANDHIPURAM.lat, lng: GANDHIPURAM.lng }).expect(204);
    await http.post(`/v1/trips/${t.trip.id}/arrived`).set(t.driver).expect(200);
    await http.post(`/v1/trips/${t.trip.id}/start`).set(t.driver).send({ otp: t.trip.otp }).expect(200);
  }

  it('shares a live trip link: public, minimal, and it expires 30 min after the trip ends', async () => {
    const t = await assignedBikeTrip();
    const link = (await http.post(`/v1/trips/${t.trip.id}/share`).set(t.pax).expect(200)).body;
    expect(link.url).toBe(`https://track.example.test/track/${link.token}`);
    // Only the passenger makes links; a stranger can't.
    const stranger = await login();
    await http.post(`/v1/trips/${t.trip.id}/share`).set(stranger).expect(403);

    // Public read (no token): driver's first name, vehicle, plate, live position; no phone numbers or OTP.
    await http.post('/v1/drivers/me/location').set(t.driver).send({ lat: 11.0185, lng: 76.9727 }).expect(204);
    const view = (await http.get(`/v1/share/${link.token}`).expect(200)).body;
    expect(view).toMatchObject({
      status: 'DRIVER_ASSIGNED',
      isLive: true,
      driver: { firstName: 'Selvam', vehicleModel: 'TVS Jupiter', vehicleColor: 'Blue', vehicleKind: 'BIKE' },
      location: { lat: 11.0185, lng: 76.9727 },
      pickup: { name: GANDHIPURAM.name },
      drop: { name: BROOKEFIELDS.name },
      etaTo: 'pickup',
    });
    expect(view.etaMin).toBeGreaterThanOrEqual(1);
    const raw = JSON.stringify(view);
    expect(raw).not.toMatch(/\+91|phone|otp/i);

    // A tampered token is not found.
    await http.get(`/v1/share/${link.token.slice(0, -1)}${link.token.endsWith('A') ? 'B' : 'A'}`).expect(404);

    // The trip ends: the link keeps working (no live position) for 30 min, then 410.
    await startRide(t);
    await http.post('/v1/drivers/me/location').set(t.driver).send({ lat: BROOKEFIELDS.lat, lng: BROOKEFIELDS.lng }).expect(204);
    await http.post(`/v1/trips/${t.trip.id}/complete`).set(t.driver).send({}).expect(200);
    expect((await http.get(`/v1/share/${link.token}`).expect(200)).body).toMatchObject({ status: 'COMPLETED', isLive: false, location: null });
    await prisma.trip.update({ where: { id: t.trip.id }, data: { endedAt: new Date(Date.now() - 31 * 60_000) } });
    await http.get(`/v1/share/${link.token}`).expect(410);
    await http.post(`/v1/trips/${t.trip.id}/share`).set(t.pax).expect(410);
    await http.post('/v1/drivers/me/offline').set(t.driver);
  }, 45_000);

  it('rate limits public share reads per IP', async () => {
    await redis.del('rl:share:ip:10.9.8.7');
    for (let i = 0; i < 60; i++) await http.get('/v1/share/nope.1.aaaaaaaaaaaaaaaaaaaaaa').set('x-forwarded-for', '10.9.8.7').expect(404);
    expect((await http.get('/v1/share/nope.1.aaaaaaaaaaaaaaaaaaaaaa').set('x-forwarded-for', '10.9.8.7').expect(429)).body.code).toBe('RATE_LIMITED');
  });

  it('SOS: passenger or driver raises it, admins acknowledge and resolve it (audit logged)', async () => {
    const t = await assignedBikeTrip();
    const adm = await adminAuth();
    const stranger = await login();
    await http.post(`/v1/trips/${t.trip.id}/sos`).set(stranger).send({}).expect(403);

    // The passenger presses SOS with the phone's fix: recorded, linked on the trip, answered with a live link.
    const res = (await http.post(`/v1/trips/${t.trip.id}/sos`).set(t.pax).send({ lat: 11.0184, lng: 76.9726 }).expect(200)).body;
    expect(res.sos).toMatchObject({ tripId: t.trip.id, role: 'PASSENGER', status: 'OPEN', source: 'BUTTON', lat: 11.0184, lng: 76.9726 });
    expect(res.shareUrl).toMatch(/^https:\/\/track\.example\.test\/track\//);
    // A double tap returns the same SOS.
    expect((await http.post(`/v1/trips/${t.trip.id}/sos`).set(t.pax).send({}).expect(200)).body.sos.id).toBe(res.sos.id);
    // The driver's SOS has no fix from the phone: their last GPS fix is used.
    await http.post('/v1/drivers/me/location').set(t.driver).send({ lat: 11.019, lng: 76.9731 }).expect(204);
    const drv = (await http.post(`/v1/trips/${t.trip.id}/sos`).set(t.driver).send({ note: 'Passenger is aggressive' }).expect(200)).body.sos;
    expect(drv).toMatchObject({ role: 'DRIVER', lat: 11.019, lng: 76.9731, note: 'Passenger is aggressive' });

    // Admin queue: open ones first; the trip page shows the SOS and its SOS_LINKED events.
    const list = (await http.get('/v1/admin/sos?status=active').set(adm).expect(200)).body;
    expect(list.open).toBeGreaterThanOrEqual(2);
    expect(list.items.map((i: { id: string }) => i.id)).toEqual(expect.arrayContaining([res.sos.id, drv.id]));
    const tripPage = (await http.get(`/v1/admin/trips/${t.trip.id}`).set(adm).expect(200)).body;
    expect(tripPage.sos).toHaveLength(2);
    expect(tripPage.safetyEvents.filter((e: { kind: string }) => e.kind === 'SOS_LINKED')).toHaveLength(2);

    // Acknowledge (once), then resolve with a note; a closed SOS can't be resolved again. Both are audit logged.
    expect((await http.post(`/v1/admin/sos/${res.sos.id}/ack`).set(adm).expect(200)).body.status).toBe('ACKNOWLEDGED');
    await http.post(`/v1/admin/sos/${res.sos.id}/ack`).set(adm).expect(409);
    const done = (await http.post(`/v1/admin/sos/${res.sos.id}/resolve`).set(adm).send({ status: 'RESOLVED', note: 'Called the rider, all fine' }).expect(200)).body;
    expect(done).toMatchObject({ status: 'RESOLVED', note: 'Called the rider, all fine' });
    expect(done.resolvedBy).toBeTruthy();
    await http.post(`/v1/admin/sos/${res.sos.id}/resolve`).set(adm).send({ status: 'FALSE_ALARM' }).expect(409);
    expect((await http.post(`/v1/admin/sos/${drv.id}/resolve`).set(adm).send({ status: 'FALSE_ALARM' }).expect(200)).body).toMatchObject({ status: 'FALSE_ALARM' });
    await http.post(`/v1/admin/sos/${drv.id}/resolve`).set(t.pax).send({ status: 'RESOLVED' }).expect(403);
    // The audit interceptor writes after the response.
    await new Promise((r) => setTimeout(r, 200));
    const audit = await prisma.auditLog.findMany({ where: { entity: 'sos', entityId: res.sos.id } });
    expect(audit.map((a) => a.action).sort()).toEqual(['POST /v1/admin/sos/:id/ack', 'POST /v1/admin/sos/:id/resolve']);
    await http.post('/v1/drivers/me/offline').set(t.driver);
  }, 45_000);

  /** [n] fixes 5 s apart at [at] with a few metres of GPS noise, the last one [endAgoMs] before now. */
  function standing(at: { lat: number; lng: number }, n: number, endAgoMs = 0) {
    const t0 = Date.now() - endAgoMs - (n - 1) * 5000;
    return Array.from({ length: n }, (_, i) => ({ lat: at.lat + (i % 2 ? 0.00005 : -0.00005), lng: at.lng, ts: t0 + i * 5000, acc: 6 }));
  }

  it('a long stop mid-ride asks the passenger "Is everything OK?" once; "Get help" raises an SOS', async () => {
    const t = await assignedBikeTrip();
    await startRide(t);
    expect(await redis.hget(`trip:safety:${t.trip.id}`, 'pid')).toBeTruthy();
    // ~700 m from both ends, standing still for 5 min (flushed as one batch), then 3 more minutes there.
    const mid = { lat: 11.0137, lng: 76.9663 };
    await http.post('/v1/drivers/me/locations').set(t.driver).send({ fixes: standing(mid, 61, 3 * 60_000) }).expect(200);
    await http.post('/v1/drivers/me/locations').set(t.driver).send({ fixes: standing(mid, 30) }).expect(200);
    const stops = await prisma.safetyEvent.findMany({ where: { tripId: t.trip.id, kind: 'STOP' } });
    expect(stops).toHaveLength(1);
    expect(stops[0].payload).toMatchObject({ pushed: true });
    expect((stops[0].payload as { minutes: number }).minutes).toBeGreaterThanOrEqual(4);

    // "I'm OK" is kept on the event; "Get help" raises an SOS from the check. Only the passenger answers.
    await http.post(`/v1/trips/${t.trip.id}/safety-check`).set(t.driver).send({ answer: 'OK', eventId: stops[0].id }).expect(403);
    expect((await http.post(`/v1/trips/${t.trip.id}/safety-check`).set(t.pax).send({ answer: 'OK', eventId: stops[0].id }).expect(200)).body).toEqual({ answer: 'OK', sos: null });
    expect((await prisma.safetyEvent.findUniqueOrThrow({ where: { id: stops[0].id } })).payload).toMatchObject({ answer: 'OK' });
    const help = (await http.post(`/v1/trips/${t.trip.id}/safety-check`).set(t.pax).send({ answer: 'HELP', eventId: stops[0].id }).expect(200)).body;
    expect(help.sos.sos).toMatchObject({ source: 'CHECK', role: 'PASSENGER', status: 'OPEN' });
    await http.post(`/v1/trips/${t.trip.id}/safety-check`).set(t.pax).send({ answer: 'OK', eventId: 'nope' }).expect(404);

    // Waiting at the drop is not a stop; the state is dropped when the ride ends.
    await http.post('/v1/drivers/me/locations').set(t.driver).send({ fixes: standing({ lat: BROOKEFIELDS.lat, lng: BROOKEFIELDS.lng }, 70) }).expect(200);
    expect(await prisma.safetyEvent.count({ where: { tripId: t.trip.id, kind: 'STOP' } })).toBe(1);
    await http.post(`/v1/trips/${t.trip.id}/complete`).set(t.driver).send({}).expect(200);
    expect(await redis.exists(`trip:safety:${t.trip.id}`)).toBe(0);
    await http.post('/v1/drivers/me/offline').set(t.driver);
  }, 45_000);

  it('flags a deviation from the quoted route; at night one over 1 km asks the passenger, and the ride start offers sharing', async () => {
    const settings = app.get(SettingsService);
    // "Night" now: a window from this IST hour for 2 hours.
    const hour = istHourOf(new Date());
    await settings.update({ nightStartHour: hour, nightEndHour: (hour + 2) % 24 });
    expect(isNightIst(new Date(), hour, (hour + 2) % 24)).toBe(true);
    try {
      const t = await assignedBikeTrip();
      // Without Google the booking has no route: give it one (pickup → south → west to the drop), and turn auto-share off.
      const corner = { lat: 11.009, lng: 76.9725 };
      await prisma.trip.update({ where: { id: t.trip.id }, data: { routePolyline: encodePolyline([GANDHIPURAM, corner, BROOKEFIELDS]) } });
      await http.patch('/v1/me').set(t.pax).send({ autoShareTrips: false }).expect(200);
      await startRide(t);
      expect(await prisma.safetyEvent.findMany({ where: { tripId: t.trip.id, kind: 'NIGHT_CHECK' } })).toEqual([
        expect.objectContaining({ payload: expect.objectContaining({ check: 'NIGHT_START', pushed: true }) }),
      ]);

      const eastOf = (lat: number, m: number) => ({ lat, lng: 76.9725 + m / (111_320 * Math.cos((lat * Math.PI) / 180)) });
      const fixes = (m: number, lats: number[], from: number) => lats.map((lat, i) => ({ ...eastOf(lat, m), ts: from + i * 5000, acc: 6 }));
      const t0 = Date.now() - 60_000;
      // Two fixes 400 m off, one back on the route: nothing. Then three in a row 400 m off: a deviation (no push).
      await http.post('/v1/drivers/me/locations').set(t.driver).send({ fixes: [...fixes(400, [11.017, 11.016], t0), { lat: 11.015, lng: 76.9725, ts: t0 + 10_000 }] }).expect(200);
      expect(await prisma.safetyEvent.count({ where: { tripId: t.trip.id, kind: 'DEVIATION' } })).toBe(0);
      await http.post('/v1/drivers/me/locations').set(t.driver).send({ fixes: fixes(400, [11.0145, 11.014, 11.0135], t0 + 15_000) }).expect(200);
      const first = await prisma.safetyEvent.findMany({ where: { tripId: t.trip.id, kind: 'DEVIATION' } });
      expect(first).toHaveLength(1);
      expect(first[0].payload).toMatchObject({ pushed: false, night: true });
      expect((first[0].payload as { offM: number }).offM).toBeGreaterThan(350);

      // At night, 1.5 km off: "Your driver changed route. Is everything OK?" (once).
      await http.post('/v1/drivers/me/locations').set(t.driver).send({ fixes: fixes(1500, [11.013, 11.0125, 11.012, 11.0115], t0 + 30_000) }).expect(200);
      await http.post('/v1/drivers/me/locations').set(t.driver).send({ fixes: fixes(1600, [11.011, 11.0105, 11.01], t0 + 50_000) }).expect(200);
      const all = await prisma.safetyEvent.findMany({ where: { tripId: t.trip.id, kind: 'DEVIATION' }, orderBy: { at: 'asc' } });
      expect(all).toHaveLength(2);
      expect(all[1].payload).toMatchObject({ pushed: true, night: true });
      expect((all[1].payload as { offM: number }).offM).toBeGreaterThan(1000);

      await http.post('/v1/drivers/me/location').set(t.driver).send({ lat: BROOKEFIELDS.lat, lng: BROOKEFIELDS.lng }).expect(204);
      await http.post(`/v1/trips/${t.trip.id}/complete`).set(t.driver).send({}).expect(200);
      await http.post('/v1/drivers/me/offline').set(t.driver);
    } finally {
      await settings.update({ nightStartHour: 22, nightEndHour: 5 });
    }
  }, 45_000);

  it('after a night ride asks "Did you reach safely?"; "No, I need help" alerts admins with an SOS', async () => {
    const settings = app.get(SettingsService);
    const jobs = app.get(JobsService);
    const hour = istHourOf(new Date());
    await settings.update({ nightStartHour: hour, nightEndHour: (hour + 2) % 24 });
    try {
      const t = await assignedBikeTrip();
      await startRide(t);
      await http.post('/v1/drivers/me/location').set(t.driver).send({ lat: BROOKEFIELDS.lat, lng: BROOKEFIELDS.lng }).expect(204);
      const done = (await http.post(`/v1/trips/${t.trip.id}/complete`).set(t.driver).send({}).expect(200)).body;
      const due = await jobs.scheduledAt('safety.arrival-check', t.trip.id);
      expect(due).toBe(new Date(done.endedAt).getTime() + 5 * 60_000);
      await jobs.runDue(due!);
      expect(await jobs.scheduledAt('safety.arrival-check', t.trip.id)).toBeNull();
      const check = await prisma.safetyEvent.findFirstOrThrow({ where: { tripId: t.trip.id, kind: 'NIGHT_CHECK', payload: { path: ['check'], equals: 'SAFE_ARRIVAL' } } });
      expect(check.payload).toMatchObject({ pushed: true });

      const help = (await http.post(`/v1/trips/${t.trip.id}/safety-check`).set(t.pax).send({ answer: 'HELP', eventId: check.id, lat: 11.0091, lng: 76.9601 }).expect(200)).body;
      expect(help.sos.sos).toMatchObject({ source: 'ARRIVAL', status: 'OPEN', lat: 11.0091, lng: 76.9601 });
      expect(help.sos.sos.note).toMatch(/Did you reach safely/);
      expect((await prisma.safetyEvent.findUniqueOrThrow({ where: { id: check.id } })).payload).toMatchObject({ answer: 'HELP' });
      const queue = (await http.get('/v1/admin/sos?status=OPEN').set(await adminAuth()).expect(200)).body;
      expect(queue.items.map((i: { id: string }) => i.id)).toContain(help.sos.sos.id);
      await http.post('/v1/drivers/me/offline').set(t.driver);
    } finally {
      await settings.update({ nightStartHour: 22, nightEndHour: 5 });
    }
  }, 45_000);

  it('no arrival check after a daytime ride', async () => {
    const settings = app.get(SettingsService);
    const hour = istHourOf(new Date());
    // A night window that excludes now.
    await settings.update({ nightStartHour: (hour + 3) % 24, nightEndHour: (hour + 4) % 24 });
    try {
      const t = await assignedBikeTrip();
      await startRide(t);
      await http.post('/v1/drivers/me/location').set(t.driver).send({ lat: BROOKEFIELDS.lat, lng: BROOKEFIELDS.lng }).expect(204);
      await http.post(`/v1/trips/${t.trip.id}/complete`).set(t.driver).send({}).expect(200);
      expect(await app.get(JobsService).scheduledAt('safety.arrival-check', t.trip.id)).toBeNull();
      expect(await prisma.safetyEvent.count({ where: { tripId: t.trip.id, kind: 'NIGHT_CHECK' } })).toBe(0);
      await http.post('/v1/drivers/me/offline').set(t.driver);
    } finally {
      await settings.update({ nightStartHour: 22, nightEndHour: 5 });
    }
  }, 45_000);
});
