import { daysLeft, expiredReason, expiryReminderText, isReminderHour, istToday, noticeDue, parseDay } from './document-expiry.js';

describe('document expiry', () => {
  it("takes today's date in India (UTC+5:30), not UTC", () => {
    // 20:00 UTC on 1 Nov is 01:30 IST on 2 Nov.
    expect(istToday(new Date('2026-11-01T20:00:00Z')).toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(istToday(new Date('2026-11-01T18:00:00Z')).toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('counts whole days left: 0 on the last valid day, negative once expired', () => {
    const today = parseDay('2026-11-01');
    expect(daysLeft(parseDay('2026-12-01'), today)).toBe(30);
    expect(daysLeft(parseDay('2026-11-01'), today)).toBe(0);
    expect(daysLeft(parseDay('2026-10-31'), today)).toBe(-1);
  });

  it('sends the 30-day reminder, then the 7-day one, each once', () => {
    expect(noticeDue(31, null)).toBeNull();
    expect(noticeDue(30, null)).toBe(30);
    expect(noticeDue(20, 30)).toBeNull();
    expect(noticeDue(7, 30)).toBe(7);
    expect(noticeDue(3, 7)).toBeNull();
    // Verified late (date already close): only the nearest reminder.
    expect(noticeDue(5, null)).toBe(7);
    expect(noticeDue(0, null)).toBe(7);
    expect(noticeDue(-1, null)).toBeNull();
  });

  it('reminds only between 9 am and 8 pm IST', () => {
    expect(isReminderHour(new Date('2026-11-01T03:30:00Z'))).toBe(true); // 09:00 IST
    expect(isReminderHour(new Date('2026-11-01T03:29:00Z'))).toBe(false); // 08:59 IST
    expect(isReminderHour(new Date('2026-11-01T14:29:00Z'))).toBe(true); // 19:59 IST
    expect(isReminderHour(new Date('2026-11-01T14:30:00Z'))).toBe(false); // 20:00 IST
  });

  it('words the reminder and the expiry reason', () => {
    const day = parseDay('2026-12-12');
    expect(expiryReminderText('INSURANCE', day, 7)).toEqual({
      title: 'Your insurance expires in 7 days',
      body: 'Valid until 12 Dec 2026. Renew it in time: the app asks you to upload the new one when it expires.',
    });
    expect(expiryReminderText('VEHICLE_RC', day, 1).title).toBe('Your RC expires tomorrow');
    expect(expiryReminderText('VEHICLE_RC', day, 0).title).toBe('Your RC expires today');
    expect(expiredReason('INSURANCE', day)).toBe('Expired on 12 Dec 2026. Please upload the renewed insurance');
  });
});
