import { CalendarCheckIcon, ClipboardCheckIcon, ExternalLinkIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LinkTabs } from "@/components/common/link-tabs";
import { ListFilters } from "@/components/common/list-filters";
import { EmptyState, PageHeader } from "@/components/common/page";
import { Pager } from "@/components/common/pager";
import { ExpiryNote, PlateBadge, StatusBadge } from "@/components/common/status";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminApi, docFileHref } from "@/lib/api";
import { displayName, docLabel, formatCount, formatDateTime, formatPhone, vehicleLabel } from "@/lib/format";
import { param, pageSizeParam, parsePage, parsePageSize, withQuery } from "@/lib/paging";
import { KYC_STATUSES, type KycStatus } from "@/lib/types";

import { DocumentActions } from "../drivers/[id]/driver-actions";

export const metadata: Metadata = { title: "Documents" };

/** The statuses, plus EXPIRING: verified documents valid for 30 days or fewer (soonest first). */
type Tab = KycStatus | "EXPIRING";
const TABS: readonly Tab[] = ["UNDER_REVIEW", "EXPIRING", "REJECTED", "NOT_UPLOADED", "VERIFIED"];
const TAB_LABEL: Record<Tab, string> = {
  UNDER_REVIEW: "Waiting for review",
  EXPIRING: "Expiring soon",
  REJECTED: "Rejected",
  NOT_UPLOADED: "Not uploaded",
  VERIFIED: "Verified",
};

export default async function KycPage({ searchParams }: PageProps<"/kyc">) {
  const sp = await searchParams;
  const requested = param(sp.status) as Tab | undefined;
  const status: Tab = requested && (requested === "EXPIRING" || KYC_STATUSES.includes(requested)) ? requested : "UNDER_REVIEW";
  const page = parsePage(sp.page);
  const pageSize = parsePageSize(sp.pageSize);
  const q = param(sp.q);
  const [data, pending, expiring] = await Promise.all([
    adminApi.kyc({ status, q, page, pageSize }),
    status === "UNDER_REVIEW" ? null : adminApi.kyc({ status: "UNDER_REVIEW", pageSize: 1 }),
    status === "EXPIRING" ? null : adminApi.kyc({ status: "EXPIRING", pageSize: 1 }).catch(() => null),
  ]);
  const pendingTotal = pending?.total ?? data.total;
  const expiringTotal = status === "EXPIRING" ? data.total : (expiring?.total ?? 0);

  return (
    <>
      <PageHeader
        title="Documents"
        description="Driver documents (RC and insurance), oldest first. Both verified plus a passed identity check approves the driver (or makes them ready to approve when auto-approval is off); one rejection marks them rejected. A document past its valid-until date is rejected by itself."
      />
      <LinkTabs
        active={status}
        tabs={TABS.map((s) => ({
          value: s,
          label: TAB_LABEL[s],
          href: withQuery("/kyc", { status: s === "UNDER_REVIEW" ? undefined : s, q, pageSize: pageSizeParam(pageSize) }),
          count:
            s === "UNDER_REVIEW" && pendingTotal > 0 ? (
              <span className="rounded-full bg-coral-600 px-1.5 text-[11px] font-semibold text-white">{formatCount(pendingTotal)}</span>
            ) : s === "EXPIRING" && expiringTotal > 0 ? (
              <span className="rounded-full bg-warning-tint px-1.5 text-[11px] font-semibold text-warning-text">{formatCount(expiringTotal)}</span>
            ) : undefined,
        }))}
      />
      <ListFilters searchPlaceholder="Driver name, phone or plate" />
      <Card className="gap-0 py-0">
        {data.items.length === 0 ? (
          <EmptyState
            icon={status === "EXPIRING" ? CalendarCheckIcon : ClipboardCheckIcon}
            title={
              q ? "No documents match" : status === "UNDER_REVIEW" ? "Queue is empty" : status === "EXPIRING" ? "Nothing expiring soon" : `No ${TAB_LABEL[status].toLowerCase()} documents`
            }
            description={
              status === "UNDER_REVIEW"
                ? "New uploads from the Tamil Taxi Driver app land here for review."
                : status === "EXPIRING"
                  ? "Verified RC and insurance valid for 30 more days or fewer show here, soonest first. Add the date when you verify a document."
                  : "Nothing in this list right now."
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Driver</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="pr-4 text-right">Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="pl-4">
                    <Link href={`/drivers/${doc.driverId}`} className="font-medium text-navy-900 hover:text-coral-600">
                      {displayName(doc.driver.user)}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{formatPhone(doc.driver.user.phone)}</span>
                    {doc.driver.user.identityStatus && (
                      <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        Identity <StatusBadge status={doc.driver.user.identityStatus} />
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">{vehicleLabel(doc.driver.vehicleKind)}</span>
                      <PlateBadge plate={doc.driver.plate} />
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-2 font-medium text-navy-900">
                      {docLabel(doc.type)} <StatusBadge status={doc.status} />
                    </span>
                    {doc.fileUrl && (
                      <a
                        href={docFileHref(doc.fileUrl)}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-0.5 inline-flex items-center gap-0.5 text-xs text-coral-600 hover:underline"
                      >
                        View file <ExternalLinkIcon className="size-3" />
                      </a>
                    )}
                    {doc.status === "REJECTED" && doc.rejectReason && (
                      <span className="mt-0.5 block text-xs text-error">Reason: {doc.rejectReason}</span>
                    )}
                    {doc.status === "VERIFIED" && <ExpiryNote expiresOn={doc.expiresOn} className="mt-0.5 flex" />}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-navy-700">{formatDateTime(doc.updatedAt)}</TableCell>
                  <TableCell className="pr-4">
                    <div className="flex justify-end">
                      <DocumentActions driverId={doc.driverId} type={doc.type} label={docLabel(doc.type)} status={doc.status} expiresOn={doc.expiresOn} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pager
          path="/kyc"
          query={{ status: status === "UNDER_REVIEW" ? undefined : status, q, pageSize: pageSizeParam(pageSize) }}
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          noun={`${TAB_LABEL[status].toLowerCase()} documents`}
          canResize
        />
      </Card>
    </>
  );
}
