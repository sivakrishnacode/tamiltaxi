"use client";

import { ChevronRightIcon, type LucideIcon } from "lucide-react";

import type { SettingsDraft } from "@/components/settings/settings-kit";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// Building blocks of Engage › Automations: each automation is a card with its flow (trigger → wait → channel).

export type Channel = "PUSH" | "WHATSAPP";

const CHANNEL: Record<Channel, { label: string; className: string }> = {
  PUSH: { label: "Push", className: "border-coral-100 bg-coral-50 text-coral-700" },
  WHATSAPP: { label: "WhatsApp", className: "border-success/30 bg-success-tint text-success-text" },
};

export function ChannelBadge({ channel }: { channel: Channel }) {
  const c = CHANNEL[channel];
  return (
    <Badge variant="outline" className={c.className}>
      {c.label}
    </Badge>
  );
}

/** One step of a flow: an icon tile and what happens, with an optional inline control. */
export interface FlowStep {
  readonly icon: LucideIcon;
  readonly label: React.ReactNode;
  readonly tone?: "trigger" | "wait" | "send";
}

const TONE = {
  trigger: "bg-muted text-navy-700",
  wait: "bg-muted/60 text-muted-foreground",
  send: "bg-coral-50 text-coral-600",
} as const;

export function FlowStrip({ steps }: { steps: readonly FlowStep[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2" aria-label="How it works">
      {steps.map((s, i) => (
        <li key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />}
          <span className="flex items-center gap-2 rounded-lg border bg-card py-1 pr-2.5 pl-1 text-sm text-navy-700">
            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", TONE[s.tone ?? "trigger"])}>
              <s.icon className="size-3.5" aria-hidden />
            </span>
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A whole-number setting typed inside a flow step ("Wait [5] min"). */
export function InlineNumber({ form, settingKey, label, suffix, width = "w-16" }: { form: SettingsDraft; settingKey: string; label: string; suffix: string; width?: string }) {
  const error = form.errors[settingKey];
  return (
    <span className="inline-flex items-center gap-1.5">
      <Input
        type="number"
        inputMode="numeric"
        step="1"
        value={String(form.draft[settingKey] ?? "")}
        onChange={(e) => form.set(settingKey, e.target.value)}
        aria-label={label}
        aria-invalid={!!error}
        title={error ?? label}
        className={cn("h-7 [appearance:textfield] px-2 text-center tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none", width)}
      />
      {suffix}
    </span>
  );
}

/** An automation: name, channel, on / off, its flow, the body, and its numbers at the bottom. */
export function FlowCard({
  icon: Icon,
  title,
  channel,
  isOn,
  onToggle,
  disabled,
  flow,
  errors,
  children,
  stats,
}: {
  icon: LucideIcon;
  title: string;
  channel: Channel;
  isOn: boolean;
  onToggle: (on: boolean) => void;
  disabled?: boolean;
  flow: readonly FlowStep[];
  /** Problems with the settings typed in the flow. */
  errors?: readonly string[];
  children: React.ReactNode;
  stats: readonly { label: string; value: string; tone?: "error" | "good" }[];
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="grid gap-3 px-4 pt-4 pb-4">
        <div className="flex items-center gap-2.5">
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", isOn ? "bg-coral-600 text-white" : "bg-muted text-muted-foreground")}>
            <Icon className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-heading text-base font-semibold text-navy-900">{title}</h3>
            <p className={cn("text-xs font-medium", isOn ? "text-success-text" : "text-muted-foreground")}>{isOn ? "Running" : "Off"}</p>
          </div>
          <ChannelBadge channel={channel} />
          <Switch checked={isOn} disabled={disabled} onCheckedChange={onToggle} aria-label={`${title}: on or off`} />
        </div>
        <FlowStrip steps={flow} />
        {errors && errors.length > 0 && <p className="text-xs text-error">{errors[0]}</p>}
      </div>
      <div className={cn("grid gap-3 border-t px-4 py-4 transition-opacity", !isOn && "opacity-70")}>{children}</div>
      <dl className="mt-auto grid grid-cols-3 gap-3 border-t bg-muted/30 px-4 py-3">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="truncate text-xs text-muted-foreground">{s.label}</dt>
            <dd className={cn("font-heading text-lg font-semibold tabular-nums", s.tone === "error" && s.value !== "0" ? "text-error" : s.tone === "good" ? "text-success-text" : "text-navy-900")}>
              {s.value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/** A heading for a group of automations. */
export function SectionHeading({ icon: Icon, title, description, aside }: { icon: LucideIcon; title: string; description: string; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-coral-50 text-coral-600">
          <Icon className="size-4" aria-hidden />
        </span>
        <div>
          <h2 className="font-heading text-lg font-semibold text-navy-900">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {aside}
    </div>
  );
}
