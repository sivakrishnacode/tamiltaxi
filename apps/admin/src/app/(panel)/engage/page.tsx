import {
  ArrowRightIcon,
  BadgeCheckIcon,
  BellRingIcon,
  CalendarClockIcon,
  CheckIcon,
  GalleryHorizontalIcon,
  MegaphoneIcon,
  MessageCircleIcon,
  RepeatIcon,
  SearchXIcon,
  SmartphoneIcon,
  UserPlusIcon,
  UserRoundCheckIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError, adminApi } from "@/lib/api";
import { conversionLabel, readReminderSettings } from "@/lib/automations";
import { announcementStatus, campaignsSentWithin, historyItems } from "@/lib/engage";
import { formatCount, formatDateTime, formatPhone } from "@/lib/format";
import { promoStatus } from "@/lib/promos";
import { cn } from "@/lib/utils";
import { readWelcomeSettings } from "@/lib/whatsapp";

import { ChannelBadge, type Channel } from "./automations/flow";

export const metadata: Metadata = { title: "Engage" };

/** null when this API doesn't have the endpoint yet (404). */
function orNull<T>(p: Promise<T>): Promise<T | null> {
  return p.catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  });
}

function Kpi({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return (
    <Card className="gap-1 px-4 py-4">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5 text-coral-600" aria-hidden /> {label}
      </p>
      <p className="font-heading text-2xl font-semibold text-navy-900 tabular-nums">{value}</p>
      <p className="truncate text-xs text-muted-foreground">{detail}</p>
    </Card>
  );
}

function Panel({ icon: Icon, title, href, linkLabel, children }: { icon: LucideIcon; title: string; href: string; linkLabel: string; children: React.ReactNode }) {
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center gap-2.5 border-b px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-coral-50 text-coral-600">
          <Icon className="size-4" aria-hidden />
        </span>
        <h2 className="flex-1 font-heading text-base font-semibold text-navy-900">{title}</h2>
      </div>
      <CardContent className="flex-1 px-4 py-3">{children}</CardContent>
      <Link href={href} className="flex items-center justify-between border-t px-4 py-2.5 text-sm font-medium text-coral-600 hover:bg-muted/40">
        {linkLabel} <ArrowRightIcon className="size-4" aria-hidden />
      </Link>
    </Card>
  );
}

function StatusRow({ icon: Icon, label, channel, isOn, detail }: { icon: LucideIcon; label: string; channel: Channel; isOn: boolean; detail?: string }) {
  return (
    <li className="flex items-center gap-2.5 py-2">
      <Icon className="size-4 shrink-0 text-navy-700" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-navy-900">{label}</span>
        {detail && <span className="block truncate text-xs text-muted-foreground">{detail}</span>}
      </span>
      <ChannelBadge channel={channel} />
      <span className={cn("flex w-16 items-center justify-end gap-1.5 text-xs font-medium", isOn ? "text-success-text" : "text-muted-foreground")}>
        <span className={cn("size-2 rounded-full", isOn ? "bg-success" : "bg-muted-foreground/40")} aria-hidden />
        {isOn ? "On" : "Off"}
      </span>
    </li>
  );
}

