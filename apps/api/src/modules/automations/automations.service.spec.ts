import { describe, expect, it, vi } from 'vitest';

import { SETTING_DEFAULTS, type Settings } from '../settings/settings.defaults.js';
import { AutomationsService, type SearchPayload } from './automations.service.js';
import { placeKey, ROUTINE_SCAN_EVERY_MS, ROUTINE_SCAN_ID, ROUTINE_SCAN_JOB, type RoutineTrip, SEARCH_REMINDER_JOB } from './reminders.js';

/** [h]:[m] IST on [day] Oct 2026 (15 Oct is a Thursday). */
const ist = (h: number, m = 0, day = 15) => new Date(Date.UTC(2026, 9, day, h, m) - 330 * 60_000);

const OOTY = { name: 'Ooty', address: 'The Nilgiris', lat: 11.4102, lng: 76.695 };
const HOME = { name: 'Home', address: 'RS Puram, Coimbatore', lat: 11.0, lng: 76.95 };

type User = { name: string | null; isBlocked: boolean; deletedAt: Date | null } | null;

function setup(o: { user?: User; trip?: { id: string } | null; sent?: { place: string | null; sentAt: Date }[]; s?: Partial<Settings>; rows?: RoutineTrip[] } = {}) {
  const reminders: Record<string, unknown>[] = [];
  const prisma = {
    user: { findUnique: vi.fn(async () => (o.user === undefined ? { name: 'Siva Krishna', isBlocked: false, deletedAt: null } : o.user)) },
    trip: { findFirst: vi.fn<(args: unknown) => Promise<{ id: string } | null>>(async () => o.trip ?? null) },
    reminder: {
      findMany: vi.fn(async () => o.sent ?? []),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => (reminders.push(data), data)),
    },
    $queryRaw: vi.fn(async () => o.rows ?? []),
  };
  const jobs = { register: vi.fn(), schedule: vi.fn(async () => undefined), scheduledAt: vi.fn(async (): Promise<number | null> => null) };
  const push = { toUser: vi.fn() };
  const settings = { all: vi.fn(async () => ({ ...SETTING_DEFAULTS, ...o.s }) as Settings) };
  const svc = new AutomationsService(prisma as never, jobs as never, push as never, settings as never);
  return { svc, prisma, jobs, push, settings, reminders };
}

const payload = (quotedAt: Date, mode: 'LOCAL' | 'OUTSTATION' = 'OUTSTATION'): SearchPayload => ({ quotedAt: quotedAt.toISOString(), mode, pickup: HOME, drop: OOTY });

describe('search reminder', () => {
  it('a quote schedules the job for the rider (a newer quote replaces it) with the pickup and drop', async () => {
    const { svc, jobs } = setup();
    const before = Date.now();
    svc.searched({ userId: 'u1', mode: 'OUTSTATION', pickup: { lat: 11, lng: 76.95 }, drop: { ...OOTY, name: ' Ooty ' } });
    await vi.waitFor(() => expect(jobs.schedule).toHaveBeenCalled());
    const [kind, id, runAt, p] = jobs.schedule.mock.calls[0] as unknown as [string, string, number, SearchPayload];
    expect([kind, id]).toEqual([SEARCH_REMINDER_JOB, 'u1']);
    expect(runAt - before).toBeGreaterThanOrEqual(10 * 60_000);
    expect(p).toMatchObject({ mode: 'OUTSTATION', pickup: { name: '', address: '', lat: 11, lng: 76.95 }, drop: OOTY });
  });

  it('nothing is scheduled with the setting off, and a failure never reaches the quote', async () => {
    const off = setup({ s: { searchReminderEnabled: false } });
    off.svc.searched({ userId: 'u1', mode: 'LOCAL', pickup: HOME, drop: OOTY });
    await new Promise((r) => setTimeout(r, 10));
    expect(off.jobs.schedule).not.toHaveBeenCalled();
    const broken = setup();
    broken.settings.all.mockRejectedValue(new Error('db down'));
    expect(() => broken.svc.searched({ userId: 'u1', mode: 'LOCAL', pickup: HOME, drop: OOTY })).not.toThrow();
  });

  it('sends "Siva, Ooty?" with the drop and pickup, and logs it', async () => {
    const { svc, push, reminders } = setup();
    await svc.searchReminder('u1', payload(ist(9, 50)), ist(10));
    expect(push.toUser).toHaveBeenCalledWith('u1', 'PASSENGER', {
      title: 'Siva, Ooty?',
      body: 'Drivers are available. Confirm now to get an outstation cab right at your doorstep.',
      channel: 'suggestions',
      data: {
        type: 'suggest',
        kind: 'search',
        mode: 'OUTSTATION',
        dropName: 'Ooty',
        dropAddress: 'The Nilgiris',
        dropLat: '11.4102',
        dropLng: '76.695',
        pickupName: 'Home',
        pickupAddress: 'RS Puram, Coimbatore',
        pickupLat: '11',
        pickupLng: '76.95',
      },
    });
    expect(reminders).toEqual([{ userId: 'u1', kind: 'SEARCH', place: placeKey(OOTY), title: 'Siva, Ooty?', body: expect.any(String) }]);
  });

  it('skips a rider who booked since the quote or has a trip going', async () => {
    const { svc, prisma, push, reminders } = setup({ trip: { id: 't1' } });
    const quotedAt = ist(9, 50);
    await svc.searchReminder('u1', payload(quotedAt), ist(10));
    expect(prisma.trip.findFirst.mock.calls[0][0]).toMatchObject({
      where: { passengerId: 'u1', OR: [{ createdAt: { gte: quotedAt } }, { status: { in: ['SEARCHING', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'IN_PROGRESS', 'PICKED_UP'] } }] },
    });
    expect(push.toUser).not.toHaveBeenCalled();
    expect(reminders).toEqual([]);
  });

  it('skips with the setting off, a blocked or deleted rider, in quiet hours, at the cap and for the same place within 24 h', async () => {
    const at = ist(10);
    const cases = [
      setup({ s: { searchReminderEnabled: false } }),
      setup({ user: { name: 'Siva', isBlocked: true, deletedAt: null } }),
      setup({ user: { name: null, isBlocked: false, deletedAt: new Date() } }),
      setup({ user: null }),
      setup({ sent: [{ place: 'a', sentAt: ist(8, 30) }, { place: 'b', sentAt: ist(9) }] }),
      setup({ sent: [{ place: placeKey(OOTY), sentAt: ist(20, 0, 14) }] }),
    ];
    for (const c of cases) await c.svc.searchReminder('u1', payload(ist(9, 50)), at);
    const quiet = setup();
    await quiet.svc.searchReminder('u1', payload(ist(22, 50)), ist(23));
    for (const c of [...cases, quiet]) {
      expect(c.push.toUser).not.toHaveBeenCalled();
      expect(c.reminders).toEqual([]);
    }
  });

  it('no name on the account, a local ride', async () => {
    const { svc, push } = setup({ user: { name: null, isBlocked: false, deletedAt: null } });
    await svc.searchReminder('u1', payload(ist(9, 50), 'LOCAL'), ist(10));
    expect(push.toUser.mock.calls[0][2]).toMatchObject({ title: 'Still going to Ooty?', body: 'Drivers are nearby. Book now and get there on time.' });
  });
});

