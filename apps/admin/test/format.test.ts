import { describe, expect, it } from "vitest";

import { displayName, expiryInfo, formatAgo, formatDate, formatInr, formatPhone, humanize, istDayKey, kycProgress, shortId } from "@/lib/format";
import type { KycDocument } from "@/lib/types";

describe("formatInr", () => {
  it("uses Indian digit grouping with a rupee sign", () => {
    expect(formatInr(1420)).toBe("₹1,420");
    expect(formatInr(123456)).toBe("₹1,23,456");
    expect(formatInr(10000000)).toBe("₹1,00,00,000");
  });

  it("handles zero, negatives, decimals and missing values", () => {
    expect(formatInr(0)).toBe("₹0");
    expect(formatInr(-38)).toBe("-₹38");
    expect(formatInr(37.6)).toBe("₹38");
    expect(formatInr(null)).toBe("₹0");
    expect(formatInr(Number.NaN)).toBe("₹0");
  });
});

describe("formatAgo", () => {
  it("rounds down to minutes, hours, then days", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    expect(formatAgo("2026-10-01T11:59:30Z", now)).toBe("just now");
    expect(formatAgo("2026-10-01T11:48:00Z", now)).toBe("12 min");
    expect(formatAgo("2026-10-01T06:30:00Z", now)).toBe("5 h");
    expect(formatAgo("2026-09-30T11:00:00Z", now)).toBe("1 day");
    expect(formatAgo("2026-09-28T12:00:00Z", now)).toBe("3 days");
    expect(formatAgo(null, now)).toBe("–");
  });
});

describe("other formatters", () => {
  it("formats Indian mobile numbers", () => {
    expect(formatPhone("+919000000001")).toBe("+91 90000 00001");
    expect(formatPhone("12345")).toBe("12345");
    expect(formatPhone(null)).toBe("–");
    expect(formatPhone("deleted:ckxyz")).toBe("Deleted account");
    expect(displayName({ name: null, phone: "deleted:ckxyz" })).toBe("Deleted account");
  });

  it("formats dates in IST", () => {
    // 20:00 UTC on 24 Sep is already 25 Sep in Coimbatore.
    expect(formatDate("2026-09-24T20:00:00Z")).toBe("25 Sep 2026");
  });

  it("humanizes enums, shortens ids, falls back to phone for names", () => {
    expect(humanize("IN_PROGRESS")).toBe("In progress");
    expect(shortId("cmuh3oalh00095rya68imfvo3")).toBe("68IMFVO3");
    expect(displayName({ name: null, phone: "+919000000001" })).toBe("+91 90000 00001");
    expect(displayName({ name: " Karthik S ", phone: "+919000000001" })).toBe("Karthik S");
  });

  it("counts verified RC + insurance, plus the identity check when given", () => {
    const doc = (type: KycDocument["type"], status: KycDocument["status"]) => ({ type, status }) as KycDocument;
    const docs = [doc("VEHICLE_RC", "VERIFIED"), doc("INSURANCE", "REJECTED"), doc("AADHAAR", "VERIFIED")];
    expect(kycProgress(docs)).toEqual({ verified: 1, total: 2 });
    expect(kycProgress(docs, "APPROVED")).toEqual({ verified: 2, total: 3 });
    expect(kycProgress(docs, "IN_REVIEW")).toEqual({ verified: 1, total: 3 });
  });
});

describe("expiryInfo", () => {
  // 1 Nov 2026, 23:00 IST (still 1 Nov in India, 17:30 UTC).
  const now = new Date("2026-11-01T17:30:00Z");

  it("takes today in India", () => {
    expect(istDayKey(now)).toBe("2026-11-01");
    expect(istDayKey(new Date("2026-11-01T19:00:00Z"))).toBe("2026-11-02");
  });

  it("says how long a document stays valid, amber within 30 days, red once past", () => {
    expect(expiryInfo(null, now)).toBeNull();
    expect(expiryInfo("2027-03-31T00:00:00.000Z", now)).toEqual({ label: "Valid until 31 Mar 2027", tone: "ok" });
    expect(expiryInfo("2026-12-01T00:00:00.000Z", now)).toEqual({ label: "Valid until 1 Dec 2026 · 30 days left", tone: "soon" });
    expect(expiryInfo("2026-11-02T00:00:00.000Z", now)?.label).toBe("Valid until 2 Nov 2026 · 1 day left");
    expect(expiryInfo("2026-11-01T00:00:00.000Z", now)?.label).toBe("Valid until 1 Nov 2026 · last day");
    expect(expiryInfo("2026-10-31T00:00:00.000Z", now)).toEqual({ label: "Expired 31 Oct 2026", tone: "expired" });
  });
});