export default async function EngageOverviewPage() {
  const [settings, automations, welcome, campaigns, announcements, promos] = await Promise.all([
    adminApi.settings(),
    orNull(adminApi.automations()),
    orNull(adminApi.welcomeMessages()),
    adminApi.campaigns(),
    adminApi.announcements(),
    adminApi.promos(),
  ]);
  const r = readReminderSettings(settings).values;
  const w = readWelcomeSettings(settings);

  const reminderSent = (automations?.search.sent7d ?? 0) + (automations?.routine.sent7d ?? 0);
  const reminderBooked = (automations?.search.booked7d ?? 0) + (automations?.routine.booked7d ?? 0);
  const welcomeTotals = welcome ? Object.values(welcome.triggers).reduce((t, x) => ({ sent: t.sent + x.sent7d, failed: t.failed + x.failed7d }), { sent: 0, failed: 0 }) : null;
  const campaignsSent30 = campaignsSentWithin(campaigns, 30);
  const scheduled = campaigns.filter((c) => c.status === "SCHEDULED").sort((a, b) => new Date(a.sendAt).getTime() - new Date(b.sendAt).getTime());
  const liveAnnouncements = announcements.filter((a) => announcementStatus(a) === "Live");
  const liveSplash = promos.find((p) => p.placement === "SPLASH" && promoStatus(p) === "Live");
  const liveBanners = promos.filter((p) => p.placement === "BANNER" && promoStatus(p) === "Live");
  const recent = historyItems({ reminders: automations?.recent, welcomes: welcome?.recent, campaigns, announcements }).slice(0, 6);
  const automationsOn = [r.searchReminderEnabled, r.routineReminderEnabled, ...(w.isSupported ? [w.values.welcomeRiderEnabled, w.values.welcomeDriverRegisteredEnabled, w.values.welcomeDriverApprovedEnabled] : [])].filter(Boolean).length;

  return (
    <>
      <PageHeader
        title="Engage"
        description="Every message to riders and drivers in one place: what sends itself, what you send, and what shows in the apps."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/engage/in-app">
                <MegaphoneIcon /> Announce
              </Link>
            </Button>
            <Button asChild>
              <Link href="/engage/campaigns">
                <BellRingIcon /> New campaign
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={BellRingIcon} label="Reminders sent · 7 days" value={automations ? formatCount(reminderSent) : "–"} detail="Didn't book and usual trip pushes" />
        <Kpi
          icon={CheckIcon}
          label="Rides booked after one"
          value={automations ? formatCount(reminderBooked) : "–"}
          detail={automations ? `${conversionLabel(reminderSent, reminderBooked)} booked within an hour` : "–"}
        />
        <Kpi
          icon={MessageCircleIcon}
          label="WhatsApp welcomes · 7 days"
          value={welcomeTotals ? formatCount(welcomeTotals.sent) : "–"}
          detail={welcomeTotals ? (welcomeTotals.failed ? `${formatCount(welcomeTotals.failed)} not sent` : "None failed") : "Arrives with the next API update"}
        />
        <Kpi
          icon={CalendarClockIcon}
          label="Campaigns sent · 30 days"
          value={formatCount(campaignsSent30)}
          detail={scheduled.length ? `${scheduled.length} scheduled` : "None scheduled"}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel icon={ZapIcon} title={`Automations · ${automationsOn} on`} href="/engage/automations" linkLabel="Manage automations">
          <ul className="divide-y">
            <StatusRow icon={SearchXIcon} label="Didn't book" channel="PUSH" isOn={r.searchReminderEnabled} detail={`${r.searchReminderDelayMin} min after a fare check`} />
            <StatusRow icon={RepeatIcon} label="Usual trip" channel="PUSH" isOn={r.routineReminderEnabled} detail={`${r.routineLeadMin} min before their usual time`} />
            {w.isSupported && (
              <>
                <StatusRow icon={UserPlusIcon} label="New rider" channel="WHATSAPP" isOn={w.values.welcomeRiderEnabled} detail="Welcome after sign-up" />
                <StatusRow icon={UserRoundCheckIcon} label="Driver registered" channel="WHATSAPP" isOn={w.values.welcomeDriverRegisteredEnabled} detail="Welcome after registering" />
                <StatusRow icon={BadgeCheckIcon} label="Driver approved" channel="WHATSAPP" isOn={w.values.welcomeDriverApprovedEnabled} detail="Welcome on approval" />
              </>
            )}
          </ul>
        </Panel>

        <Panel icon={CalendarClockIcon} title="Campaigns" href="/engage/campaigns" linkLabel={scheduled.length ? "See all campaigns" : "Plan a campaign"}>
          {scheduled.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">Nothing scheduled. Plan one ahead of a festival or a long weekend.</p>
          ) : (
            <ul className="divide-y">
              {scheduled.slice(0, 4).map((c) => (
                <li key={c.id} className="py-2">
                  <p className="truncate text-sm font-medium text-navy-900">{c.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(c.sendAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel icon={SmartphoneIcon} title="In the apps now" href="/engage/in-app" linkLabel="Manage in-app">
          <ul className="divide-y">
            <li className="flex items-center gap-2.5 py-2">
              <MegaphoneIcon className="size-4 shrink-0 text-navy-700" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-navy-900">
                  {liveAnnouncements.length} announcement{liveAnnouncements.length === 1 ? "" : "s"}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{liveAnnouncements[0]?.title ?? "None showing"}</span>
              </span>
            </li>
            <li className="flex items-center gap-2.5 py-2">
              <SmartphoneIcon className="size-4 shrink-0 text-navy-700" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-navy-900">Splash: {liveSplash ? "live" : "logo only"}</span>
                <span className="block truncate text-xs text-muted-foreground">{liveSplash?.title ?? "No festival splash"}</span>
              </span>
            </li>
            <li className="flex items-center gap-2.5 py-2">
              <GalleryHorizontalIcon className="size-4 shrink-0 text-navy-700" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-navy-900">
                  {liveBanners.length} Home banner{liveBanners.length === 1 ? "" : "s"}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{liveBanners.map((b) => b.title).join(", ") || "No banner row"}</span>
              </span>
            </li>
          </ul>
        </Panel>
      </div>

      <Card className="mt-6 gap-0 py-0">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="font-heading text-base font-semibold text-navy-900">Latest messages</h2>
          <Link href="/engage/history" className="flex items-center gap-1 text-sm font-medium text-coral-600 hover:underline">
            All history <ArrowRightIcon className="size-4" aria-hidden />
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nothing sent yet.</p>
        ) : (
          <ul className="divide-y">
            {recent.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <ChannelBadge channel={i.channel} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-navy-900">{i.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {i.label} · {i.who.name.startsWith("+") ? formatPhone(i.who.name) : i.who.name}
                  </span>
                </span>
                <span className={cn("text-xs", i.result.tone === "good" ? "font-medium text-success-text" : i.result.tone === "bad" ? "font-medium text-error" : "text-muted-foreground")}>
                  {i.result.label}
                </span>
                <span className="w-36 text-right text-xs text-muted-foreground tabular-nums">{formatDateTime(i.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
