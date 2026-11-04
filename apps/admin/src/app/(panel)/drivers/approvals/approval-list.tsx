"use client";

import { CheckIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ApprovalChecks, missingChecks } from "@/components/common/approval-checks";
import { PlateBadge, StatusBadge } from "@/components/common/status";
import { DocumentReviewer } from "@/components/people/document-reviewer";
import { MessageButton } from "@/components/people/message-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { docFileHref } from "@/lib/files";
import { displayName, docLabel, formatPhone, initials, vehicleLabel } from "@/lib/format";
import type { ApprovalItem, ApprovalStage } from "@/lib/types";
import { cn } from "@/lib/utils";

import { approveDrivers, setDriverStatus } from "../../actions";
import { PhotoReviewActions } from "../[id]/driver-actions";

/**
 * The Approvals queue rows. Each stage shows the action that moves the driver on: approve (ready), verify or reject
 * the uploads (documents), the profile photo that completes the identity check (identity: review it, or remind the
 * driver to take it), what is missing (driver), the photo review (photos).
 * Ready drivers can be selected and approved together.
 */
export function ApprovalList({ stage, items, waiting }: { stage: ApprovalStage; items: readonly ApprovalItem[]; waiting: Record<string, string> }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const isSelectable = stage === "ready";
  const visibleSelected = items.filter((d) => selected.has(d.id)).map((d) => d.id);
  const isAllSelected = items.length > 0 && visibleSelected.length === items.length;

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function approveOne(id: string) {
    setBusyId(id);
    startTransition(async () => {
      const res = await setDriverStatus(id, "APPROVED");
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
      setBusyId(null);
    });
  }

  function approveSelected() {
    startTransition(async () => {
      const res = await approveDrivers(visibleSelected);
      if (res.ok) {
        toast.success(res.message);
        setSelected(new Set());
      } else toast.error(res.error);
    });
  }

  return (
    <>
      {isSelectable && (
        <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-coral-600"
            checked={isAllSelected}
            onChange={() => setSelected(isAllSelected ? new Set() : new Set(items.map((d) => d.id)))}
            aria-label="Select all on this page"
          />
          <span className="text-muted-foreground">{visibleSelected.length ? `${visibleSelected.length} selected` : "Select drivers to approve them together"}</span>
          {visibleSelected.length > 0 && (
            <span className="ml-auto flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={isPending}>
                Clear
              </Button>
              <Button size="sm" onClick={approveSelected} disabled={isPending}>
                {isPending && busyId === null ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Approve {visibleSelected.length}
              </Button>
            </span>
          )}
        </div>
      )}
      <ul className="divide-y">
        {items.map((d) => (
          <li key={d.id} className={cn("flex flex-col gap-3 px-4 py-3.5 lg:flex-row lg:items-center", selected.has(d.id) && "bg-coral-50/50")}>
            <div className="flex min-w-0 flex-1 items-start gap-3">
              {isSelectable && (
                <input
                  type="checkbox"
                  className="mt-2.5 size-4 shrink-0 accent-coral-600"
                  checked={selected.has(d.id)}
                  onChange={() => toggle(d.id)}
                  aria-label={`Select ${displayName(d.user)}`}
                />
              )}
              <Avatar className="size-10">
                {d.photoFile && <AvatarImage src={docFileHref(d.photoFile)} alt="" className="object-cover" />}
                <AvatarFallback className="bg-coral-50 text-xs font-semibold text-coral-600">{initials(d.user.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2">
                  <Link href={`/drivers/${d.id}`} className="font-medium text-navy-900 hover:text-coral-600">
                    {displayName(d.user)}
                  </Link>
                  {stage === "photos" && <StatusBadge status={d.status} />}
                </p>
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">{formatPhone(d.user.phone)}</span>·
                  <span>
                    {vehicleLabel(d.vehicleKind)} · {d.vehicleModel}
                  </span>
                  <PlateBadge plate={d.plate} />
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-1 lg:w-72">
              <ApprovalChecks checklist={d.checklist} />
              <p className="text-xs text-muted-foreground">
                {stage === "driver" ? missingChecks(d.checklist) || "Waiting on the driver" : `Waiting ${waiting[d.id] ?? "–"}`}
              </p>
            </div>

            <div className="flex shrink-0 flex-col gap-2 lg:w-[22rem] lg:items-end">
              {stage === "ready" && (
                <Button size="sm" onClick={() => approveOne(d.id)} disabled={isPending}>
                  {isPending && busyId === d.id ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Approve
                </Button>
              )}
              {stage === "documents" && (
                <div className="flex flex-col gap-2 lg:items-end">
                  <p className="text-xs text-muted-foreground lg:text-right">
                    To review:{" "}
                    {[
                      ...d.documents.filter((doc) => doc.status === "UNDER_REVIEW").map((doc) => docLabel(doc.type)),
                      ...(d.pendingPhotoFile ? ["Profile photo"] : []),
                    ].join(", ")}
                  </p>
                  <DocumentReviewer
                    driver={{
                      id: d.id,
                      name: displayName(d.user),
                      phone: d.user.phone,
                      vehicle: `${vehicleLabel(d.vehicleKind)} · ${d.vehicleModel}`,
                      plate: d.plate,
                      photoFile: d.photoFile,
                      pendingPhotoFile: d.pendingPhotoFile,
                    }}
                    docs={d.documents}
                  />
                </div>
              )}
              {(stage === "driver" || (stage === "identity" && !d.pendingPhotoFile)) && (
                <div className="flex gap-2">
                  <MessageButton
                    label="Remind"
                    userId={d.userId}
                    driverId={d.id}
                    name={displayName(d.user)}
                    defaultApp="DRIVER"
                    defaultTitle="Finish your Tamil Taxi sign-up"
                    defaultBody={`Still to do: ${missingChecks(d.checklist) || "your documents"}. Open the app › Account › Documents to finish.`}
                  />
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/drivers/${d.id}`}>Open driver</Link>
                  </Button>
                </div>
              )}
              {(stage === "photos" || stage === "identity") && d.pendingPhotoFile && (
                <div className="flex items-center gap-3">
                  <a href={docFileHref(d.pendingPhotoFile)} target="_blank" rel="noreferrer noopener" title="New photo">
                    {/* eslint-disable-next-line @next/next/no-img-element -- private, token-proxied file */}
                    <img src={docFileHref(d.pendingPhotoFile)} alt="New photo" className="size-14 rounded-lg border object-cover" />
                  </a>
                  <span className="text-xs text-muted-foreground">
                    {d.photoFile ? "Replaces the current photo" : "First photo"}
                  </span>
                  <PhotoReviewActions driverId={d.id} />
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
