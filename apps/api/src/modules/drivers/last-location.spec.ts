import { driverLastFixKey, driversNotFar, encodeLastLocation, parseLastLocation, riderLastPinKey } from './last-location.js';

describe('last location', () => {
  it('round-trips a position and its time', () => {
    const at = Date.UTC(2026, 10, 9, 6, 10);
    expect(parseLastLocation(encodeLastLocation(11.0168, 76.9558, at))).toEqual({ lat: 11.0168, lng: 76.9558, at: '2026-11-09T06:10:00.000Z' });
  });

  it('reads nothing from a missing or malformed value', () => {
    for (const raw of [null, undefined, '', '11.01,76.95', 'a,b,c', '11.01,,1800000000000']) expect(parseLastLocation(raw)).toBeNull();
  });

  it('keeps drivers and riders apart', () => {
    expect(driverLastFixKey('d1')).toBe('driver:lastfix:d1');
    expect(riderLastPinKey('u1')).toBe('rider:lastpin:u1');
  });
});

describe('driversNotFar', () => {
  // A zone in Tambaram (Chennai), about 1 km across.
  const zone = { low: { lat: 12.92, lng: 80.11 }, high: { lat: 12.93, lng: 80.12 } };
  const fixes: Record<string, string> = {
    [driverLastFixKey('near')]: encodeLastLocation(12.98, 80.15, 0), // Pallavaram, ~6 km
    [driverLastFixKey('far')]: encodeLastLocation(13.21, 80.32, 0), // Ennore, ~35 km
  };
  const redis = { mget: async (...keys: string[]) => keys.map((k) => fixes[k] ?? null) };

  it('leaves out drivers last seen beyond the reach; keeps the near and the never seen', async () => {
    expect(await driversNotFar(redis, ['near', 'far', 'unknown'], zone, 15)).toEqual(['near', 'unknown']);
  });

  it('asks Redis nothing for no drivers', async () => {
    expect(await driversNotFar({ mget: () => Promise.reject(new Error('no keys')) }, [], zone, 15)).toEqual([]);
  });
});
