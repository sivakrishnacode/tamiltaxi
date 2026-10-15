import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';

import { CAMPAIGN_JOB, CampaignsService } from './campaigns.service.js';
import { CreateCampaignDto } from './dto/campaign.dto.js';

type Row = { id: string; title: string; body: string; target: string; sendAt: Date; status: string; sentAt: Date | null; createdAt: Date };

function setup() {
  const db = new Map<string, Row>();
  let n = 0;
  const campaign = {
    create: vi.fn(async ({ data }: { data: Omit<Row, 'id' | 'status' | 'sentAt' | 'createdAt'> }) => {
      const row: Row = { id: `c${++n}`, status: 'SCHEDULED', sentAt: null, createdAt: new Date(), ...data };
      db.set(row.id, row);
      return { ...row };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string; status: string }; data: Partial<Row> }) => {
      const row = db.get(where.id);
      if (!row || row.status !== where.status) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    }),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (db.has(where.id) ? { ...db.get(where.id)! } : null)),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => ({ ...db.get(where.id)! })),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => db.delete(where.id)),
  };
  const jobs = { register: vi.fn(), schedule: vi.fn(async () => undefined), cancel: vi.fn(async () => undefined) };
  const push = { toTopic: vi.fn() };
  return { svc: new CampaignsService({ campaign } as never, jobs as never, push as never), db, jobs, push };
}

const now = new Date('2026-10-15T10:00:00Z');
const later = (ms: number) => new Date(now.getTime() + ms).toISOString();

describe('CreateCampaignDto', () => {
  const errors = (body: object) => validateSync(plainToInstance(CreateCampaignDto, body)).map((e) => e.property);

  it('title 1–65, body 1–180, a known target and an ISO time', () => {
    expect(errors({ title: 'Diwali offer', body: 'Book a ride home', target: 'OUTSTATION', sendAt: later(3600_000) })).toEqual([]);
    expect(errors({ title: '', body: 'x' })).toEqual(['title']);
    expect(errors({ title: 'x'.repeat(66), body: 'y'.repeat(181) })).toEqual(['title', 'body']);
    expect(errors({ title: 'x', body: 'y', target: 'MOON', sendAt: 'tomorrow' })).toEqual(['target', 'sendAt']);
  });
});

describe('CampaignsService', () => {
  it('no time (or within the next minute) sends now to the passengers topic', async () => {
    for (const sendAt of [undefined, later(50_000), later(-30_000)]) {
      const { svc, push, jobs } = setup();
      const c = await svc.create({ title: ' Pongal ', body: ' Going home? ', sendAt }, now);
      expect(c).toMatchObject({ status: 'SENT', sentAt: now, sendAt: now, title: 'Pongal', body: 'Going home?', target: 'HOME' });
      expect(push.toTopic).toHaveBeenCalledWith('passengers', {
        title: 'Pongal',
        body: 'Going home?',
        channel: 'suggestions',
        data: { type: 'campaign', id: c.id, target: 'HOME' },
      });
      expect(jobs.schedule).not.toHaveBeenCalled();
    }
  });

  it('a later time is scheduled as a job', async () => {
    const { svc, push, jobs } = setup();
    const c = await svc.create({ title: 'Weekend', body: 'Rent a cab', target: 'RENTAL', sendAt: later(3600_000) }, now);
    expect(c).toMatchObject({ status: 'SCHEDULED', sendAt: new Date(later(3600_000)), target: 'RENTAL' });
    expect(jobs.schedule).toHaveBeenCalledWith(CAMPAIGN_JOB, c.id, new Date(later(3600_000)));
    expect(push.toTopic).not.toHaveBeenCalled();
  });

  it('refuses a time in the past and a blank title or message', async () => {
    const { svc, db } = setup();
    await expect(svc.create({ title: 'Late', body: 'x', sendAt: later(-61_000) }, now)).rejects.toMatchObject({ status: 400, message: 'Pick a time in the future' });
    await expect(svc.create({ title: '   ', body: 'x' }, now)).rejects.toMatchObject({ status: 400 });
    expect(db.size).toBe(0);
  });

  it('sends once: a repeated or late job run does nothing', async () => {
    const { svc, push } = setup();
    const c = await svc.create({ title: 'Deepavali', body: 'Book early', sendAt: later(3600_000) }, now);
    expect(await svc.send(c.id)).toMatchObject({ status: 'SENT' });
    expect(await svc.send(c.id)).toBeNull();
    expect(await svc.send('gone')).toBeNull();
    expect(push.toTopic).toHaveBeenCalledTimes(1);
  });

  it('cancel stops a scheduled campaign and its job; 409 once sent, 404 when unknown', async () => {
    const { svc, push, jobs } = setup();
    const c = await svc.create({ title: 'Weekend', body: 'Rent a cab', sendAt: later(3600_000) }, now);
    expect(await svc.cancel(c.id)).toMatchObject({ status: 'CANCELLED' });
    expect(jobs.cancel).toHaveBeenCalledWith(CAMPAIGN_JOB, c.id);
    expect(await svc.send(c.id)).toBeNull();
    expect(push.toTopic).not.toHaveBeenCalled();
    await expect(svc.cancel(c.id)).rejects.toMatchObject({ status: 409, message: 'This campaign was already cancelled' });
    const sent = await svc.create({ title: 'Now', body: 'x' }, now);
    await expect(svc.cancel(sent.id)).rejects.toMatchObject({ status: 409, message: 'This campaign was already sent' });
    await expect(svc.cancel('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('delete drops the row (and the job of a scheduled one)', async () => {
    const { svc, db, jobs } = setup();
    const c = await svc.create({ title: 'Weekend', body: 'Rent a cab', sendAt: later(3600_000) }, now);
    await svc.remove(c.id);
    expect(jobs.cancel).toHaveBeenCalledWith(CAMPAIGN_JOB, c.id);
    expect(db.has(c.id)).toBe(false);
    await expect(svc.remove(c.id)).rejects.toMatchObject({ status: 404 });
  });
});
