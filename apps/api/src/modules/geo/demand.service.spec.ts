import { TripStatus } from '../../generated/prisma/enums.js';
import { DemandService, isQuickCancel, QUICK_CANCEL_MS } from './demand.service.js';

const PICKUP = { lat: 11.029, lng: 77.027 };

/** A DemandService over a rider row ([user]) and a Redis that records the commands of each transaction. */
function setup(user: { driver: { id: string } | null; trips: { id: string }[] } | null) {
  const commands: unknown[][] = [];
  const tx = new Proxy({} as Record<string, unknown>, {
    get: (_, name: string) => (name === 'exec' ? async () => [] : (...args: unknown[]) => (commands.push([name, ...args]), tx)),
  });
  const redis = { multi: () => tx };
  const prisma = { user: { findUnique: vi.fn(async () => user) } };
  const settings = { get: async () => 15 };
  const demand = new DemandService(prisma as never, redis as never, settings as never);
  return { demand, commands, prisma };
}

describe('DemandService: fake demand', () => {
  it('counts a rider with a finished ride or delivery', async () => {
    const { demand, commands, prisma } = setup({ driver: null, trips: [{ id: 't1' }] });
    await demand.recordRequest(PICKUP, 'p1');
    expect(commands.filter(([c]) => c === 'sadd').map(([, , member]) => member)).toContain('p1');
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ trips: expect.objectContaining({ where: { status: { in: ['COMPLETED', 'DELIVERED'] } } }) }) }),
    );
  });

  it("doesn't count a new account, a driver's own account or an unknown one", async () => {
    for (const user of [{ driver: null, trips: [] }, { driver: { id: 'd1' }, trips: [{ id: 't1' }] }, null]) {
      const { demand, commands } = setup(user);
      await demand.recordRequest(PICKUP, 'p1');
      expect(commands).toEqual([]);
    }
  });

  it('takes a quick cancel out of every minute since the search started', async () => {
    const { demand, commands } = setup(null);
    await demand.forgetRequest(PICKUP, 'p1', new Date(Date.now() - 90_000));
    const removed = commands.filter(([c]) => c === 'srem');
    expect(removed.length).toBeGreaterThanOrEqual(2);
    for (const [, key, member] of removed) {
      expect(key).toMatch(/^h3:riders:\d+:[0-9a-f]{15}$/);
      expect(member).toBe('p1');
    }
  });

  it('a quick cancel is one still searching, never taken by a driver, within the minute', () => {
    const now = Date.now();
    const searching = { status: TripStatus.SEARCHING, reassignCount: 0, searchFrom: new Date(now - 10_000) };
    expect(isQuickCancel(searching, now)).toBe(true);
    expect(isQuickCancel({ ...searching, searchFrom: new Date(now - QUICK_CANCEL_MS) }, now)).toBe(false);
    expect(isQuickCancel({ ...searching, reassignCount: 1 }, now)).toBe(false);
    expect(isQuickCancel({ ...searching, status: TripStatus.DRIVER_ASSIGNED }, now)).toBe(false);
  });
});