describe('usual-trip reminder', () => {
  const BROOKEFIELDS = { lat: 11.009, lng: 76.96 };
  const rows = [12, 13, 14].map(
    (day): RoutineTrip => ({
      passengerId: 'u1',
      createdAt: ist(9, 5, day),
      vehicleKind: 'AUTO',
      pickupName: 'Home',
      pickupAddr: 'RS Puram',
      pickupLat: 11.0,
      pickupLng: 76.95,
      dropName: 'Brookefields Mall',
      dropAddr: 'Krishnaswamy Mudaliyar Rd',
      dropLat: BROOKEFIELDS.lat,
      dropLng: BROOKEFIELDS.lng,
    }),
  );

  it('the scan starts on boot only when it is not already scheduled', async () => {
    const fresh = setup();
    await fresh.svc.onApplicationBootstrap();
    expect(fresh.jobs.schedule).toHaveBeenCalledWith(ROUTINE_SCAN_JOB, ROUTINE_SCAN_ID, expect.any(Number));
    const running = setup();
    running.jobs.scheduledAt.mockResolvedValue(Date.now() + 1000);
    await running.svc.onApplicationBootstrap();
    expect(running.jobs.schedule).not.toHaveBeenCalled();
  });

  it('reschedules itself even when a scan fails', async () => {
    const { svc, prisma, jobs } = setup();
    prisma.$queryRaw.mockRejectedValue(new Error('db down'));
    vi.useFakeTimers({ now: ist(8, 55), toFake: ['Date'] });
    try {
      await expect(svc.routineScan()).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
    expect(jobs.schedule).toHaveBeenCalledWith(ROUTINE_SCAN_JOB, ROUTINE_SCAN_ID, ist(8, 55).getTime() + ROUTINE_SCAN_EVERY_MS);
  });

  it('reminds the rider routineLeadMin before the usual time', async () => {
    const { svc, push, reminders } = setup({ rows });
    expect(await svc.scanRoutines(ist(8, 50))).toBe(1);
    expect(push.toUser).toHaveBeenCalledWith('u1', 'PASSENGER', {
      title: 'Going to Brookefields Mall?',
      body: 'Your usual 9:05 am ride is a tap away. Book an Auto now.',
      channel: 'suggestions',
      data: {
        type: 'suggest',
        kind: 'routine',
        mode: 'LOCAL',
        vehicle: 'AUTO',
        dropName: 'Brookefields Mall',
        dropAddress: 'Krishnaswamy Mudaliyar Rd',
        dropLat: '11.009',
        dropLng: '76.96',
        pickupName: 'Home',
        pickupAddress: 'RS Puram',
        pickupLat: '11',
        pickupLng: '76.95',
      },
    });
    expect(reminders).toMatchObject([{ userId: 'u1', kind: 'ROUTINE', place: placeKey(BROOKEFIELDS) }]);
  });

  it('skips a rider with a trip going or booked in the last hour, one already reminded today, and quiet hours', async () => {
    const busy = setup({ rows, trip: { id: 't1' } });
    expect(await busy.svc.scanRoutines(ist(8, 50))).toBe(0);
    const reminded = setup({ rows, sent: [{ place: placeKey(BROOKEFIELDS), sentAt: ist(8, 45) }] });
    expect(await reminded.svc.scanRoutines(ist(8, 50))).toBe(0);
    const quiet = setup({ rows, s: { reminderQuietEndHour: 9 } });
    expect(await quiet.svc.scanRoutines(ist(8, 50))).toBe(0);
    expect(quiet.prisma.$queryRaw).not.toHaveBeenCalled();
    const off = setup({ rows, s: { routineReminderEnabled: false } });
    expect(await off.svc.scanRoutines(ist(8, 50))).toBe(0);
    for (const c of [busy, reminded, quiet, off]) expect(c.push.toUser).not.toHaveBeenCalled();
  });
});
