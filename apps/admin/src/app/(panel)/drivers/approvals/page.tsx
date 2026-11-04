import { UserCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LinkTabs } from "@/components/common/link-tabs";
import { ListFilters } from "@/components/common/list-filters";
import { EmptyState, PageHeader } from "@/components/common/page";
import { Pager } from "@/components/common/pager";
import { Card } from "@/components/ui/card";
import { adminApi } from "@/lib/api";
import { formatAgo, formatCount } from "@/lib/format";
import { DEFAULT_PAGE_SIZE, param, parsePage, withQuery } from "@/lib/paging";
import { APPROVAL_STAGES, type ApprovalStage } from "@/lib/types";

import { ApprovalList } from "./approval-list";
import { AutoApproveSwitch } from "./auto-approve-switch";

export const metadata: Metadata = { title: "Approvals" };

const STAGES: Record<ApprovalStage, { label: string; about: string; none: string }> = {
  ready: {
    label: "Ready to approve",
    about: "Every check is done for these drivers. Approve them one by one or select several.",
    none: "No driver is waiting for your approval.",
  },
  documents: {
    label: "Documents to review",
    about: "Licence, Aadhaar, RC and insurance uploads (and new profile photos) waiting for you. Review opens each one large, with the driver's photo beside the licence and Aadhaar; the driver is told only about a rejection or once everything is approved.",
    none: "No uploads are waiting for review.",
  },
  identity: {
    label: "Waiting for the photo",
    about: "The licence and Aadhaar are verified; the profile photo, the face that completes the identity check, is still to approve or to be taken by the driver.",
    none: "No identity check is waiting for a photo.",
  },
  driver: {
    label: "Waiting on driver",
    about: "Uploads not done, rejected documents to redo or an identity check not finished.",
    none: "Nobody is stuck halfway through sign-up.",
  },
  photos: {
    label: "Photos to review",
    about: "New profile photos: each one needs your approval before riders see it. It is also the face for the identity check.",
    none: "No photos are waiting for review.",
  },
};

export default async function ApprovalsPage({ searchParams }: PageProps<"/drivers/approvals">) {
  const sp = await searchParams;
  const requested = param(sp.stage) as ApprovalStage | undefined;
  const q = param(sp.q);
  const page = parsePage(sp.page);
  let data = await adminApi.approvals({ q, page, pageSize: DEFAULT_PAGE_SIZE, stage: requested && APPROVAL_STAGES.includes(requested) ? requested : "ready" });
  // With auto-approval on "Ready" is normally empty, so open on the uploads waiting for review instead.
  if (!requested && data.autoApprove && data.counts.ready === 0 && data.counts.documents > 0) {
    data = await adminApi.approvals({ q, page, pageSize: DEFAULT_PAGE_SIZE, stage: "documents" });
  }
  const stage = data.stage;
  const stages = APPROVAL_STAGES.filter((s) => s !== "identity" || data.identityRequired);
  const now = new Date();
  const waiting = Object.fromEntries(data.items.map((d) => [d.id, formatAgo(d.updatedAt, now)]));

  return (
    <>
      <PageHeader
        title="Approvals"
        description={
          data.autoApprove
            ? "Drivers on their way in. Auto-approval is on: a driver is approved as soon as RC, insurance and the identity check pass."
            : "Manual approval is on: drivers who pass every check wait in Ready to approve until you approve them."
        }
        actions={<AutoApproveSwitch isOn={data.autoApprove} />}
      />
      <LinkTabs
        active={stage}
        tabs={stages.map((s) => ({
          value: s,
          label: STAGES[s].label,
          href: withQuery("/drivers/approvals", { stage: s, q }),
          count:
            data.counts[s] > 0 ? (
              <span
                className={
                  s === "ready" || s === "documents" || s === "photos"
                    ? "rounded-full bg-coral-600 px-1.5 text-[11px] font-semibold text-white tabular-nums"
                    : "rounded-full bg-card px-1.5 text-[11px] font-semibold text-navy-700 tabular-nums"
                }
              >
                {formatCount(data.counts[s])}
              </span>
            ) : undefined,
        }))}
      />
      <ListFilters searchPlaceholder="Name, phone or plate" />
      <Card className="gap-0 py-0">
        {data.items.length === 0 ? (
          <EmptyState
            icon={UserCheckIcon}
            title={q ? "No drivers match" : "All caught up"}
            description={q ? "Try another name, phone number or plate." : STAGES[stage].none}
            action={
              stage === "ready" && data.autoApprove && !q ? (
                <p className="text-xs text-muted-foreground">Auto-approval is on, so ready drivers don&apos;t wait here.</p>
              ) : undefined
            }
          />
        ) : (
          <>
            <p className="border-b px-4 py-2.5 text-xs text-muted-foreground">{STAGES[stage].about}</p>
            <ApprovalList stage={stage} items={data.items} waiting={waiting} />
          </>
        )}
        <Pager path="/drivers/approvals" query={{ stage, q }} page={data.page} pageSize={data.pageSize} total={data.total} noun="drivers" />
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">
        Rejected drivers are in{" "}
        <Link href="/drivers?status=REJECTED" className="text-coral-600 hover:underline">
          All drivers › Rejected
        </Link>
        . Each decision is kept in the audit log.
      </p>
    </>
  );
}
