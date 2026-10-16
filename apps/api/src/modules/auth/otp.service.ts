import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { randomInt } from 'node:crypto';

import type { Env } from '../../core/config/env.js';
import { ENV } from '../../core/config/env.token.js';
import { countHit, TooManyRequestsException } from '../../core/rate-limit/rate-limit.js';
import { RedisService } from '../../core/redis/redis.service.js';
import type { LoginApp } from './dto/verify-otp.dto.js';
import { WatxClient } from './watx.client.js';

const OTP_TTL_S = 300;
const MAX_SENDS = 5;
const SEND_WINDOW_S = 900;
const MAX_ATTEMPTS = 5;
/** A code must have been sent to the phone this recently for a verify to be tried at all (dev mode too). */
export const SENT_WINDOW_S = 600;
/** More wrong codes than this across all phones in [GLOBAL_WINDOW_S] → nobody can verify for [GLOBAL_LOCK_S]. */
export const GLOBAL_MAX_FAILURES = 50;
export const GLOBAL_WINDOW_S = 600;
export const GLOBAL_LOCK_S = 600;
const GLOBAL_FAILURES_KEY = 'otp:failures:global';
export const GLOBAL_LOCK_KEY = 'otp:lock:global';

/**
 * One-time codes in Redis with send and attempt limits, sent on WhatsApp through WATX when WATX_API_KEY is set.
 *
 * Brute-force guards: per phone (5 sends / 15 min, 5 wrong tries per code), per IP (the `@RateLimit` on the
 * controller), a code must have been sent to the phone in the last 10 min (also with DEV_OTP_CODE, which is the same
 * for every phone), and a global brake: more than [GLOBAL_MAX_FAILURES] wrong codes in 10 min across all phones (a
 * spread-out guessing run) pauses every verify for 10 min.
 *
 * Review phones (OTP_REVIEW_PHONES) go through the same steps and guards but get no WhatsApp message; they sign in
 * with OTP_REVIEW_CODE.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly redis: RedisService,
    @Inject(ENV) private readonly env: Env,
    private readonly watx: WatxClient,
  ) {}

  /** [app] picks the WhatsApp template (driver or passenger; none = passenger, as older app builds send). */
  async send(phone: string, app?: LoginApp): Promise<{ expiresInSeconds: number }> {
    const sends = await this.redis.incr(`otp:sends:${phone}`);
    if (sends === 1) await this.redis.expire(`otp:sends:${phone}`, SEND_WINDOW_S);
    if (sends > MAX_SENDS) {
      throw new TooManyRequestsException(await this.secondsLeft(`otp:sends:${phone}`, SEND_WINDOW_S), {
        message: 'Too many OTP requests. Try again later.',
        code: 'OTP_SEND_LIMIT',
      });
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.redis
      .multi()
      .set(`otp:code:${phone}`, code, 'EX', OTP_TTL_S)
      .set(`otp:sent:${phone}`, '1', 'EX', SENT_WINDOW_S)
      .del(`otp:attempts:${phone}`)
      .exec();
    if (this.env.reviewPhones.includes(phone)) this.logger.log(`Review phone ${phone}: no WhatsApp code sent`);
    else await this.deliver(phone, code, app);
    return { expiresInSeconds: OTP_TTL_S };
  }

  /**
   * True if [code] is the one sent. Dev mode also takes DEV_OTP_CODE when it is set, else any 6 digits except 000000;
   * a review phone also takes OTP_REVIEW_CODE.
   * 401 when no code was sent to [phone] in the last 10 min; 429 after too many wrong tries (this phone, or everyone).
   */
  async verify(phone: string, code: string): Promise<boolean> {
    const lockS = await this.redis.ttl(GLOBAL_LOCK_KEY);
    if (lockS > 0) {
      throw new TooManyRequestsException(lockS, {
        message: 'Sign-in is paused for a few minutes after too many wrong codes. Please try again in 10 minutes.',
        code: 'OTP_PAUSED',
      });
    }
    if (!(await this.redis.exists(`otp:sent:${phone}`))) throw new UnauthorizedException('Request a new OTP first');
    const attempts = await this.redis.incr(`otp:attempts:${phone}`);
    if (attempts === 1) await this.redis.expire(`otp:attempts:${phone}`, OTP_TTL_S);
    if (attempts > MAX_ATTEMPTS) {
      throw new TooManyRequestsException(await this.secondsLeft(`otp:attempts:${phone}`, OTP_TTL_S), {
        message: 'Too many wrong attempts. Request a new OTP.',
        code: 'OTP_ATTEMPTS',
      });
    }
    const expected = await this.redis.get(`otp:code:${phone}`);
    const isValid =
      (expected !== null && expected === code) ||
      (this.env.isOtpDevMode && OtpService.isDevCode(code, this.env.devOtpCode)) ||
      (this.env.reviewPhones.includes(phone) && code === this.env.reviewOtpCode);
    if (isValid) await this.redis.del(`otp:code:${phone}`, `otp:attempts:${phone}`, `otp:sent:${phone}`);
    else await this.countFailure();
    return isValid;
  }

  /** One more wrong code anywhere; past [GLOBAL_MAX_FAILURES] in the window, every verify pauses. */
  private async countFailure(): Promise<void> {
    const { hits } = await countHit(this.redis, GLOBAL_FAILURES_KEY, GLOBAL_WINDOW_S);
    if (hits <= GLOBAL_MAX_FAILURES) return;
    if ((await this.redis.set(GLOBAL_LOCK_KEY, '1', 'EX', GLOBAL_LOCK_S, 'NX')) === 'OK') {
      this.logger.warn(`${hits} wrong OTPs in ${GLOBAL_WINDOW_S / 60} min across all phones: every sign-in paused for ${GLOBAL_LOCK_S / 60} min`);
    }
  }

  private async secondsLeft(key: string, fallbackS: number): Promise<number> {
    const ttl = await this.redis.ttl(key);
    return ttl > 0 ? ttl : fallbackS;
  }

  private static isDevCode(code: string, devOtpCode: string): boolean {
    return devOtpCode ? code === devOtpCode : code !== '000000';
  }

  /**
   * WhatsApp through WATX when it is set up, with the app's template. Dev mode also logs the code, and a failed send
   * doesn't stop the sign-in there (DEV_OTP_CODE still works); in live mode it is a 503.
   */
  private async deliver(phone: string, code: string, app?: LoginApp): Promise<void> {
    if (this.env.isOtpDevMode) this.logger.log(`OTP for ${phone}: ${code}`);
    if (!this.watx.isEnabled) return;
    const { otpTemplates } = this.env.watx;
    try {
      await this.watx.sendTemplate(phone, app === 'driver' ? otpTemplates.driver : otpTemplates.passenger, [code]);
    } catch (e) {
      if (!this.env.isOtpDevMode) throw e;
    }
  }
}
