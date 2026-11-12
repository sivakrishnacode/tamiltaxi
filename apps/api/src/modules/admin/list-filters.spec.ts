import { driverOrder, flag, phoneDigits, riderSignup, spacedPlate } from './list-filters.js';

describe('admin list filters', () => {
  it('reads phone searches whatever the spacing or prefix', () => {
    expect(phoneDigits('98765 43210')).toBe('9876543210');
    expect(phoneDigits('+91 98765-43210')).toBe('9876543210');
    expect(phoneDigits('919876543210')).toBe('9876543210');
    expect(phoneDigits('98765')).toBe('98765');
    expect(phoneDigits('987')).toBeNull();
    expect(phoneDigits('TN 38 1234')).toBeNull();
    expect(phoneDigits(undefined)).toBeNull();
  });

  it('spaces a plate typed without spaces', () => {
    expect(spacedPlate('tn38ab1234')).toBe('tn 38 ab 1234');
    expect(spacedPlate('TN38')).toBe('TN 38');
    expect(spacedPlate('TN 38 AB')).toBe('TN 38 AB');
    expect(spacedPlate('Karthik')).toBeNull();
  });

  it('maps sort keys and flags', () => {
    expect(driverOrder(undefined)).toEqual([{ createdAt: 'desc' }]);
    expect(driverOrder('rating')).toEqual([{ rating: 'desc' }, { ratingCount: 'desc' }]);
    expect(driverOrder('bogus')).toEqual([{ createdAt: 'desc' }]);
    expect(flag('true')).toBe(true);
    expect(flag('false')).toBe(false);
    expect(flag('yes')).toBeUndefined();
  });

  it('lists signed-up riders by default, unfinished sign-ups and deleted accounts on request', () => {
    const done = { deletedAt: null, OR: [{ name: { not: null } }, { trips: { some: {} } }] };
    expect(riderSignup(undefined)).toEqual(done);
    expect(riderSignup('done')).toEqual(done);
    expect(riderSignup('unfinished')).toEqual({ deletedAt: null, name: null, trips: { none: {} } });
    expect(riderSignup('deleted')).toEqual({ deletedAt: { not: null } });
  });
});
