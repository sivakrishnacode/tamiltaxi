import { Logger, ServiceUnavailableException } from '@nestjs/common';

import type { Env } from '../../core/config/env.js';
import type { RedisService } from '../../core/redis/redis.service.js';
import { GLOBAL_LOCK_KEY, GLOBAL_MAX_FAILURES, OtpService } from './otp.service.js';
import type { WatxClient } from './watx.client.js';

/** The Redis commands OtpService uses, in memory (TTLs are remembered, never counted down). */
function fakeRedis(): RedisService & { store: Map<string, string> } {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  const r = {
    store,
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string, ...args: (string | number)[]) => {
      if (args.includes('NX') && store.has(k)) return null;
      store.set(k, v);
      const ex = args.indexOf('EX');
      if (ex >= 0) ttls.set(k, Number(args[ex + 1]));
      return 'OK';
    },
    incr: async (k: string) => {
      const n = Number(store.get(k) ?? 0) + 1;
      store.set(k, String(n));
      return n;
    },
    expire: async (k: string, s: number, mode?: string) => {
      if (mode === 'NX' && ttls.has(k)) return 0;
      ttls.set(k, s);
      return 1;
    },
    ttl: async (k: string) => (store.has(k) ? (ttls.get(k) ?? -1) : -2),
    exists: async (k: string) => (store.has(k) ? 1 : 0),
    del: async (...keys: string[]) => keys.filter((k) => (ttls.delete(k), store.delete(k))).length,
    multi: () => {
      const ops: (() => Promise<unknown>)[] = [];
      const chain = {
        set: (...a: [string, string, ...(string | number)[]]) => (ops.push(() => r.set(...a)), chain),
        del: (...k: string[]) => (ops.push(() => r.del(...k)), chain),
        incr: (k: string) => (ops.push(() => r.incr(k)), chain),
        expire: (k: string, s: number, mode?: string) => (ops.push(() => r.expire(k, s, mode)), chain),
        ttl: (k: string) => (ops.push(() => r.ttl(k)), chain),
        exec: async () => {
          const out: [null, unknown][] = [];
          for (const op of ops) out.push([null, await op()]);
          return out;
        },
      };
      return chain;
    },
  };
  return r as unknown as RedisService & { store: Map<string, string> };
}

const TEMPLATES = { passenger: 'login_otp_passenger', driver: 'login_otp_driver' };
/** WATX off unless [watx] is passed. */
const otp = (env: Partial<Env>, redis = fakeRedis(), watx = { isEnabled: false, sendTemplate: vi.fn() }): OtpService =>
  new OtpService(redis, { isOtpDevMode: true, devOtpCode: '', watx: { apiKey: '', otpTemplates: TEMPLATES }, ...env } as Env, watx as unknown as WatxClient);

