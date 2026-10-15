// End-to-end automations: admin campaigns, the search reminder from a quote, the usual-trip scan (its SQL) and the
// admin stats. Same set-up as app.e2e-spec.ts; the e2e config runs the files one after another.
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { JobsService } from '../src/core/jobs/jobs.service.js';
import { PrismaService } from '../src/core/prisma/prisma.service.js';
import { RedisService } from '../src/core/redis/redis.service.js';
import { AutomationsService, type SearchPayload } from '../src/modules/automations/automations.service.js';
import { CAMPAIGN_JOB } from '../src/modules/automations/campaigns.service.js';
import { SEARCH_REMINDER_JOB } from '../src/modules/automations/reminders.js';

const GANDHIPURAM = { lat: 11.0183, lng: 76.9725, placeId: 'gandhipuram', name: 'Gandhipuram Central Bus Stand' };
const BROOKEFIELDS = { lat: 11.009, lng: 76.96, placeId: 'brookefields', name: 'Brookefields Mall', address: 'Krishnaswamy Mudaliyar Rd' };
const ADMIN_PHONE = '9000000001';

type Auth = { Authorization: string };

/** [h]:[m] IST on [day] Oct 2026 (15 Oct is a Thursday). */
const ist = (h: number, m = 0, day = 15) => new Date(Date.UTC(2026, 9, day, h, m) - 330 * 60_000);

