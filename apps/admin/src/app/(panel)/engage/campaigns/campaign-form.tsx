"use client";

import { CalendarClockIcon, Loader2Icon, SendIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { PushPreview } from "@/components/common/push-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CAMPAIGN_BODY_MAX,
  CAMPAIGN_PRESETS,
  CAMPAIGN_TARGETS,
  CAMPAIGN_TITLE_MAX,
  TARGET_LABEL,
  campaignInputError,
  istToIso,
} from "@/lib/automations";
import { TIME_ZONE, formatDateTime } from "@/lib/format";
import type { CampaignTarget } from "@/lib/types";
import { cn } from "@/lib/utils";

import { createCampaign } from "../../actions";

type When = "now" | "schedule";

/** Today's date in India ("2026-10-15"), the first day a campaign can be scheduled. */
function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function Counter({ value, max }: { value: string; max: number }) {
  const n = value.trim().length;
  return <span className={cn("text-xs tabular-nums", n > max ? "text-error" : "text-muted-foreground")}>{`${n}/${max}`}</span>;
}

/** "New campaign": presets that only fill the form, a live notification preview, send now (confirmed) or schedule in IST. */
export function CampaignForm({ isUnavailable = false }: { isUnavailable?: boolean }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState<CampaignTarget>("HOME");
  const [when, setWhen] = useState<When>("now");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [isConfirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  const sendAt = when === "schedule" ? (istToIso(date, time) ?? "invalid") : undefined;
  const error = campaignInputError({ title, body, target, sendAt });
  const hasStarted = title.trim() !== "" || body.trim() !== "";
  const isScheduleIncomplete = when === "schedule" && (!date || !time);

  function reset() {
    setTitle("");
    setBody("");
    setTarget("HOME");
    setWhen("now");
    setDate("");
    setTime("");
  }

  function send() {
    startTransition(async () => {
      const res = await createCampaign({ title, body, target, sendAt });
      if (res.ok) {
        toast.success(res.message);
        setConfirming(false);
        reset();
      } else toast.error(res.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-navy-900">New campaign</CardTitle>
        <CardDescription>One push to every rider. Keep it for festivals and weekends, so riders keep notifications on.</CardDescription>
      </CardHeader>
      <CardContent className="border-t pt-4">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (error) return;
            if (when === "now") setConfirming(true);
            else send();
          }}
          className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]"
        >
          <div className="grid min-w-0 content-start gap-4">
            <div className="grid gap-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Start from</p>
              <div className="flex flex-wrap gap-2">
                {CAMPAIGN_PRESETS.map((p) => (
                  <Button
                    key={p.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTitle(p.title);
                      setBody(p.body);
                      setTarget(p.target);
                    }}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="campaign-title">Title</Label>
                <Counter value={title} max={CAMPAIGN_TITLE_MAX} />
              </div>
              <Input
                id="campaign-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={CAMPAIGN_TITLE_MAX}
                placeholder="e.g. Weekend plans?"
              />
            </div>

            <div className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="campaign-body">Message</Label>
                <Counter value={body} max={CAMPAIGN_BODY_MAX} />
              </div>
              <Textarea
                id="campaign-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={CAMPAIGN_BODY_MAX}
                rows={3}
                placeholder="What riders read under the title"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Opens</Label>
                <Select value={target} onValueChange={(v) => setTarget(v as CampaignTarget)}>
                  <SelectTrigger className="w-full" aria-label="Screen it opens">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAMPAIGN_TARGETS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TARGET_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label id="campaign-when">Send</Label>
                <div role="radiogroup" aria-labelledby="campaign-when" className="grid h-9 grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
                  {(["now", "schedule"] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      role="radio"
                      aria-checked={when === w}
                      onClick={() => {
                        setWhen(w);
                        if (w === "schedule" && !date) setDate(todayInIndia());
                      }}
                      className={cn(
                        "rounded-md font-medium text-navy-700 transition-colors hover:text-navy-900",
                        when === w && "bg-card text-navy-900 shadow-sm",
                      )}
                    >
                      {w === "now" ? "Now" : "Schedule"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {when === "schedule" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="campaign-date">Date</Label>
                  <Input id="campaign-date" type="date" value={date} min={todayInIndia()} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="campaign-time">Time (IST)</Label>
                  <Input id="campaign-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <div className="grid content-start gap-3 rounded-xl bg-muted/30 p-4 ring-1 ring-foreground/5">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Preview</p>
            <PushPreview title={title} body={body} />
            <dl className="grid gap-1 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Opens</dt>
                <dd className="font-medium text-navy-900">{TARGET_LABEL[target]}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Goes to</dt>
                <dd className="font-medium text-navy-900">Every rider</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Sends</dt>
                <dd className="text-right font-medium text-navy-900">
                  {when === "now" ? "Right away" : sendAt && sendAt !== "invalid" ? formatDateTime(sendAt) : "Pick a date and time"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between lg:col-span-2">
            <p className={cn("text-sm", !isUnavailable && hasStarted && error && !isScheduleIncomplete ? "text-error" : "text-muted-foreground")} aria-live="polite">
              {isUnavailable
                ? "Sending arrives with the next API update."
                : !hasStarted
                  ? "Pick a quick start or write your own."
                  : isScheduleIncomplete
                    ? "Pick a date and time (India time)."
                    : (error ?? "Ready.")}
            </p>
            <div className="flex gap-2">
              {hasStarted && (
                <Button type="button" variant="ghost" onClick={reset} disabled={isPending}>
                  Clear
                </Button>
              )}
              <Button type="submit" disabled={isUnavailable || !!error || isPending}>
                {isPending ? <Loader2Icon className="animate-spin" /> : when === "now" ? <SendIcon /> : <CalendarClockIcon />}
                {when === "now" ? "Send now" : "Schedule"}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>

      <Dialog open={isConfirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send to every rider now?</DialogTitle>
            <DialogDescription>This goes to every rider now and can&apos;t be taken back.</DialogDescription>
          </DialogHeader>
          <PushPreview title={title} body={body} />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Not yet</Button>
            </DialogClose>
            <Button onClick={send} disabled={isPending}>
              {isPending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Send now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
