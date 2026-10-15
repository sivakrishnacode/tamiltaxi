import { PromoPlacement } from '../../generated/prisma/enums.js';

/** Largest picture the admin may upload: a full-screen JPG is ~300–600 KB, and riders download it on mobile data. */
export const MAX_PROMO_BYTES = 2 * 1024 * 1024;

/** A splash this close to its start is sent early, so phones have it on disk for the festival's first launch. */
export const SPLASH_LEAD_MS = 3 * 24 * 60 * 60 * 1000;

/** A promo as the passenger app gets it: the picture is a path under the API (`/promos/<id>/image`). */
export interface PromoView {
  readonly id: string;
  readonly title: string;
  readonly imagePath: string;
  readonly linkUrl: string | null;
  readonly startsAt: string;
  readonly endsAt: string | null;
}

/** GET /promos: the splash (live, or starting within [SPLASH_LEAD_MS]) and the live banners, in order. */
export interface Promos {
  readonly splash: PromoView | null;
  readonly banners: PromoView[];
}

/** The columns these choices need (never the picture's bytes). */
export interface PromoRow {
  readonly id: string;
  readonly placement: PromoPlacement;
  readonly title: string;
  readonly linkUrl: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly createdAt: Date;
}

export function toView(p: PromoRow): PromoView {
  return {
    id: p.id,
    title: p.title,
    imagePath: `/promos/${p.id}/image`,
    linkUrl: p.linkUrl,
    startsAt: p.startsAt.toISOString(),
    endsAt: p.endsAt?.toISOString() ?? null,
  };
}

/**
 * What the passenger app shows at [now]: of the shown, unended splashes the newest live one (else the soonest to start
 * within [SPLASH_LEAD_MS]); every live banner by `sortOrder`, then newest first.
 */
export function pickPromos(rows: readonly PromoRow[], now: Date): Promos {
  const t = now.getTime();
  const unended = rows.filter((p) => p.isActive && (!p.endsAt || p.endsAt.getTime() > t));
  const isLive = (p: PromoRow) => p.startsAt.getTime() <= t;
  const newest = (a: PromoRow, b: PromoRow) => b.createdAt.getTime() - a.createdAt.getTime();

  const splashes = unended.filter((p) => p.placement === PromoPlacement.SPLASH);
  const live = splashes.filter(isLive).sort(newest)[0];
  const next = splashes
    .filter((p) => !isLive(p) && p.startsAt.getTime() - t <= SPLASH_LEAD_MS)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
  const splash = live ?? next;

  const banners = unended
    .filter((p) => p.placement === PromoPlacement.BANNER && isLive(p))
    .sort((a, b) => a.sortOrder - b.sortOrder || newest(a, b));
  return { splash: splash ? toView(splash) : null, banners: banners.map(toView) };
}

/**
 * The picture's real type from its first bytes, or null when it is not a JPEG, PNG or WebP. The upload's declared
 * type is not trusted: the file is served publicly with the type stored here.
 */
export function sniffImageType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return 'image/png';
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}
