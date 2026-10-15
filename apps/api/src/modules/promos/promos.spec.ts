import { PromoPlacement } from '../../generated/prisma/enums.js';
import { pickPromos, type PromoRow, sniffImageType, SPLASH_LEAD_MS } from './promos.js';

const NOW = new Date('2026-10-20T06:00:00Z');
const at = (msFromNow: number) => new Date(NOW.getTime() + msFromNow);
const HOUR = 60 * 60 * 1000;

let n = 0;
function promo(p: Partial<PromoRow> & { placement: PromoPlacement }): PromoRow {
  n++;
  return {
    id: `p${n}`,
    title: `Promo ${n}`,
    linkUrl: null,
    sortOrder: 0,
    isActive: true,
    startsAt: at(-HOUR),
    endsAt: null,
    createdAt: at(-HOUR + n * 1000),
    ...p,
  };
}

describe('pickPromos', () => {
  it('shows the newest live splash, never a hidden or ended one', () => {
    const older = promo({ placement: PromoPlacement.SPLASH, createdAt: at(-5 * HOUR) });
    const newer = promo({ placement: PromoPlacement.SPLASH, createdAt: at(-2 * HOUR) });
    const hidden = promo({ placement: PromoPlacement.SPLASH, isActive: false, createdAt: at(-HOUR) });
    const ended = promo({ placement: PromoPlacement.SPLASH, endsAt: at(-1), createdAt: at(-HOUR) });
    expect(pickPromos([older, newer, hidden, ended], NOW).splash?.id).toBe(newer.id);
  });

  it('sends a splash that starts within 3 days early (phones download it before the day), not one further out', () => {
    const diwali = promo({ placement: PromoPlacement.SPLASH, startsAt: at(SPLASH_LEAD_MS - HOUR) });
    const later = promo({ placement: PromoPlacement.SPLASH, startsAt: at(SPLASH_LEAD_MS + HOUR) });
    const picked = pickPromos([diwali, later], NOW).splash;
    expect(picked?.id).toBe(diwali.id);
    expect(picked?.startsAt).toBe(diwali.startsAt.toISOString());
    expect(pickPromos([later], NOW).splash).toBeNull();
  });

  it('a live splash wins over an upcoming one', () => {
    const live = promo({ placement: PromoPlacement.SPLASH, createdAt: at(-9 * HOUR) });
    const soon = promo({ placement: PromoPlacement.SPLASH, startsAt: at(HOUR) });
    expect(pickPromos([soon, live], NOW).splash?.id).toBe(live.id);
  });

  it('lists live banners by the admin order, then newest first; not yet started ones wait', () => {
    const b2 = promo({ placement: PromoPlacement.BANNER, sortOrder: 2 });
    const b1old = promo({ placement: PromoPlacement.BANNER, sortOrder: 1, createdAt: at(-5 * HOUR) });
    const b1new = promo({ placement: PromoPlacement.BANNER, sortOrder: 1, createdAt: at(-2 * HOUR) });
    const future = promo({ placement: PromoPlacement.BANNER, startsAt: at(HOUR) });
    const { banners } = pickPromos([b2, b1old, future, b1new], NOW);
    expect(banners.map((b) => b.id)).toEqual([b1new.id, b1old.id, b2.id]);
    expect(banners[0].imagePath).toBe(`/promos/${b1new.id}/image`);
  });
});

describe('sniffImageType', () => {
  it('reads JPEG, PNG and WebP from their first bytes', () => {
    expect(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(sniffImageType(new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe('image/webp');
  });

  it('refuses anything else, whatever the upload claimed (HTML, SVG, PDF)', () => {
    expect(sniffImageType(new TextEncoder().encode('<html><script>alert(1)</script>'))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});
