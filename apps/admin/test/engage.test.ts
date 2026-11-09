import { describe, expect, it } from "vitest";

import { reminderMessageError, samplePreview } from "@/lib/automations";
import { announcementStatus, filterHistory, historyItems } from "@/lib/engage";
import type { Announcement, Campaign, ReminderLog, WelcomeLog } from "@/lib/types";

const reminder: ReminderLog = {
  id: "r1",
  kind: "SEARCH",
  userId: "u1",
  userName: "Siva",
  phone: "+919000000101",
  title: "Siva, Ooty?",
  body: "Drivers are available.",
  sentAt: "2026-11-09T10:00:00Z",
  booked: true,
};
const welcome: WelcomeLog = {
  id: "w1",
  trigger: "DRIVER_APPROVED",
  template: "welcome_driver_approved",
  userId: "u2",
  userName: "Kavin",
  phone: "+919000000102",
  driverId: "d2",
  createdAt: "2026-11-09T11:00:00Z",
  sentAt: null,
  error: "Template not found",
};
const campaign = (status: Campaign["status"]): Campaign => ({
  id: `c-${status}`,
  title: "Native poga plan ah?",
  body: "Book a one-way cab.",
  target: "OUTSTATION",
  sendAt: "2026-11-09T09:00:00Z",
  status,
  sentAt: status === "SENT" ? "2026-11-09T09:00:00Z" : null,
  createdAt: "2026-11-08T09:00:00Z",
});
const announcement: Announcement = {
  id: "a1",
  audience: "DRIVER",
  title: "Rain near Ukkadam",
  body: "Drive slowly.",
  cityId: null,
  isActive: true,
  startsAt: "2026-11-09T08:00:00Z",
  endsAt: null,
  createdAt: "2026-11-09T08:00:00Z",
};

describe("history", () => {
  const items = historyItems({ reminders: [reminder], welcomes: [welcome], campaigns: [campaign("SENT"), campaign("SCHEDULED")], announcements: [announcement] });

  it("merges every message newest first, leaving out campaigns not sent yet", () => {
    expect(items.map((i) => i.id)).toEqual(["w-w1", "r-r1", "c-c-SENT", "a-a1"]);
  });

  it("links each person to the right page and shows the result", () => {
    expect(items[0]).toMatchObject({ channel: "WHATSAPP", who: { href: "/drivers/d2" }, result: { label: "Not sent", tone: "bad", detail: "Template not found" } });
    expect(items[1]).toMatchObject({ channel: "PUSH", label: "Didn't book", who: { href: "/users/u1" }, result: { label: "Booked", tone: "good" } });
    expect(items[3].who.name).toBe("All drivers");
  });

  it("filters by kind", () => {
    expect(filterHistory(items, "reminders").map((i) => i.id)).toEqual(["r-r1"]);
    expect(filterHistory(items, "whatsapp").map((i) => i.id)).toEqual(["w-w1"]);
    expect(filterHistory(items, "broadcasts").map((i) => i.id)).toEqual(["c-c-SENT", "a-a1"]);
    expect(filterHistory(items, "all")).toHaveLength(4);
  });

  it("tells live, hidden and ended announcements apart", () => {
    const now = Date.parse("2026-11-10T00:00:00Z");
    expect(announcementStatus(announcement, now)).toBe("Live");
    expect(announcementStatus({ ...announcement, isActive: false }, now)).toBe("Hidden");
    expect(announcementStatus({ ...announcement, endsAt: "2026-11-09T12:00:00Z" }, now)).toBe("Ended");
  });
});

describe("reminder messages", () => {
  it("allows only the words each reminder can fill", () => {
    expect(reminderMessageError("SEARCH_OUTSTATION", "{name}, {drop}?", "Drivers are available.")).toBeNull();
    expect(reminderMessageError("SEARCH_LOCAL", "Your {time} ride", "x")).toMatch(/\{time\} can't be used here/);
    expect(reminderMessageError("ROUTINE", "Going to {drop}?", "Your usual {time} ride. Book {vehicle} now.")).toBeNull();
    expect(reminderMessageError("ROUTINE", "", "x")).toBe("Write a title");
  });

  it("previews a message as one rider reads it", () => {
    expect(samplePreview("SEARCH_OUTSTATION", "{name}, {drop}?")).toBe("Siva, Ooty?");
    expect(samplePreview("ROUTINE", "Book {vehicle} for {time}")).toBe("Book an Auto for 9:05 am");
    expect(samplePreview("SEARCH_LOCAL", "Your {time}")).toBe("Your {time}");
  });
});
