import { driverLastFixKey, encodeLastLocation, parseLastLocation, riderLastPinKey } from './last-location.js';

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
