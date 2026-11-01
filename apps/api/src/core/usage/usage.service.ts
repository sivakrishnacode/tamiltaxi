import { Injectable, Logger } from '@nestjs/common';

import { RedisService } from '../redis/redis.service.js';

/** What is counted: Google Maps calls by SKU (successful ones, as billed) and push notifications. */
export const USAGE_METRICS = [
  'maps.autocomplete',
  'maps.place_details',
  'maps.geocode',
  'maps.routes',
  'maps.routes_pro',
  'maps.matrix_elements',
  'push.sent',
  'push.failed',
] as const;
export type UsageMetric = (typeof USAGE_METRICS)[number];

export type UsageCounts = Record<UsageMetric, number>;

const IST_OFFSET_MS = 330 * 60_000;
const DAY_TTL_S = 40 * 86_400;
const MONTH_TTL_S = 400 * 86_400;

/** The IST day ("2026-11-01") and month ("2026-11") of [now]: the counters' keys. */
export function usagePeriods(now: Date): { day: string; month: string } {
  const day = new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
  return { day, month: day.slice(0, 7) };
}

/** Redis hash fields → every metric, missing ones as 0. */
export function toCounts(hash: Record<string, string>): UsageCounts {
  return Object.fromEntries(USAGE_METRICS.map((m) => [m, Number(hash[m] ?? 0) || 0])) as UsageCounts;
}

/**
 * Day and month counters of outside calls that cost money or have limits (Admin › System › Server health). Two Redis
 * hashes per period, `usage:d:<day>` (kept 40 days) and `usage:m:<month>` (kept 400 days); the month is the IST
 * calendar month, close to Google's billing month.
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(private readonly redis: RedisService) {}

  /** Adds [n] to [metric] for today and this month. Never throws and never makes the caller wait. */
  count(metric: UsageMetric, n = 1, now = new Date()): void {
    if (!(n > 0)) return;
    const { day, month } = usagePeriods(now);
    void this.redis
      .multi()
      .hincrby(`usage:d:${day}`, metric, n)
      .expire(`usage:d:${day}`, DAY_TTL_S)
      .hincrby(`usage:m:${month}`, metric, n)
      .expire(`usage:m:${month}`, MONTH_TTL_S)
      .exec()
      .catch((e: Error) => this.logger.warn(`Usage count ${metric} failed: ${e.message}`));
  }

  /** Today's and this month's counts. */
  async read(now = new Date()): Promise<{ today: UsageCounts; month: UsageCounts }> {
    const { day, month } = usagePeriods(now);
    const [d, m] = await Promise.all([this.redis.hgetall(`usage:d:${day}`), this.redis.hgetall(`usage:m:${month}`)]);
    return { today: toCounts(d), month: toCounts(m) };
  }
}