describe('OtpService', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  it('dev mode without DEV_OTP_CODE: any 6 digits except 000000, once a code was sent', async () => {
    const s = otp({});
    await s.send('+919000000001');
    expect(await s.verify('+919000000001', '000000')).toBe(false);
    expect(await s.verify('+919000000001', '123456')).toBe(true);
  });

  it('dev mode with DEV_OTP_CODE: that code or the one sent', async () => {
    const redis = fakeRedis();
    const s = otp({ devOtpCode: '482915' }, redis);
    await s.send('+919000000001');
    const sent = redis.store.get('otp:code:+919000000001')!;
    expect(await s.verify('+919000000001', ['123456', '654321'].find((c) => c !== sent)!)).toBe(false);
    expect(await s.verify('+919000000001', '482915')).toBe(true);
    await s.send('+919000000001');
    expect(await s.verify('+919000000001', redis.store.get('otp:code:+919000000001')!)).toBe(true);
  });

  it("sends the code on WhatsApp with the app's template (passenger when the app doesn't say)", async () => {
    const redis = fakeRedis();
    const watx = { isEnabled: true, sendTemplate: vi.fn().mockResolvedValue(undefined) };
    const s = otp({ isOtpDevMode: false }, redis, watx);
    await s.send('+919000000006', 'driver');
    expect(watx.sendTemplate).toHaveBeenLastCalledWith('+919000000006', 'login_otp_driver', [redis.store.get('otp:code:+919000000006')]);
    await s.send('+919000000007');
    expect(watx.sendTemplate).toHaveBeenLastCalledWith('+919000000007', 'login_otp_passenger', [redis.store.get('otp:code:+919000000007')]);
  });

  it('a failed WhatsApp send is an error in live mode, but not in dev mode (DEV_OTP_CODE still signs in)', async () => {
    const watx = { isEnabled: true, sendTemplate: vi.fn().mockRejectedValue(new ServiceUnavailableException()) };
    await expect(otp({ isOtpDevMode: false }, fakeRedis(), watx).send('+919000000008')).rejects.toMatchObject({ status: 503 });
    const dev = otp({ devOtpCode: '482915' }, fakeRedis(), watx);
    await dev.send('+919000000008');
    expect(await dev.verify('+919000000008', '482915')).toBe(true);
  });

  it('live mode: only the code that was sent', async () => {
    const redis = fakeRedis();
    const s = otp({ isOtpDevMode: false }, redis);
    await s.send('+919000000002');
    const sent = redis.store.get('otp:code:+919000000002')!;
    expect(await s.verify('+919000000002', sent === '123456' ? '654321' : '123456')).toBe(false);
    expect(await s.verify('+919000000002', sent)).toBe(true);
  });

  it('refuses a verify for a phone no code was sent to (the static dev code works only after a send), and a code signs in once', async () => {
    const s = otp({ devOtpCode: '482915' });
    await expect(s.verify('+919000000003', '482915')).rejects.toMatchObject({ status: 401 });
    await s.send('+919000000003');
    expect(await s.verify('+919000000003', '482915')).toBe(true);
    await expect(s.verify('+919000000003', '482915')).rejects.toMatchObject({ status: 401 });
  });

  it('locks a phone after 5 wrong tries (429 with the seconds left) until a new code is sent', async () => {
    const s = otp({ devOtpCode: '482915' });
    await s.send('+919000000004');
    for (let i = 0; i < 5; i++) expect(await s.verify('+919000000004', '111111')).toBe(false);
    await expect(s.verify('+919000000004', '482915')).rejects.toMatchObject({ status: 429, response: { code: 'OTP_ATTEMPTS', details: { retryInSeconds: 300 } } });
    await s.send('+919000000004');
    expect(await s.verify('+919000000004', '482915')).toBe(true);
  });

  it(`pauses every verify for 10 min after more than ${GLOBAL_MAX_FAILURES} wrong codes across phones`, async () => {
    const redis = fakeRedis();
    const s = otp({ devOtpCode: '482915' }, redis);
    // A spread-out guessing run: a few tries on each of many phones, never 5 on one.
    for (let i = 0; i <= GLOBAL_MAX_FAILURES; i++) {
      const phone = `+9190000${String(i).padStart(5, '0')}`;
      await s.send(phone);
      expect(await s.verify(phone, '111111')).toBe(false);
    }
    expect(redis.store.has(GLOBAL_LOCK_KEY)).toBe(true);
    expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);
    await s.send('+919999999999');
    await expect(s.verify('+919999999999', '482915')).rejects.toMatchObject({ status: 429, response: { code: 'OTP_PAUSED', details: { retryInSeconds: 600 } } });
  });

  it('limits sends to 5 per phone in 15 min', async () => {
    const s = otp({});
    for (let i = 0; i < 5; i++) await s.send('+919000000005');
    await expect(s.send('+919000000005')).rejects.toMatchObject({ status: 429, response: { code: 'OTP_SEND_LIMIT', details: { retryInSeconds: 900 } } });
  });
});
