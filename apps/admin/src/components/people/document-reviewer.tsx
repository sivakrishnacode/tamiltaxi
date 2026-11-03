"use client";

import { CheckIcon, ExternalLinkIcon, FileSearchIcon, Loader2Icon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { PlateBadge } from "@/components/common/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { docFileHref } from "@/lib/files";
import { docLabel, formatPhone, istDayKey } from "@/lib/format";
import type { KycDocType, KycStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

import { reviewDocument, reviewPhoto } from "@/app/(panel)/actions";

export interface ReviewDriver {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  /** "Scooty · Yamaha FZ". */
  readonly vehicle: string;
  readonly plate: string;
  readonly photoFile: string | null;
  readonly pendingPhotoFile: string | null;
}

export interface ReviewDoc {
  readonly type: KycDocType;
  readonly status: KycStatus;
  readonly fileUrl: string | null;
}

type ItemKey = KycDocType | "PHOTO";
type ItemState = "WAITING" | "VERIFIED" | "REJECTED";

interface Item {
  readonly key: ItemKey;
  readonly label: string;
  readonly file: string;
  readonly state: ItemState;
}

/** Documents with a printed end date: the date is asked (optional) when verifying. */
const DATED: readonly ItemKey[] = ["VEHICLE_RC", "INSURANCE", "DRIVING_LICENCE"];
/** Shown next to these so the face and name can be compared. */
const ID_PROOFS: readonly ItemKey[] = ["DRIVING_LICENCE", "AADHAAR"];

const DOC_REASONS = [
  "Blurry or too dark, please retake it",
  "Cut off: show all 4 corners",
  "Not the right document",
  "This document has expired",
  "The name doesn't match your account",
  "Photo of a screen or a copy: photograph the original",
];
const PHOTO_REASONS = [
  "Face not clear or too dark, please retake it",
  "Take off the cap, mask or dark glasses",
  "Only you should be in the photo",
  "Doesn't match the face on your licence",
];

const isPdf = (file: string) => /\.pdf$/i.test(file);

function stateOf(status: KycStatus): ItemState {
  return status === "VERIFIED" ? "VERIFIED" : status === "REJECTED" ? "REJECTED" : "WAITING";
}

/**
 * Review a driver's uploads in one place: each document large, the driver's photo and name beside the licence and
 * Aadhaar to compare, Verify (with the valid-until date where one is printed) or Reject with a one-tap reason, then
 * on to the next waiting one. The new profile photo is reviewed here too. The driver is told only about a rejection,
 * or when everything is approved.
 */
export function DocumentReviewer({
  driver,
  docs,
  size = "sm",
  label = "Review",
}: {
  driver: ReviewDriver;
  docs: readonly ReviewDoc[];
  size?: "sm" | "default";
  label?: string;
}) {
  const router = useRouter();
  const initial: Item[] = [
    ...docs
      .filter((d) => d.fileUrl && d.status !== "NOT_UPLOADED")
      .map((d) => ({ key: d.type as ItemKey, label: docLabel(d.type), file: d.fileUrl!, state: stateOf(d.status) })),
    ...(driver.pendingPhotoFile ? [{ key: "PHOTO" as const, label: "Profile photo", file: driver.pendingPhotoFile, state: "WAITING" as const }] : []),
  ];
  const waitingCount = initial.filter((i) => i.state === "WAITING").length;

  const [isOpen, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>(initial);
  const [current, setCurrent] = useState<ItemKey | null>(null);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"VERIFY" | "REJECT" | null>(null);

  const item = items.find((i) => i.key === current) ?? null;
  const today = istDayKey();
  const isDateValid = date === "" || date >= today;
  const isReasonValid = reason.trim().length >= 3 && reason.trim().length <= 200;
  const isPhoto = item?.key === "PHOTO";
  const comparePhoto = driver.photoFile ?? driver.pendingPhotoFile;

  function open() {
    setItems(initial);
    const first = initial.find((i) => i.state === "WAITING") ?? initial[0] ?? null;
    pick(first?.key ?? null);
    setOpen(true);
  }

  function pick(key: ItemKey | null) {
    setCurrent(key);
    setDate("");
    setReason("");
  }

  /** Marks [key] done and moves to the next waiting item (after it, then from the top). */
  function advance(key: ItemKey, state: ItemState) {
    const next = items.map((i) => (i.key === key ? { ...i, state } : i));
    setItems(next);
    const at = next.findIndex((i) => i.key === key);
    const after = [...next.slice(at + 1), ...next.slice(0, at)].find((i) => i.state === "WAITING");
    pick(after?.key ?? null);
  }

  function decide(isVerify: boolean) {
    if (!item) return;
    setBusy(isVerify ? "VERIFY" : "REJECT");
    startTransition(async () => {
      const res = isPhoto
        ? await reviewPhoto(driver.id, isVerify, isVerify ? undefined : reason)
        : await reviewDocument(driver.id, item.key as KycDocType, isVerify ? "VERIFIED" : "REJECTED", isVerify ? undefined : reason, isVerify && DATED.includes(item.key) ? date : undefined);
      setBusy(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(isVerify ? `${item.label} ${isPhoto ? "approved" : "verified"}` : `${item.label} rejected: the driver is told why`);
      advance(item.key, isVerify ? "VERIFIED" : "REJECTED");
    });
  }

  if (initial.length === 0) return null;
  const doneCount = items.filter((i) => i.state !== "WAITING").length;
  const leftCount = items.length - doneCount;

  return (
    <>
      <Button size={size} onClick={open}>
        <FileSearchIcon /> {label}
        {waitingCount > 0 && <span className="rounded-full bg-white/20 px-1.5 text-[11px] tabular-nums">{waitingCount}</span>}
      </Button>
      <Dialog
        open={isOpen}
        onOpenChange={(o) => {
          setOpen(o);
          // The lists behind show the new states.
          if (!o) router.refresh();
        }}
      >
        <DialogContent className="flex h-[90vh] max-h-[860px] flex-col gap-0 p-0 sm:max-w-6xl">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle className="flex flex-wrap items-center gap-2">
              Review · {driver.name}
              <PlateBadge plate={driver.plate} />
            </DialogTitle>
            <DialogDescription>
              {formatPhone(driver.phone)} · {driver.vehicle} ·{" "}
              {leftCount === 0 ? "everything reviewed" : `${leftCount} of ${items.length} still to review`}. The driver is told only about a rejection, or once everything is approved.
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_320px]">
            {/* The document, as large as it fits. */}
            <div className="relative flex min-h-[280px] items-center justify-center bg-navy-900/95 p-3">
              {item ? (
                isPdf(item.file) ? (
                  <iframe src={docFileHref(item.file)} title={item.label} className="h-full w-full rounded-md bg-white" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- private, token-proxied file
                  <img src={docFileHref(item.file)} alt={item.label} className="max-h-full max-w-full rounded-md object-contain" />
                )
              ) : (
                <div className="text-center text-white">
                  <CheckIcon className="mx-auto mb-2 size-10 text-success" aria-hidden />
                  <p className="font-heading text-lg font-semibold">All reviewed</p>
                  <p className="text-sm text-white/70">Close this, or pick an item to look again.</p>
                </div>
              )}
              {item && (
                <a
                  href={docFileHref(item.file)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-navy-900 hover:bg-white"
                >
                  Open full size <ExternalLinkIcon className="size-3" />
                </a>
              )}
            </div>

            <div className="flex min-h-0 flex-col border-t md:border-t-0 md:border-l">
              <ul className="divide-y border-b">
                {items.map((i) => (
                  <li key={i.key}>
                    <button
                      type="button"
                      onClick={() => pick(i.key)}
                      className={cn("flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-muted/60", i.key === current && "bg-coral-50/70")}
                    >
                      <span className="font-medium text-navy-900">{i.label}</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-px text-[11px] font-medium",
                          i.state === "WAITING" && "bg-warning-tint text-warning-text",
                          i.state === "VERIFIED" && "bg-success-tint text-success-text",
                          i.state === "REJECTED" && "bg-error-tint text-error",
                        )}
                      >
                        {i.state === "WAITING" ? "To review" : i.state === "VERIFIED" ? (i.key === "PHOTO" ? "Approved" : "Verified") : "Rejected"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              {item && (
                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
                  {(ID_PROOFS.includes(item.key) || isPhoto) && (
                    <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-2.5">
                      {comparePhoto && !isPhoto ? (
                        // eslint-disable-next-line @next/next/no-img-element -- private, token-proxied file
                        <img src={docFileHref(comparePhoto)} alt="Profile photo" className="size-14 rounded-lg border object-cover" />
                      ) : null}
                      <div className="min-w-0 text-xs text-navy-700">
                        <p>
                          Name on the account: <b className="text-navy-900">{driver.name}</b>
                        </p>
                        <p className="text-muted-foreground">
                          {isPhoto
                            ? "A clear face, alone, no cap or dark glasses; it should match the licence."
                            : comparePhoto
                              ? "Compare the face and the name with the document."
                              : "No profile photo yet: compare the name with the document."}
                        </p>
                      </div>
                    </div>
                  )}

                  {item.state === "WAITING" ? (
                    <>
                      <div className="grid gap-2">
                        {DATED.includes(item.key) && (
                          <div className="grid gap-1.5">
                            <Label htmlFor="review-date">Valid until (optional)</Label>
                            <Input id="review-date" type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} className="w-48" />
                            {!isDateValid && <p className="text-xs text-error">That date has passed: reject it instead.</p>}
                            <p className="text-xs text-muted-foreground">The driver is reminded 30 and 7 days before it ends.</p>
                          </div>
                        )}
                        <Button disabled={isPending || !isDateValid} onClick={() => decide(true)} className="bg-success text-white hover:bg-success/90">
                          {busy === "VERIFY" ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} {isPhoto ? "Approve photo" : "Verify"}
                        </Button>
                      </div>

                      <div className="grid gap-2 border-t pt-4">
                        <Label htmlFor="review-reason">Or reject, with the reason the driver sees</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {(isPhoto ? PHOTO_REASONS : DOC_REASONS).map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setReason(r)}
                              className={cn("rounded-full border px-2.5 py-1 text-xs text-navy-700 hover:border-coral-300 hover:bg-coral-50", reason === r && "border-coral-400 bg-coral-50 text-coral-700")}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                        <Textarea id="review-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} rows={2} placeholder="Or write your own" />
                        <Button variant="destructive" disabled={isPending || !isReasonValid} onClick={() => decide(false)}>
                          {busy === "REJECT" ? <Loader2Icon className="animate-spin" /> : <XIcon />} Reject
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {item.state === "VERIFIED" ? "Done." : "Rejected: the driver uploads it again and it comes back here."} Change it from the driver&apos;s page if needed.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
