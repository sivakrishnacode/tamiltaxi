// Splash and Home banners of the passenger app (6j): rules shared by the upload dialog and its Server Action.
import type { Promo, PromoPlacement } from "./types";

/** The API's limit (promos.ts): riders download these on mobile data. */
export const MAX_PROMO_BYTES = 2 * 1024 * 1024;
export const PROMO_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PROMO_PLACEMENTS: readonly PromoPlacement[] = ["SPLASH", "BANNER"];

export const PLACEMENT_LABEL: Record<PromoPlacement, string> = { SPLASH: "Splash screen", BANNER: "Home banner" };

/** The picture size to make for each place: the app shows pictures in this shape. */
export const PLACEMENT_SIZE: Record<PromoPlacement, { readonly width: number; readonly height: number; readonly ratio: string }> = {
  SPLASH: { width: 1080, height: 2400, ratio: "9 : 20" },
  BANNER: { width: 1200, height: 600, ratio: "2 : 1" },
};

/** How the picture shows in the app, under its size in the dialog and on the In-app page. */
export const PLACEMENT_HINT: Record<PromoPlacement, string> = {
  SPLASH: "Full screen, portrait. Phones crop the edges, so keep words and faces in the middle.",
  BANNER: "Shown whole on Home, about 90% of the phone's width when there are several. Keep words away from the top-right corner, where the small × sits.",
};

/** "1200 × 600 px (2 : 1)" for a place. */
export function placementSize(placement: PromoPlacement): string {
  const { width, height, ratio } = PLACEMENT_SIZE[placement];
  return `${width} × ${height} px (${ratio})`;
}

/**
 * Whether a chosen picture of [width] × [height] px fits [placement]: "ok", or "warn" with what the app will do. A
 * picture of another shape is cut to fit (cover); a smaller one is stretched and may look blurry. Never blocks an upload.
 */
export function pictureSizeCheck(placement: PromoPlacement, width: number, height: number): { tone: "ok" | "warn"; text: string } {
  const want = PLACEMENT_SIZE[placement];
  const size = `${width} × ${height} px`;
  const shape = width / height / (want.width / want.height);
  if (Math.abs(shape - 1) > 0.02) {
    const cut = shape > 1 ? "the left and right edges" : "the top and bottom";
    return { tone: "warn", text: `${size} isn't ${want.ratio}: the app cuts off ${cut} (the preview shows what stays). Make it ${placementSize(placement)}.` };
  }
  if (width < want.width * 0.9) {
    return { tone: "warn", text: `${size} is the right shape but small, so it may look blurry. Make it ${want.width} × ${want.height} px.` };
  }
  return { tone: "ok", text: `${size}: the right size.` };
}

export type PromoStatus = "Live" | "Scheduled" | "Ended" | "Hidden";

export function promoStatus(p: Pick<Promo, "isActive" | "startsAt" | "endsAt">, now = Date.now()): PromoStatus {
  if (p.endsAt && new Date(p.endsAt).getTime() <= now) return "Ended";
  if (!p.isActive) return "Hidden";
  return new Date(p.startsAt).getTime() > now ? "Scheduled" : "Live";
}

export interface PromoInput {
  readonly placement: string;
  readonly title: string;
  readonly image: { readonly size: number; readonly type: string } | null;
  readonly linkUrl: string;
  readonly sortOrder: string;
  /** ISO strings, or empty. */
  readonly startsAt: string;
  readonly endsAt: string;
}

/** The first problem with a new picture, or null. The API checks again (and reads the picture's real type). */
export function promoInputError(input: PromoInput, now = Date.now()): string | null {
  if (!PROMO_PLACEMENTS.includes(input.placement as PromoPlacement)) return "Choose where the picture shows";
  const title = input.title.trim();
  if (title.length < 3 || title.length > 80) return "Describe the picture in 3–80 characters";
  if (!input.image || input.image.size === 0) return "Choose a picture";
  if (!(PROMO_IMAGE_TYPES as readonly string[]).includes(input.image.type)) return "Use a JPG, PNG or WebP picture";
  if (input.image.size > MAX_PROMO_BYTES) return "The picture is larger than 2 MB";
  if (input.placement === "BANNER") {
    const link = input.linkUrl.trim();
    if (link && !/^https:\/\/[^\s/]+\.[^\s]+$/i.test(link)) return "The link must start with https://";
    if (input.sortOrder.trim() && !/^\d{1,3}$/.test(input.sortOrder.trim())) return "Order is a number from 0 to 999";
  }
  const starts = input.startsAt ? new Date(input.startsAt).getTime() : now;
  if (Number.isNaN(starts)) return "Invalid start";
  if (input.endsAt) {
    const ends = new Date(input.endsAt).getTime();
    if (Number.isNaN(ends)) return "Invalid end";
    if (ends <= Math.max(starts, now)) return "The end must be after the start and in the future";
  }
  return null;
}
