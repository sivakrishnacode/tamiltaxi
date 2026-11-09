"use client";

import {
  BadgeCheckIcon,
  BellRingIcon,
  ClockIcon,
  CopyIcon,
  InfoIcon,
  Loader2Icon,
  MessageCircleIcon,
  MoonIcon,
  RepeatIcon,
  SearchIcon,
  SearchXIcon,
  SendIcon,
  TriangleAlertIcon,
  UserPlusIcon,
  UserRoundCheckIcon,
  type LucideIcon,
} from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { SaveBar, SettingField, useSettingsDraft, type SettingsDraft } from "@/components/settings/settings-kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { conversionLabel } from "@/lib/automations";
import { formatCount } from "@/lib/format";
import type { ReminderMessage, ReminderSettings, ReminderStats, WelcomeOverview, WelcomeSettings, WelcomeTrigger } from "@/lib/types";
import { fillTemplate, isTemplateName, WELCOME_TRIGGERS, type WelcomeTriggerInfo } from "@/lib/whatsapp";

import { saveAutomationSettings, sendWelcomeTest } from "../../actions";
import { FlowCard, InlineNumber, SectionHeading } from "./flow";
import { MessageList } from "./message-list";

const WELCOME_ICON: Record<WelcomeTrigger, LucideIcon> = {
  RIDER_SIGNUP: UserPlusIcon,
  DRIVER_REGISTERED: UserRoundCheckIcon,
  DRIVER_APPROVED: BadgeCheckIcon,
};

const WELCOME_STEP: Record<WelcomeTrigger, string> = {
  RIDER_SIGNUP: "Rider signs up",
  DRIVER_REGISTERED: "Driver registers",
  DRIVER_APPROVED: "Driver approved",
};

/** The settings typed in a card that have a problem. */
const errorsOf = (form: SettingsDraft, keys: readonly string[]) => keys.flatMap((k) => (form.errors[k] ? [form.errors[k]!] : []));

function reminderStats(s: ReminderStats | undefined) {
  return [
    { label: "Sent · 7 days", value: s ? formatCount(s.sent7d) : "–" },
    { label: "Booked in 1 h", value: s ? formatCount(s.booked7d) : "–", tone: "good" as const },
    { label: "Conversion", value: s ? conversionLabel(s.sent7d, s.booked7d) : "–" },
  ];
}

/** The message as it lands in WhatsApp: a received bubble on the chat background. */
function WhatsAppBubble({ text }: { text: string }) {
  return (
    <div className="rounded-2xl bg-muted/70 p-3 ring-1 ring-foreground/5">
      <div className="max-w-[95%] rounded-xl rounded-tl-sm bg-card px-3 pt-2 pb-1.5 text-[13px] leading-relaxed text-navy-900 shadow-xs">
        <p className="break-words whitespace-pre-line">{text}</p>
        <p className="mt-0.5 text-right text-[10px] text-muted-foreground">now</p>
      </div>
    </div>
  );
}

function WelcomeCard({ info, form, overview, disabled }: { info: WelcomeTriggerInfo; form: SettingsDraft; overview: WelcomeOverview | null; disabled: boolean }) {
  const template = String(form.draft[info.templateKey] ?? "").trim();
  const [isSending, startSending] = useTransition();
  const canTest = !!overview?.isConnected && !disabled && isTemplateName(template);
  const stats = overview?.triggers[info.trigger];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(info.body);
      toast.success("Template text copied: paste it as the body in WATX");
    } catch {
      toast.error("Couldn't copy: select the text and copy it by hand");
    }
  };
  const test = () =>
    startSending(async () => {
      const res = await sendWelcomeTest(info.trigger, template);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });

  return (
    <FlowCard
      icon={WELCOME_ICON[info.trigger]}
      title={info.title}
      channel="WHATSAPP"
      isOn={form.draft[info.enabledKey] === true}
      onToggle={(v) => form.set(info.enabledKey, v)}
      disabled={disabled}
      flow={[
        { icon: WELCOME_ICON[info.trigger], label: WELCOME_STEP[info.trigger], tone: "trigger" },
        { icon: MessageCircleIcon, label: "WhatsApp", tone: "send" },
      ]}
      stats={[
        { label: "Sent · 7 days", value: stats ? formatCount(stats.sent7d) : "–" },
        { label: "Failed · 7 days", value: stats ? formatCount(stats.failed7d) : "–", tone: "error" },
      ]}
    >
      <SettingField field={{ key: info.templateKey, label: "WATX template", hint: "The name exactly as approved in WATX" }} form={form} />
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Suggested text</p>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={copy}>
            <CopyIcon /> Copy
          </Button>
        </div>
        <WhatsAppBubble text={fillTemplate(info.body, info.sample)} />
      </div>
      <Button type="button" variant="outline" disabled={!canTest || isSending} onClick={test} className="mt-auto justify-self-start">
        {isSending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Send test to my WhatsApp
      </Button>
    </FlowCard>
  );
}

/**
 * Engage › Automations: the push reminders (with their random messages) and the WhatsApp welcomes. Switches and the
 * numbers in the flows are settings, saved together; messages save on their own.
 */
