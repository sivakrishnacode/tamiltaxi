import { readFile, readdir, stat, statfs } from 'node:fs/promises';
import { cpus, freemem, loadavg, totalmem, uptime } from 'node:os';
import { join } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';

import type { Env } from '../../core/config/env.js';
import { ENV } from '../../core/config/env.token.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { RedisService } from '../../core/redis/redis.service.js';
import { UsageService, type UsageCounts, type UsageMetric } from '../../core/usage/usage.service.js';

/**
 * Google's free monthly calls per SKU (India list; COST_AND_SCALING.md §3). Autocomplete has none listed: its requests
 * are free when the search ends in a place pick (Place Details closes the session).
 */
export const FREE_PER_MONTH: Partial<Record<UsageMetric, number>> = {
  'maps.matrix_elements': 70_000,
  'maps.routes': 70_000,
  'maps.routes_pro': 35_000,
  'maps.place_details': 70_000,
  'maps.geocode': 70_000,
};

/** Admin › System › Server health. Server = the machine the API runs on (in Docker: the EC2 host's numbers). */
export interface SystemHealth {
  readonly at: string;
  readonly server: {
    readonly uptimeSec: number;
    readonly cpus: number;
    /** 1, 5 and 15 minute load averages. */
    readonly loadAvg: readonly number[];
    readonly memTotal: number;
    readonly memAvailable: number;
    readonly diskTotal: number | null;
    readonly diskFree: number | null;
  };
  readonly api: { readonly uptimeSec: number; readonly rss: number; readonly heapUsed: number; readonly node: string };
  readonly database: { readonly sizeBytes: number; readonly connections: number; readonly maxConnections: number };
  readonly redis: { readonly usedMemory: number; readonly keys: number };
  readonly usage: {
    readonly today: UsageCounts;
    readonly month: UsageCounts;
    readonly freePerMonth: Partial<Record<UsageMetric, number>>;
    readonly isMapsOn: boolean;
    readonly isPushOn: boolean;
  };
  /** The newest entry of BACKUP_DIR; null `dir` = not set up. */
  readonly backup: { readonly dir: string | null; readonly count: number; readonly last: { name: string; at: string; sizeBytes: number } | null; readonly error?: string };
}

/** `MemAvailable` from /proc/meminfo (what can be used without swapping); free memory where that is missing. */
async function memAvailable(): Promise<number> {
  try {
    const m = /^MemAvailable:\s+(\d+) kB/m.exec(await readFile('/proc/meminfo', 'utf8'));
    if (m) return Number(m[1]) * 1024;
  } catch {
    // Not Linux.
  }
  return freemem();
}

/** Size of a file, or of the files directly inside a folder (a backup folder holds the dump and config copies). */
async function entrySize(path: string): Promise<number> {
  const s = await stat(path);
  if (!s.isDirectory()) return s.size;
  const inner = await readdir(path, { withFileTypes: true });
  const sizes = await Promise.all(inner.filter((e) => e.isFile()).map(async (e) => (await stat(join(path, e.name))).size));
  return sizes.reduce((a, b) => a + b, 0);
}

/** The newest file or folder in [dir] (by modified time), hidden ones skipped; empty [dir] = not set up. */
export async function newestBackup(dir: string): Promise<SystemHealth['backup']> {
  if (!dir) return { dir: null, count: 0, last: null };
  try {
    const entries = (await readdir(dir, { withFileTypes: true })).filter((e) => !e.name.startsWith('.'));
    const dated = await Promise.all(entries.map(async (e) => ({ name: e.name, at: (await stat(join(dir, e.name))).mtime })));
    const newest = dated.sort((a, b) => b.at.getTime() - a.at.getTime())[0];
    return {
      dir,
      count: entries.length,
      last: newest ? { name: newest.name, at: newest.at.toISOString(), sizeBytes: await entrySize(join(dir, newest.name)) } : null,
    };
  } catch (e) {
    return { dir, count: 0, last: null, error: (e as Error).message };
  }
}

/** Server, database, Redis, paid-call counters and the last backup, for Admin › System › Server health. */
@Injectable()
export class AdminSystemService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly usage: UsageService,
  ) {}

  async health(): Promise<SystemHealth> {
    const [disk, available, db, redisInfo, keys, usage, backup] = await Promise.all([
      statfs('/').catch(() => null),
      memAvailable(),
      this.prisma.$queryRaw<{ size: bigint; connections: bigint; max: number }[]>`
        SELECT pg_database_size(current_database()) AS size,
          (SELECT COUNT(*) FROM pg_stat_activity WHERE datname = current_database()) AS connections,
          current_setting('max_connections')::int AS max`,
      this.redis.info('memory'),
      this.redis.dbsize(),
      this.usage.read(),
      newestBackup(this.env.backupDir.trim()),
    ]);
    const mem = process.memoryUsage();
    return {
      at: new Date().toISOString(),
      server: {
        uptimeSec: Math.round(uptime()),
        cpus: cpus().length,
        loadAvg: loadavg().map((l) => Math.round(l * 100) / 100),
        memTotal: totalmem(),
        memAvailable: available,
        diskTotal: disk ? disk.blocks * disk.bsize : null,
        diskFree: disk ? disk.bavail * disk.bsize : null,
      },
      api: { uptimeSec: Math.round(process.uptime()), rss: mem.rss, heapUsed: mem.heapUsed, node: process.version },
      database: { sizeBytes: Number(db[0]?.size ?? 0), connections: Number(db[0]?.connections ?? 0), maxConnections: Number(db[0]?.max ?? 0) },
      redis: { usedMemory: Number(/^used_memory:(\d+)/m.exec(redisInfo)?.[1] ?? 0), keys },
      usage: { ...usage, freePerMonth: FREE_PER_MONTH, isMapsOn: this.env.googleMapsApiKey.length > 0, isPushOn: this.env.firebaseServiceAccount.length > 0 },
      backup,
    };
  }
}
