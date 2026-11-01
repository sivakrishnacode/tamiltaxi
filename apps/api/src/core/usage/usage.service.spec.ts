import { toCounts, usagePeriods } from './usage.service.js';

describe('usage counters', () => {
  it('keys by the IST day and month', () => {
    // 20:00 UTC on 31 Oct is 01:30 IST on 1 Nov: a new day and a new month.
    expect(usagePeriods(new Date('2026-10-31T20:00:00Z'))).toEqual({ day: '2026-11-01', month: '2026-11' });
    expect(usagePeriods(new Date('2026-10-31T18:00:00Z'))).toEqual({ day: '2026-10-31', month: '2026-10' });
  });

  it('reads every metric, missing or unknown ones as 0', () => {
    const counts = toCounts({ 'maps.geocode': '12', 'push.failed': 'x', other: '5' });
    expect(counts['maps.geocode']).toBe(12);
    expect(counts['push.failed']).toBe(0);
    expect(counts['maps.matrix_elements']).toBe(0);
    expect(Object.keys(counts)).not.toContain('other');
  });
});
