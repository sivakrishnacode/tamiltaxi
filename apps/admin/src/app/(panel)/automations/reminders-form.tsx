"use client";

import { InfoIcon, MoonIcon, RepeatIcon, SearchXIcon, type LucideIcon } from "lucide-react";

import { PushPreview } from "@/components/common/push-preview";
import { SaveBar, SettingField, useSettingsDraft, type FieldDef, type SettingsDraft } from "@/components/settings/settings-kit";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { conversionLabel, hourLabel } from "@/lib/automations";
import { formatCount } from "@/lib/format";
import type { ReminderSettings, ReminderStats } from "@/lib/types";
import { cn } from "@/lib/utils";

import { saveReminderSettings } from "../actions";

const F: Record<Exclude<keyof ReminderSettings, "searchReminderEnabled" | "routineReminderEnabled">, FieldDef> = {
  searchReminderDelayMin: { key: "searchReminderDelayMin", label: "Send after", hint: "Minutes after the fare check", step: "1", suffix: "min" },
  routineMinTrips: { key: "routineMinTrips", label: "Usual trip after", hint: "Days with the same trip at about the same time", step: "1", suffix: "days" },
  routineLeadMin: { key: "routineLeadMin", label: "Remind before", hint: "Minutes before their usual time", step: "1", suffix: "min" },
  reminderQuietStartHour: { key: "reminderQuietStartHour", label: "Quiet from", hint: "Hour in IST (22 = 10 pm)", step: "1", suffix: "h" },
  reminderQuietEndHour: { key: "reminderQuietEndHour", label: "Quiet until", hint: "Hour in IST (8 = 8 am)", step: "1", suffix: "h" },
  reminderDailyCap: { key: "reminderDailyCap", label: "Daily cap", hint: "Most reminders one rider gets in a day", step: "1", suffix: "a day" },
};

/** A whole number from the draft for the plain-language lines, or [fallback] while the field is being typed. */
function wholeOr(form: SettingsDraft, key: string, fallback: string): string {
  const n = Number(form.draft[key]);
  return String(form.draft[key]).trim() !== "" && Number.isInteger(n) && n >= 0 ? String(n) : fallback;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="font-heading text-lg font-semibold text-navy-900 tabular-nums">{value}</p>
    </div>
  );
}

function ReminderCard({
  icon: Icon,
  title,
  enabledKey,
  about,
  form,
  stats,
  children,
  previews,
  disabled,
}: {
  icon: LucideIcon;
  title: string;
  enabledKey: keyof ReminderSettings;
  about: string;
  form: SettingsDraft;
  stats: ReminderStats | null;
  children: React.ReactNode;
  previews: React.ReactNode;
  disabled?: boolean;
}) {
  const isOn = form.draft[enabledKey] === true;
  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold text-navy-900">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-coral-50 text-coral-600">
            <Icon className="size-4" aria-hidden />
          </span>
          <span className="flex-1">{title}</span>
          {!isOn && <Badge variant="secondary">Off</Badge>}
          <Switch checked={isOn} disabled={disabled} onCheckedChange={(v) => form.set(enabledKey, v)} aria-label={`${title}: on or off`} />
        </CardTitle>
        <CardDescription className="leading-relaxed">{about}</CardDescription>
      </CardHeader>
      <CardContent className={cn("grid gap-5 border-t py-4 transition-opacity", !isOn && "opacity-60")}>
        <div className="grid gap-4 sm:grid-cols-2">{children}</div>
        <div className="grid gap-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Preview</p>
          {previews}
        </div>
      </CardContent>
      <div className="mt-auto grid grid-cols-3 gap-3 border-t bg-muted/30 px-4 py-3">
        <Stat label="Sent · 7 days" value={stats ? formatCount(stats.sent7d) : "–"} />
        <Stat label="Booked in 1 h" value={stats ? formatCount(stats.booked7d) : "–"} />
        <Stat label="Conversion" value={stats ? conversionLabel(stats.sent7d, stats.booked7d) : "–"} />
      </div>
    </Card>
  );
}

/**
 * The reminder settings (keys of GET/PUT /admin/settings), saved together like Settings. On an API without them the
 * defaults are shown read-only.
 */
export function RemindersForm({
  initial,
  isSupported,
  stats,
}: {
  initial: ReminderSettings;
  isSupported: boolean;
  stats: { search: ReminderStats; routine: ReminderStats } | null;
}) {
  const form = useSettingsDraft(initial as unknown as Record<string, number | boolean>, saveReminderSettings);
  const delay = wholeOr(form, "searchReminderDelayMin", "N");
  const minTrips = wholeOr(form, "routineMinTrips", "N");
  const lead = wholeOr(form, "routineLeadMin", "M");
  const quietFrom = hourLabel(Number(form.draft.reminderQuietStartHour));
  const quietUntil = hourLabel(Number(form.draft.reminderQuietEndHour));
  const cap = wholeOr(form, "reminderDailyCap", "N");

  return (
    <form noValidate onSubmit={form.submit} className="grid gap-4">
      {!isSupported && (
        <p className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning-tint px-4 py-3 text-sm text-warning-text">
          <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          This API doesn&apos;t have reminders yet. The values below are the defaults; saving is off until the API is updated.
        </p>
      )}
      <fieldset disabled={!isSupported} className="grid min-w-0 gap-4">
        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          <ReminderCard
            icon={SearchXIcon}
            title="Didn't book reminder"
            enabledKey="searchReminderEnabled"
            about={`A rider who checked fares but didn't book gets one push after ${delay} minutes.`}
            form={form}
            stats={stats?.search ?? null}
            disabled={!isSupported}
            previews={
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <PushPreview
                  title="Siva, Ooty?"
                  body="Drivers are available. Confirm now to get an outstation cab right at your doorstep."
                  caption="Outstation search"
                />
                <PushPreview title="Siva, Tidel Park?" body="Drivers are nearby. Book now and get there on time." caption="In-city search" />
              </div>
            }
          >
            <SettingField field={F.searchReminderDelayMin} form={form} />
          </ReminderCard>

          <ReminderCard
            icon={RepeatIcon}
            title="Usual trip reminder"
            enabledKey="routineReminderEnabled"
            about={`Riders who book the same trip around the same time on ${minTrips} or more days get a push ${lead} minutes before their usual time.`}
            form={form}
            stats={stats?.routine ?? null}
            disabled={!isSupported}
            previews={<PushPreview title="Going to Tidel Park?" body="Your usual 9:00 am ride is a tap away. Book a Bike now." caption="Morning routine" />}
          >
            <SettingField field={F.routineMinTrips} form={form} />
            <SettingField field={F.routineLeadMin} form={form} />
          </ReminderCard>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5 text-base font-semibold text-navy-900">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-coral-50 text-coral-600">
                <MoonIcon className="size-4" aria-hidden />
              </span>
              Limits
            </CardTitle>
            <CardDescription>
              For both reminders: none from {quietFrom} to {quietUntil} (India time), and at most {cap} per rider a day.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 border-t pt-4 sm:grid-cols-3">
            <SettingField field={F.reminderQuietStartHour} form={form} />
            <SettingField field={F.reminderQuietEndHour} form={form} />
            <SettingField field={F.reminderDailyCap} form={form} />
          </CardContent>
        </Card>
      </fieldset>

      <SaveBar form={form} label="Save reminders" disabled={!isSupported} />
    </form>
  );
}
