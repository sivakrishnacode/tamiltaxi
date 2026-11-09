// Engage: shared helpers of the hub's tabs (Overview, Automations, Campaigns, In-app, History). Pure, so tested.
import { TARGET_LABEL } from "./automations";
import type { Announcement, Campaign, ReminderLog, WelcomeLog } from "./types";
import { personHref, TRIGGER_LABEL, welcomeStatus } from "./whatsapp";

/** Live, Ended (its end date passed) or Hidden. */
export function announcementStatus(a: Pick<Announcement, "isActive" | "endsAt">, now = Date.now()): "Live" | "Ended" | "Hidden" {
  if (a.endsAt && new Date(a.endsAt).getTime() <= now) return "Ended";
  return a.isActive ? "Live" : "Hidden";
}

const DAY_MS = 86_400_000;

/** Campaigns sent in the last [days] days. */
export function campaignsSentWithin(campaigns: readonly Campaign[], days: number, now = Date.now()): number {
  return campaigns.filter((c) => c.status === "SENT" && c.sentAt && now - new Date(c.sentAt).getTime() <= days * DAY_MS).length;
}

export type HistoryType = "SEARCH" | "ROUTINE" | "WELCOME" | "CAMPAIGN" | "ANNOUNCEMENT";
export type HistoryChannel = "PUSH" | "WHATSAPP";

/** One message that went out, whatever sent it. */
export interface HistoryItem {
  readonly id: string;
  readonly at: string;
  readonly type: HistoryType;
  readonly channel: HistoryChannel;
  /** "Didn't book", "Driver approved welcome", "Campaign"… */
  readonly label: string;
  /** A person (with their page), or the audience of a broadcast. */
  readonly who: { readonly name: string; readonly phone?: string; readonly href?: string };
  readonly title: string;
  readonly body: string;
  readonly result: { readonly label: string; readonly tone: "good" | "bad" | "neutral"; readonly detail?: string };
}

const AUDIENCE = { ALL: "Riders and drivers", PASSENGER: "All riders", DRIVER: "All drivers" } as const;

/** Reminders, WhatsApp welcomes, sent campaigns and published announcements, newest first. */
export function historyItems(src: {
  reminders?: readonly ReminderLog[] | null;
  welcomes?: readonly WelcomeLog[] | null;
  campaigns?: readonly Campaign[] | null;
  announcements?: readonly Announcement[] | null;
}): HistoryItem[] {
  const items: HistoryItem[] = [
    ...(src.reminders ?? []).map(
      (r): HistoryItem => ({
        id: `r-${r.id}`,
        at: r.sentAt,
        type: r.kind,
        channel: "PUSH",
        label: r.kind === "SEARCH" ? "Didn't book" : "Usual trip",
        who: { name: r.userName ?? r.phone, phone: r.userName ? r.phone : undefined, href: `/users/${encodeURIComponent(r.userId)}` },
        title: r.title,
        body: r.body,
        result: r.booked ? { label: "Booked", tone: "good" } : { label: "Sent", tone: "neutral" },
      }),
    ),
    ...(src.welcomes ?? []).map((w): HistoryItem => {
      const status = welcomeStatus(w);
      return {
        id: `w-${w.id}`,
        at: w.sentAt ?? w.createdAt,
        type: "WELCOME",
        channel: "WHATSAPP",
        label: `${TRIGGER_LABEL[w.trigger] ?? w.trigger} welcome`,
        who: { name: w.userName ?? w.phone, phone: w.userName ? w.phone : undefined, href: personHref(w) },
        title: "WhatsApp template",
        body: w.template,
        result:
          status === "SENT"
            ? { label: "Sent", tone: "neutral" }
            : status === "FAILED"
              ? { label: "Not sent", tone: "bad", detail: w.error ?? undefined }
              : { label: "Sending", tone: "neutral" },
      };
    }),
    ...(src.campaigns ?? [])
      .filter((c) => c.status === "SENT")
      .map(
        (c): HistoryItem => ({
          id: `c-${c.id}`,
          at: c.sentAt ?? c.sendAt,
          type: "CAMPAIGN",
          channel: "PUSH",
          label: "Campaign",
          who: { name: "All riders" },
          title: c.title,
          body: c.body,
          result: { label: `Opens ${TARGET_LABEL[c.target] ?? c.target}`, tone: "neutral" },
        }),
      ),
    ...(src.announcements ?? []).map(
      (a): HistoryItem => ({
        id: `a-${a.id}`,
        at: a.createdAt,
        type: "ANNOUNCEMENT",
        channel: "PUSH",
        label: "Announcement",
        who: { name: AUDIENCE[a.audience] ?? a.audience },
        title: a.title,
        body: a.body,
        result: { label: announcementStatus(a) === "Live" ? "Showing in the apps" : "Published", tone: "neutral" },
      }),
    ),
  ];
  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export const HISTORY_FILTERS = [
  { key: "all", label: "All" },
  { key: "reminders", label: "Reminders" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "broadcasts", label: "Campaigns & announcements" },
] as const;

export type HistoryFilter = (typeof HISTORY_FILTERS)[number]["key"];

export function isHistoryFilter(v: unknown): v is HistoryFilter {
  return HISTORY_FILTERS.some((f) => f.key === v);
}

export function filterHistory(items: readonly HistoryItem[], filter: HistoryFilter): HistoryItem[] {
  if (filter === "reminders") return items.filter((i) => i.type === "SEARCH" || i.type === "ROUTINE");
  if (filter === "whatsapp") return items.filter((i) => i.channel === "WHATSAPP");
  if (filter === "broadcasts") return items.filter((i) => i.type === "CAMPAIGN" || i.type === "ANNOUNCEMENT");
  return [...items];
}
