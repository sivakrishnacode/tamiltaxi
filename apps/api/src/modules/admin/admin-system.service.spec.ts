import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { newestBackup } from './admin-system.service.js';

describe('newestBackup', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tt-backups-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('is off without a folder', async () => {
    expect(await newestBackup('')).toEqual({ dir: null, count: 0, last: null });
  });

  it('names the newest backup folder with the size of the files in it', async () => {
    for (const [name, day] of [
      ['20261015-6aad7ba', '2026-10-15'],
      ['20261101-96499af', '2026-11-01'],
    ] as const) {
      await mkdir(join(dir, name));
      await writeFile(join(dir, name, 'db.sql.gz'), 'x'.repeat(300));
      await writeFile(join(dir, name, '.env'), 'y'.repeat(20));
      const at = new Date(`${day}T09:00:00Z`);
      await utimes(join(dir, name), at, at);
    }
    await writeFile(join(dir, '.hidden'), '');
    expect(await newestBackup(dir)).toEqual({
      dir,
      count: 2,
      last: { name: '20261101-96499af', at: '2026-11-01T09:00:00.000Z', sizeBytes: 320 },
    });
  });

  it('reports a folder it cannot read', async () => {
    const missing = join(dir, 'nope');
    expect(await newestBackup(missing)).toMatchObject({ dir: missing, count: 0, last: null, error: expect.stringContaining('ENOENT') });
  });
});
