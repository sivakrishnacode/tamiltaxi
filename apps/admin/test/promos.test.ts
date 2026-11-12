import { describe, expect, it } from "vitest";

import { pictureSizeCheck, placementSize, promoInputError, promoStatus, type PromoInput } from "@/lib/promos";

const NOW = new Date("2026-10-20T06:00:00Z").getTime();
const ok: PromoInput = {
  placement: "BANNER",
  title: "Drive with Tamil Taxi",
  image: { size: 300_000, type: "image/jpeg" },
  linkUrl: "https://tamiltaxi.example/drive",
  sortOrder: "1",
  startsAt: "",
  endsAt: "",
};

describe("promoInputError", () => {
  it("accepts a complete banner, and a splash with no link", () => {
    expect(promoInputError(ok, NOW)).toBeNull();
    expect(promoInputError({ ...ok, placement: "SPLASH", linkUrl: "", sortOrder: "" }, NOW)).toBeNull();
  });

  it("names the first problem", () => {
    expect(promoInputError({ ...ok, placement: "POPUP" }, NOW)).toMatch(/where/);
    expect(promoInputError({ ...ok, title: "Hi" }, NOW)).toMatch(/3–80/);
    expect(promoInputError({ ...ok, image: null }, NOW)).toBe("Choose a picture");
    expect(promoInputError({ ...ok, image: { size: 10, type: "image/svg+xml" } }, NOW)).toMatch(/JPG, PNG or WebP/);
    expect(promoInputError({ ...ok, image: { size: 3 * 1024 * 1024, type: "image/png" } }, NOW)).toMatch(/2 MB/);
    expect(promoInputError({ ...ok, linkUrl: "http://tamiltaxi.example" }, NOW)).toMatch(/https/);
    expect(promoInputError({ ...ok, sortOrder: "-1" }, NOW)).toMatch(/0 to 999/);
  });

  it("wants an end after the start and in the future", () => {
    const at = (h: number) => new Date(NOW + h * 3_600_000).toISOString();
    expect(promoInputError({ ...ok, startsAt: at(48), endsAt: at(24) }, NOW)).toMatch(/after the start/);
    expect(promoInputError({ ...ok, endsAt: at(-1) }, NOW)).toMatch(/future/);
    expect(promoInputError({ ...ok, startsAt: at(24), endsAt: at(72) }, NOW)).toBeNull();
  });
});

describe("promoStatus", () => {
  const at = (h: number) => new Date(NOW + h * 3_600_000).toISOString();
  it("reads the schedule and the switch", () => {
    expect(promoStatus({ isActive: true, startsAt: at(-1), endsAt: null }, NOW)).toBe("Live");
    expect(promoStatus({ isActive: true, startsAt: at(5), endsAt: null }, NOW)).toBe("Scheduled");
    expect(promoStatus({ isActive: false, startsAt: at(-1), endsAt: null }, NOW)).toBe("Hidden");
    expect(promoStatus({ isActive: true, startsAt: at(-5), endsAt: at(-1) }, NOW)).toBe("Ended");
  });
});

describe("pictureSizeCheck", () => {
  it("passes the size each place shows best at, and larger pictures of that shape", () => {
    expect(placementSize("BANNER")).toBe("1200 × 600 px (2 : 1)");
    expect(pictureSizeCheck("BANNER", 1200, 600)).toEqual({ tone: "ok", text: "1200 × 600 px: the right size." });
    expect(pictureSizeCheck("BANNER", 2400, 1200).tone).toBe("ok");
    expect(pictureSizeCheck("BANNER", 1200, 605).tone).toBe("ok");
    expect(pictureSizeCheck("SPLASH", 1080, 2400).tone).toBe("ok");
  });

  it("says what the app cuts off from another shape, and warns about small pictures", () => {
    expect(pictureSizeCheck("BANNER", 1080, 1080).text).toMatch(/isn't 2 : 1: the app cuts off the top and bottom.*1200 × 600 px/);
    expect(pictureSizeCheck("BANNER", 1500, 500).text).toMatch(/left and right edges/);
    expect(pictureSizeCheck("SPLASH", 1080, 1920).text).toMatch(/isn't 9 : 20: the app cuts off the left and right edges/);
    expect(pictureSizeCheck("BANNER", 800, 400)).toEqual({ tone: "warn", text: "800 × 400 px is the right shape but small, so it may look blurry. Make it 1200 × 600 px." });
  });
});