export function AutomationsForm({
  initial,
  isSupported,
  reminders,
  welcome,
  messages,
}: {
  initial: ReminderSettings & WelcomeSettings;
  isSupported: { reminders: boolean; welcome: boolean };
  reminders: { search: ReminderStats; routine: ReminderStats } | null;
  welcome: WelcomeOverview | null;
  messages: ReminderMessage[] | null;
}) {
  const form = useSettingsDraft(initial as unknown as Record<string, number | boolean | string>, saveAutomationSettings);
  const offReminders = !isSupported.reminders;
  const offWelcome = !isSupported.welcome;

  return (
    <form noValidate onSubmit={form.submit} className="grid gap-8">
      <section className="grid gap-4" aria-label="Push reminders">
        <SectionHeading icon={BellRingIcon} title="Push reminders" description="Bring riders back to book: after a fare check with no booking, and before a trip they take often." />
        <fieldset disabled={offReminders} className="grid min-w-0 items-stretch gap-4 xl:grid-cols-2">
          <FlowCard
            icon={SearchXIcon}
            title="Didn't book"
            channel="PUSH"
            isOn={form.draft.searchReminderEnabled === true}
            onToggle={(v) => form.set("searchReminderEnabled", v)}
            disabled={offReminders}
            flow={[
              { icon: SearchIcon, label: "Fares checked, no booking", tone: "trigger" },
              { icon: ClockIcon, label: <InlineNumber form={form} settingKey="searchReminderDelayMin" label="Minutes to wait" suffix="min later" />, tone: "wait" },
              { icon: BellRingIcon, label: "Push", tone: "send" },
            ]}
            errors={errorsOf(form, ["searchReminderDelayMin"])}
            stats={reminderStats(reminders?.search)}
          >
            <MessageList kinds={["SEARCH_LOCAL", "SEARCH_OUTSTATION"]} messages={messages} disabled={offReminders} />
          </FlowCard>
          <FlowCard
            icon={RepeatIcon}
            title="Usual trip"
            channel="PUSH"
            isOn={form.draft.routineReminderEnabled === true}
            onToggle={(v) => form.set("routineReminderEnabled", v)}
            disabled={offReminders}
            flow={[
              { icon: RepeatIcon, label: <InlineNumber form={form} settingKey="routineMinTrips" label="Days with the same trip" suffix="days, same trip" />, tone: "trigger" },
              { icon: ClockIcon, label: <InlineNumber form={form} settingKey="routineLeadMin" label="Minutes before the usual time" suffix="min before" />, tone: "wait" },
              { icon: BellRingIcon, label: "Push", tone: "send" },
            ]}
            errors={errorsOf(form, ["routineMinTrips", "routineLeadMin"])}
            stats={reminderStats(reminders?.routine)}
          >
            <MessageList kinds={["ROUTINE"]} messages={messages} disabled={offReminders} />
          </FlowCard>
        </fieldset>
        <Card className="flex-row flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm text-navy-700">
          <span className="flex items-center gap-2 font-medium text-navy-900">
            <MoonIcon className="size-4 text-coral-600" aria-hidden /> Limits for both
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            None from <InlineNumber form={form} settingKey="reminderQuietStartHour" label="Quiet from (hour, IST)" suffix=":00" /> to
            <InlineNumber form={form} settingKey="reminderQuietEndHour" label="Quiet until (hour, IST)" suffix=":00" /> India time,
          </span>
          <span className="flex items-center gap-1.5">
            at most <InlineNumber form={form} settingKey="reminderDailyCap" label="Reminders per rider a day" suffix="per rider a day" />
          </span>
          {errorsOf(form, ["reminderQuietStartHour", "reminderQuietEndHour", "reminderDailyCap"]).map((e) => (
            <span key={e} className="basis-full text-xs text-error">
              {e}
            </span>
          ))}
        </Card>
      </section>

      <section className="grid gap-4" aria-label="WhatsApp welcomes">
        <SectionHeading
          icon={MessageCircleIcon}
          title="WhatsApp welcomes"
          description="One WhatsApp message per person at each moment, from a template approved in WATX. Replies land in the WATX inbox."
        />
        {welcome && !welcome.isConnected && (
          <p className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning-tint px-4 py-3 text-sm text-warning-text">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            WhatsApp isn&apos;t connected on this server (WATX_API_KEY is empty), so no welcome is sent.
          </p>
        )}
        {offWelcome && (
          <p className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning-tint px-4 py-3 text-sm text-warning-text">
            <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            This API doesn&apos;t have WhatsApp welcomes yet; they can be switched on after the next API update.
          </p>
        )}
        <details className="group rounded-xl border bg-card px-4 py-3 text-sm text-navy-700">
          <summary className="cursor-pointer font-medium text-navy-900 marker:text-muted-foreground">Adding a template in WATX</summary>
          <ol className="mt-2 grid list-decimal gap-1 pl-5 marker:text-muted-foreground">
            <li>WhatsApp › Templates › New Template, with the name below, category Utility, language English (US), no header, numbered variables.</li>
            <li>Paste the suggested text (Copy) as the body, give {"{{1}}"} a sample first name, and submit it to Meta.</li>
            <li>Once it shows Approved (usually within a day), send a test to yourself, then switch it on and save.</li>
          </ol>
        </details>
        <fieldset disabled={offWelcome} className="grid min-w-0 items-stretch gap-4 xl:grid-cols-3">
          {WELCOME_TRIGGERS.map((info) => (
            <WelcomeCard key={info.trigger} info={info} form={form} overview={welcome} disabled={offWelcome} />
          ))}
        </fieldset>
      </section>

      <SaveBar form={form} label="Save automations" disabled={offReminders && offWelcome} />
    </form>
  );
}
