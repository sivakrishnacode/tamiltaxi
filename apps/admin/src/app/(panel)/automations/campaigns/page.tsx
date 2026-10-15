import { BanIcon, CalendarClockIcon, MegaphoneIcon, SendIcon, TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState, PageHeader } from "@/components/common/page";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ApiError, adminApi } from "@/lib/api";
import { STATUS_LABEL, TARGET_LABEL } from "@/lib/automations";
import { formatDateTime } from "@/lib/format";
import type { Campaign, CampaignStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

import { CampaignAction } from "./campaign-controls";
import { CampaignForm } from "./campaign-form";

export const metadata: Metadata = { title: "Campaigns" };

const STATUS_STYLE: Record<CampaignStatus, { icon: typeof SendIcon; tile: string; badge: string }> = {
  SCHEDULED: { icon: CalendarClockIcon, tile: "bg-coral-50 text-coral-600", badge: "bg-coral-50 text-coral-700" },
  SENT: { icon: SendIcon, tile: "bg-success-tint text-success-text", badge: "bg-success-tint text-success-text" },
  CANCELLED: { icon: BanIcon, tile: "bg-muted text-muted-foreground", badge: "" },
};

function when(c: Campaign): string {
  if (c.status === "SENT") return `Sent ${formatDateTime(c.sentAt ?? c.sendAt)}`;
  if (c.status === "CANCELLED") return `Cancelled · was due ${formatDateTime(c.sendAt)}`;
  return `Sends ${formatDateTime(c.sendAt)}`;
}

function CampaignRow({ c }: { c: Campaign }) {
  const style = STATUS_STYLE[c.status] ?? STATUS_STYLE.CANCELLED;
  const Icon = style.icon;
  return (
    <Card className="flex-row items-start gap-4 px-4">
      <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg", style.tile)}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-heading font-semibold text-navy-900">
          <span className="min-w-0 break-words">{c.title}</span>
          <Badge variant="secondary" className={style.badge}>
            {STATUS_LABEL[c.status] ?? c.status}
          </Badge>
          <Badge variant="outline">Opens {TARGET_LABEL[c.target] ?? c.target}</Badge>
        </p>
        <p className="mt-1 text-sm break-words text-navy-700">{c.body}</p>
        <p className="mt-1 text-xs text-muted-foreground">{when(c)}</p>
      </div>
      <div className="shrink-0">
        <CampaignAction id={c.id} title={c.title} kind={c.status === "SCHEDULED" ? "cancel" : "delete"} />
      </div>
    </Card>
  );
}

export default async function CampaignsPage() {
  // Campaigns come from a newer API: without it the form still shows, with a note instead of the list.
  const result = await adminApi.campaigns().then(
    (items): { items: Campaign[] } | { error: string; isMissing: boolean } => ({ items }),
    (e: unknown) => {
      if (e instanceof ApiError) return { error: e.message, isMissing: e.status === 404 };
      throw e;
    },
  );
  const items = "items" in result ? result.items : [];
  const scheduled = items.filter((c) => c.status === "SCHEDULED").sort((a, b) => a.sendAt.localeCompare(b.sendAt));
  const past = items
    .filter((c) => c.status !== "SCHEDULED")
    .sort((a, b) => (b.sentAt ?? b.sendAt).localeCompare(a.sentAt ?? a.sendAt));

  return (
    <>
      <PageHeader title="Campaigns" description="Festival and weekend pushes to every rider: send one now or schedule it in India time." />
      <CampaignForm isUnavailable={"isMissing" in result && result.isMissing} />

      <div className="mt-8 grid gap-8">
        {"error" in result ? (
          <Card>
            <EmptyState
              icon={TriangleAlertIcon}
              title={result.isMissing ? "Campaigns aren't available yet" : "Couldn't load campaigns"}
              description={result.isMissing ? "They arrive with the next API update." : `The API said: ${result.error}`}
            />
          </Card>
        ) : items.length === 0 ? (
          <Card>
            <EmptyState icon={MegaphoneIcon} title="No campaigns yet" description="Send one now, or schedule it ahead of a festival or a long weekend." />
          </Card>
        ) : (
          <>
            <section aria-labelledby="scheduled-heading" className="grid gap-3">
              <h2 id="scheduled-heading" className="font-heading text-lg font-semibold text-navy-900">
                Scheduled <span className="text-sm font-normal text-muted-foreground">{scheduled.length}</span>
              </h2>
              {scheduled.length === 0 ? (
                <p className="rounded-xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">Nothing scheduled.</p>
              ) : (
                scheduled.map((c) => <CampaignRow key={c.id} c={c} />)
              )}
            </section>
            {past.length > 0 && (
              <section aria-labelledby="past-heading" className="grid gap-3">
                <h2 id="past-heading" className="font-heading text-lg font-semibold text-navy-900">
                  Sent &amp; cancelled <span className="text-sm font-normal text-muted-foreground">{past.length}</span>
                </h2>
                {past.map((c) => (
                  <CampaignRow key={c.id} c={c} />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
