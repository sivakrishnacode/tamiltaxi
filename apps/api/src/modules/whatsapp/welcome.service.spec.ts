import type { Env } from '../../core/config/env.js';
import type { PrismaService } from '../../core/prisma/prisma.service.js';
import { SETTING_DEFAULTS } from '../settings/settings.defaults.js';
import type { SettingsService } from '../settings/settings.service.js';
import type { WatxClient } from './watx.client.js';
import { WelcomeService, welcomeName } from './welcome.service.js';

type UserRow = { phone: string; name: string | null; isBlocked: boolean; deletedAt: Date | null } | null;

function setup(opts: { watx?: boolean; settings?: Record<string, unknown>; user?: UserRow; sendError?: string | null; claimed?: boolean } = {}) {
  const settings = { ...SETTING_DEFAULTS, welcomeRiderEnabled: true, ...opts.settings };
  const user: UserRow = opts.user === undefined ? { phone: '+919000000101', name: 'Priya Nair', isBlocked: false, deletedAt: null } : opts.user;
  const create = vi.fn(async () => {
    if (opts.claimed) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    return { id: 'w1' };
  });
  const update = vi.fn(async () => ({}));
  const prisma = {
    user: { findUnique: vi.fn(async () => user), findUniqueOrThrow: vi.fn(async () => ({ phone: '+919000000001', name: 'Siva Krishna' })) },
    welcomeMessage: { create, update },
  } as unknown as PrismaService;
  const send = vi.fn(async () => opts.sendError ?? null);
  const watx = { isEnabled: opts.watx ?? true, send } as unknown as WatxClient;
  const settingsService = {
    all: vi.fn(async () => settings),
    get: vi.fn(async (k: string) => settings[k as keyof typeof settings]),
  } as unknown as SettingsService;
  const env = { reviewPhones: ['+919876500001'] } as unknown as Env;
  return { welcome: new WelcomeService(prisma, settingsService, watx, env), send, create, update };
}

describe('welcomeName', () => {
  it('is the first name, else "friend"', () => {
    expect(welcomeName('  Priya Nair ')).toBe('Priya');
    expect(welcomeName('')).toBe('friend');
    expect(welcomeName(null)).toBe('friend');
  });
});

describe('WelcomeService.deliver', () => {
  it('sends the trigger template with the first name once, and records it as sent', async () => {
    const { welcome, send, create, update } = setup();
    expect(await welcome.deliver('u1', 'RIDER_SIGNUP')).toBe(true);
    expect(create).toHaveBeenCalledWith({ data: { userId: 'u1', trigger: 'RIDER_SIGNUP', template: 'welcome_rider' }, select: { id: true } });
    expect(send).toHaveBeenCalledWith('+919000000101', 'welcome_rider', ['Priya']);
    expect(update).toHaveBeenCalledWith({ where: { id: 'w1' }, data: { sentAt: expect.any(Date) } });
  });

  it('keeps WhatsApp’s reason when the send fails', async () => {
    const { welcome, update } = setup({ sendError: 'Template welcome_rider not found' });
    expect(await welcome.deliver('u1', 'RIDER_SIGNUP')).toBe(false);
    expect(update).toHaveBeenCalledWith({ where: { id: 'w1' }, data: { error: 'Template welcome_rider not found' } });
  });

  it('never sends the same welcome twice (the row is claimed first)', async () => {
    const { welcome, send } = setup({ claimed: true });
    expect(await welcome.deliver('u1', 'RIDER_SIGNUP')).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['WATX is not set up', { watx: false }],
    ['the trigger is off', { settings: { welcomeRiderEnabled: false } }],
    ['the template name is empty', { settings: { welcomeRiderTemplate: '  ' } }],
    ['the account is gone', { user: null }],
    ['the account is blocked', { user: { phone: '+919000000101', name: 'A', isBlocked: true, deletedAt: null } }],
    ['the account is deleted', { user: { phone: '+919000000101', name: 'A', isBlocked: false, deletedAt: new Date() } }],
    ['it is a store-review number', { user: { phone: '+919876500001', name: 'A', isBlocked: false, deletedAt: null } }],
  ])('sends nothing when %s', async (_why, opts) => {
    const { welcome, send, create } = setup(opts as Parameters<typeof setup>[0]);
    expect(await welcome.deliver('u1', 'RIDER_SIGNUP')).toBe(false);
    expect(create).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('each trigger has its own switch and template', async () => {
    const { welcome, send } = setup({ settings: { welcomeDriverApprovedEnabled: true } });
    expect(await welcome.deliver('u1', 'DRIVER_REGISTERED')).toBe(false);
    expect(await welcome.deliver('u1', 'DRIVER_APPROVED')).toBe(true);
    expect(send).toHaveBeenCalledWith('+919000000101', 'welcome_driver_approved', ['Priya']);
  });
});

describe('WelcomeService.test', () => {
  it('sends the typed template, else the saved one, to the admin', async () => {
    const { welcome, send, create } = setup();
    expect(await welcome.test('admin', 'DRIVER_REGISTERED', 'driver_hello')).toBeNull();
    expect(send).toHaveBeenLastCalledWith('+919000000001', 'driver_hello', ['Siva']);
    await welcome.test('admin', 'DRIVER_REGISTERED');
    expect(send).toHaveBeenLastCalledWith('+919000000001', 'welcome_driver_registered', ['Siva']);
    expect(create).not.toHaveBeenCalled();
  });

  it('is a 409 without WATX', async () => {
    const { welcome } = setup({ watx: false });
    await expect(welcome.test('admin', 'RIDER_SIGNUP')).rejects.toMatchObject({ status: 409 });
  });
});