function phone(): string {
  return `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
}

describe('Tamil Taxi automations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jobs: JobsService;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    process.env.OTP_DEV_MODE = 'true';
    process.env.ADMIN_PHONES = ADMIN_PHONE;
    process.env.GOOGLE_MAPS_API_KEY = '';
    process.env.DIDIT_API_KEY = '';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    prisma = app.get(PrismaService);
    jobs = app.get(JobsService);
    const redis = app.get(RedisService);
    const keys = [...(await redis.keys('otp:*')), ...(await redis.keys('rl:*'))];
    if (keys.length) await redis.del(...keys);
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(p = phone(), as?: 'admin'): Promise<{ auth: Auth; userId: string }> {
    await http.post('/v1/auth/otp').send({ phone: p }).expect(200);
    const res = await http.post('/v1/auth/verify').send({ phone: p, code: '123456', app: as }).expect(200);
    const auth = { Authorization: `Bearer ${res.body.accessToken as string}` };
    return { auth, userId: (await http.get('/v1/me').set(auth).expect(200)).body.id as string };
  }

  let admin: Auth | null = null;
  async function adminAuth(): Promise<Auth> {
    admin ??= (await login(ADMIN_PHONE, 'admin')).auth;
    return admin;
  }

  it('campaigns: send now, schedule, list, cancel and delete (admins only)', async () => {
    const auth = await adminAuth();
    const now = (await http.post('/v1/admin/campaigns').set(auth).send({ title: 'Happy Deepavali', body: 'Going home? Book early.' }).expect(201)).body;
    expect(now).toMatchObject({ status: 'SENT', target: 'HOME', title: 'Happy Deepavali' });
    expect(now.sentAt).toBeTruthy();

    const sendAt = new Date(Date.now() + 3600_000).toISOString();
    const later = (await http.post('/v1/admin/campaigns').set(auth).send({ title: 'Weekend trip?', body: 'Rent a cab by the hour', target: 'RENTAL', sendAt }).expect(201)).body;
    expect(later).toMatchObject({ status: 'SCHEDULED', target: 'RENTAL', sendAt });
    expect(await jobs.scheduledAt(CAMPAIGN_JOB, later.id)).toBe(new Date(sendAt).getTime());

    const list = (await http.get('/v1/admin/campaigns').set(auth).expect(200)).body as { id: string; status: string }[];
    expect(list[0].status).toBe('SCHEDULED');
    const ids = list.map((c) => c.id);
    expect(ids.indexOf(later.id)).toBeLessThan(ids.indexOf(now.id));

    const past = await http.post('/v1/admin/campaigns').set(auth).send({ title: 'Late', body: 'x', sendAt: new Date(Date.now() - 3600_000).toISOString() }).expect(400);
    expect(past.body.message).toBe('Pick a time in the future');
    await http.post('/v1/admin/campaigns').set(auth).send({ title: 'x'.repeat(66), body: 'x' }).expect(400);
    await http.post('/v1/admin/campaigns').set(auth).send({ title: 'x', body: 'x', target: 'MOON' }).expect(400);

    expect((await http.post(`/v1/admin/campaigns/${later.id}/cancel`).set(auth).expect(200)).body.status).toBe('CANCELLED');
    expect(await jobs.scheduledAt(CAMPAIGN_JOB, later.id)).toBeNull();
    await http.post(`/v1/admin/campaigns/${later.id}/cancel`).set(auth).expect(409);
    await http.post(`/v1/admin/campaigns/${now.id}/cancel`).set(auth).expect(409);

    await http.delete(`/v1/admin/campaigns/${later.id}`).set(auth).expect(204);
    await http.delete(`/v1/admin/campaigns/${later.id}`).set(auth).expect(404);
    await http.delete(`/v1/admin/campaigns/${now.id}`).set(auth).expect(204);

    const rider = await login();
    await http.get('/v1/admin/campaigns').set(rider.auth).expect(403);
    await http.post('/v1/admin/campaigns').set(rider.auth).send({ title: 'x', body: 'y' }).expect(403);
  });

  it('a ride quote schedules the search reminder; it is sent, logged and counted as booked', async () => {
    const pax = await login();
    await http.post('/v1/fares/quote').set(pax.auth).send({ pickup: GANDHIPURAM, drop: BROOKEFIELDS }).expect(200);
    let at: number | null = null;
    for (let i = 0; i < 20 && at === null; i++) {
      at = await jobs.scheduledAt(SEARCH_REMINDER_JOB, pax.userId);
      if (at === null) await new Promise((r) => setTimeout(r, 50));
    }
    expect(at! - Date.now()).toBeGreaterThan(9 * 60_000);
    await jobs.cancel(SEARCH_REMINDER_JOB, pax.userId);
    // A parcel quote doesn't.
    const sender = await login();
    await http.post('/v1/fares/quote').set(sender.auth).send({ pickup: GANDHIPURAM, drop: BROOKEFIELDS, kind: 'PARCEL' }).expect(200);
    await new Promise((r) => setTimeout(r, 100));
    expect(await jobs.scheduledAt(SEARCH_REMINDER_JOB, sender.userId)).toBeNull();

    // The job, run now in the day (outside quiet hours).
    const automations = app.get(AutomationsService);
    const payload: SearchPayload = {
      quotedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      mode: 'LOCAL',
      pickup: { name: GANDHIPURAM.name, address: '', lat: GANDHIPURAM.lat, lng: GANDHIPURAM.lng },
      drop: { name: BROOKEFIELDS.name, address: BROOKEFIELDS.address, lat: BROOKEFIELDS.lat, lng: BROOKEFIELDS.lng },
    };
    const noon = new Date(Math.floor((Date.now() + 330 * 60_000) / 86_400_000) * 86_400_000 + 12 * 3600_000 - 330 * 60_000);
    await automations.searchReminder(pax.userId, payload, noon);
    await automations.searchReminder(pax.userId, payload, noon); // same place: once
    const sent = await prisma.reminder.findMany({ where: { userId: pax.userId } });
    expect(sent).toMatchObject([{ kind: 'SEARCH', title: 'Still going to Brookefields Mall?' }]);

    // The rider books right after: the stats count it.
    await prisma.trip.create({
      data: {
        kind: 'RIDE',
        status: 'CANCELLED',
        passengerId: pax.userId,
        vehicleKind: 'AUTO',
        pickupName: 'A',
        pickupAddr: '',
        pickupLat: GANDHIPURAM.lat,
        pickupLng: GANDHIPURAM.lng,
        dropName: 'B',
        dropAddr: '',
        dropLat: BROOKEFIELDS.lat,
        dropLng: BROOKEFIELDS.lng,
        distanceKm: 2,
        durationMin: 8,
        fare: {},
        fareTotal: 40,
        otp: '1234',
        createdAt: new Date(sent[0].sentAt.getTime() + 60_000),
      },
    });
    const stats = (await http.get('/v1/admin/automations').set(await adminAuth()).expect(200)).body;
    expect(stats.search.sent7d).toBeGreaterThanOrEqual(1);
    expect(stats.search.booked7d).toBeGreaterThanOrEqual(1);
    expect(stats.routine).toEqual({ sent7d: expect.any(Number), booked7d: expect.any(Number) });
    expect(stats.recent.find((r: { id: string }) => r.id === sent[0].id)).toMatchObject({
      kind: 'SEARCH',
      userId: pax.userId,
      userName: null,
      phone: expect.any(String),
      booked: true,
      sentAt: sent[0].sentAt.toISOString(),
    });
  });

  it('the usual-trip scan finds rides to the same drop at the same time on 3 days', async () => {
    const pax = await login();
    // Mon–Wed 12–14 Oct, booked around 12:10 IST; one at 15:00 doesn't count.
    const ride = (createdAt: Date) => ({
      kind: 'RIDE' as const,
      status: 'COMPLETED' as const,
      passengerId: pax.userId,
      vehicleKind: 'AUTO' as const,
      pickupName: 'Home',
      pickupAddr: 'RS Puram',
      pickupLat: 11.0,
      pickupLng: 76.95,
      dropName: BROOKEFIELDS.name,
      dropAddr: BROOKEFIELDS.address,
      dropLat: BROOKEFIELDS.lat,
      dropLng: BROOKEFIELDS.lng,
      distanceKm: 4,
      durationMin: 14,
      fare: {},
      fareTotal: 66,
      otp: '1234',
      createdAt,
    });
    for (const at of [ist(12, 8, 12), ist(12, 12, 13), ist(12, 10, 14), ist(15, 0, 11)]) await prisma.trip.create({ data: ride(at) });
    const automations = app.get(AutomationsService);
    // Too early on Thursday (the usual 12:10 is 30 min away); a Saturday at the right time is another day type.
    await automations.scanRoutines(ist(11, 40));
    await automations.scanRoutines(ist(11, 55, 17));
    expect(await prisma.reminder.count({ where: { userId: pax.userId } })).toBe(0);
    // 15 min before it on Thursday; the next scan doesn't send again.
    await automations.scanRoutines(ist(11, 55));
    await automations.scanRoutines(ist(12, 0));
    const sent = await prisma.reminder.findMany({ where: { userId: pax.userId } });
    expect(sent).toMatchObject([{ kind: 'ROUTINE', title: 'Going to Brookefields Mall?', body: 'Your usual 12:10 pm ride is a tap away. Book an Auto now.' }]);
  });
});
