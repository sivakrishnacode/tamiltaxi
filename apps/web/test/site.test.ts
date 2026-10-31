import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { footerColumns } from "@/components/site-footer";
import { nav } from "@/components/site-header";
import { faqs } from "@/lib/faq";
import { deletion, legalUpdated, privacy, terms } from "@/lib/legal";
import { openGraphBase, pages, playStoreUrl, site } from "@/lib/site";
import { vision } from "@/lib/vision";

const repoRoot = path.resolve(__dirname, "../../..");
const appDir = path.resolve(__dirname, "../src/app");
const publicDir = path.resolve(__dirname, "../public");
const homePage = readFileSync(path.join(appDir, "page.tsx"), "utf8");

/** Width and height of a PNG, JPEG or WebP file. */
function imageSize(buf: Buffer): [number, number] {
  if (buf.subarray(1, 4).toString("ascii") === "PNG") return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  if (buf.subarray(8, 12).toString("ascii") === "WEBP") {
    const chunk = buf.subarray(12, 16).toString("ascii");
    if (chunk === "VP8X") return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
    if (chunk === "VP8L") {
      const bits = buf.readUInt32LE(21);
      return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
    }
    return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  }
  // JPEG: walk the segments to the frame header (SOF0–SOF15, not DHT/JPG/DAC).
  for (let i = 2; i < buf.length; ) {
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error("not a PNG, JPEG or WebP");
}

describe("site config", () => {
  it("links each Play Store button to the app's real applicationId", () => {
    const gradle = { rider: "passenger", driver: "driver" } as const;
    for (const [app, folder] of Object.entries(gradle) as [keyof typeof gradle, string][]) {
      const file = readFileSync(path.join(repoRoot, `apps/${folder}/android/app/build.gradle.kts`), "utf8");
      const applicationId = /applicationId\s*=\s*"([^"]+)"/.exec(file)?.[1];
      expect(applicationId).toBe(site.apps[app].packageId);
      expect(playStoreUrl(app)).toBe(`https://play.google.com/store/apps/details?id=${applicationId}`);
    }
  });

  it("lists only pages that exist in the sitemap", () => {
    for (const page of pages) {
      expect(existsSync(path.join(appDir, page, "page.tsx")), page).toBe(true);
    }
  });

  it("ships the social preview image at the size it declares, and a favicon", () => {
    const [image] = openGraphBase.images;
    const png = readFileSync(path.join(publicDir, image.url));
    // PNG header: width and height are big-endian at bytes 16 and 20.
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([image.width, image.height]);
    expect(existsSync(path.join(appDir, "favicon.ico"))).toBe(true);
  });
});

describe("home page", () => {
  it("has a section for every header and footer link to it", () => {
    const links = [...nav, ...footerColumns.flatMap((c) => c.links)].map((l) => l.href);
    for (const href of links.filter((h) => h.startsWith("/#"))) {
      expect(homePage, href).toContain(`id="${href.slice(2)}"`);
    }
  });

  it("ships every picture it shows", () => {
    const files = [...homePage.matchAll(/"(\/(?:screens|pictures|brand)\/[\w.-]+)"/g)].map((m) => m[1]);
    const vehicles = [...homePage.matchAll(/(?:image: |name=)"(\w+)"/g)].map((m) => `/vehicles/${m[1]}.webp`);
    expect(vehicles.length).toBeGreaterThan(10);
    for (const file of [...files, ...vehicles]) {
      expect(existsSync(path.join(publicDir, file)), file).toBe(true);
    }
  });

  it("quotes the vision with its source, and ships the photo at the size it declares", () => {
    expect(vision.sourceUrl).toMatch(/^https:\/\//);
    expect(vision.en).toContain("Tamil Taxi app");
    if (vision.photo) {
      const file = path.join(publicDir, vision.photo.src);
      expect(existsSync(file), vision.photo.src).toBe(true);
      expect(imageSize(readFileSync(file))).toEqual([vision.photo.width, vision.photo.height]);
    }
  });

  it("never reads as the Government's own service", () => {
    expect(site.independence).toMatch(/not run by or endorsed by the Government/);
    expect(homePage).toContain("{site.independence}");
    expect(readFileSync(path.resolve(__dirname, "../src/components/site-footer.tsx"), "utf8")).toContain("{site.independence}");
    expect(faqs.some((f) => f.a.includes(site.independence))).toBe(true);
  });
});

describe("legal text", () => {
  it("dates both documents and gives a way to reach us", () => {
    for (const doc of [privacy, terms]) {
      expect(doc.updated).toMatch(/^\d{1,2} \w+ \d{4}$/);
      expect(doc.sections.some((s) => s.paragraphs.some((p) => p.includes(site.email)))).toBe(true);
    }
  });

  it("carries the same date as the apps' legal screens", () => {
    for (const app of ["passenger", "driver"]) {
      const screen = readFileSync(path.join(repoRoot, `apps/${app}/lib/features/onboarding/legal_screen.dart`), "utf8");
      expect(screen, app).toContain(`'Last updated ${legalUpdated}'`);
    }
  });

  it("promises nothing the apps don't do", () => {
    const text = [privacy, terms]
      .flatMap((doc) => doc.sections.flatMap((s) => [...s.paragraphs, ...(s.list ?? [])]))
      .concat(deletion.deleted, deletion.kept)
      .join("\n");
    // There is no tip feature, police verification is no longer collected, drivers can't export their data, and no
    // job deletes trip records after a fixed time.
    expect(text).not.toMatch(/\btips?\b|police verification|download your data|\d+ years?/i);
  });

  it("links the privacy policy to the account deletion page", () => {
    const links = privacy.sections.flatMap((s) => (s.link ? [s.link.href] : []));
    expect(links).toContain("/delete-account/");
    expect(pages).toContain("/delete-account/");
  });
});
