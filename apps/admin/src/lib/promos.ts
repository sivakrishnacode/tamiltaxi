// Splash and Home banners of the passenger app (6j): rules shared by the upload dialog and its Server Action.
import type { Promo, PromoPlacement } from "./types";

/** The API's limit (promos.ts): riders download these on mobile data. */
export const MAX_PROMO_BYTES = 2 * 1024 * 1024;
export const PROMO_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PROMO_PLACEMENTS: readonly PromoPlacement[] = ["SPLASH", "BANNER"];

export const PLACEMENT_LABEL: Record<PromoPlacement, string> = { SPLASH: "Splash screen", BANNER: "Home banner" };

/** The picture size to make, shown in the dialog. */
export const PLACEMENT_HINT: Record<PromoPlacement, string> = {
  SPLASH: "Portrait, 1080 × 2400 px. Phones crop the edges, so keep words and faces in the middle.",
  BANNER: "Wide, 1200 × 600 px (2 : 1).",
};

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
