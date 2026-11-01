"use client";

import { CalendarClockIcon, CheckIcon, Loader2Icon, PauseIcon, PlayIcon, XIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { istDayKey } from "@/lib/format";
import type { DriverStatus, KycDocType, KycStatus } from "@/lib/types";

import { reviewDocument, reviewPhoto, setDriverStatus, type ActionResult } from "../../actions";

function notify(res: ActionResult): boolean {
  if (res.ok) toast.success(res.message);
  else toast.error(res.error);
  return res.ok;
}

/** What the confirmation says for each decision. */
const DECISION: Record<"ON_HOLD" | "REJECTED", { title: string; description: string; button: string; placeholder: string; isReasonRequired: boolean }> = {
  ON_HOLD: {
    title: "Put {name} on hold?",
    description: "The driver is taken offline and can't receive rides until you reactivate the account. They get a push with your reason.",
    button: "Put on hold",
    placeholder: "e.g. Insurance expired, please upload the new policy",
    isReasonRequired: false,
  },
  REJECTED: {
    title: "Reject {name}?",
    description: "The driver can't go online. They get a push with your reason; re-uploading a document puts them back in the queue.",
    button: "Reject driver",
    placeholder: "e.g. Vehicle doesn't match the RC",
    isReasonRequired: true,
  },
};

/**
 * Approve / Reject / Put on hold / Reactivate → PATCH /admin/drivers/:id. Approving (or reactivating a held or
 * rejected driver) when some checks aren't done asks first and lists what is missing; hold and reject take a reason
 * that is pushed to the driver.
 */
export function DriverStatusActions({
  driverId,
  status,
  name,
  missing,
}: {
  driverId: string;
  status: DriverStatus;
  name: string;
  /** "RC not uploaded · Identity in review" when some checks aren't done (empty = ready). */
  missing?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [pendingTarget, setPendingTarget] = useState<DriverStatus | null>(null);
  const [decision, setDecision] = useState<"ON_HOLD" | "REJECTED" | null>(null);
  const [isOverrideOpen, setOverrideOpen] = useState(false);
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const d = decision ? DECISION[decision] : null;
  const isReasonValid = trimmed.length === 0 ? !d?.isReasonRequired : trimmed.length >= 3 && trimmed.length <= 200;
  const verb = status === "PENDING" ? "Approve" : "Reactivate";
  /** Approve / Reactivate: straight away when every check is done, else after "… anyway?". */
  const approve = () => (missing ? setOverrideOpen(true) : change("APPROVED"));

  function change(target: DriverStatus, after?: () => void) {
    setPendingTarget(target);
    startTransition(async () => {
      if (notify(await setDriverStatus(driverId, target, target === "ON_HOLD" || target === "REJECTED" ? trimmed : undefined))) {
        setReason("");
        after?.();
      }
      setPendingTarget(null);
    });
  }

  const spinner = (t: DriverStatus) => (isPending && pendingTarget === t ? <Loader2Icon className="animate-spin" /> : null);

  return (
    <>
      {status === "PENDING" && (
        <Button onClick={approve} disabled={isPending}>
          {spinner("APPROVED") ?? <CheckIcon />} Approve
        </Button>
      )}
      {(status === "ON_HOLD" || status === "REJECTED") && (
        <Button onClick={approve} disabled={isPending}>
          {spinner("APPROVED") ?? <PlayIcon />} Reactivate
        </Button>
      )}
      {(status === "APPROVED" || status === "PENDING") && (
        <Button variant="outline" onClick={() => setDecision("ON_HOLD")} disabled={isPending}>
          <PauseIcon /> Put on hold
        </Button>
      )}
      {status === "PENDING" && (
        <Button variant="outline" className="border-error/30 text-error hover:bg-error-tint hover:text-error" onClick={() => setDecision("REJECTED")} disabled={isPending}>
          <XIcon /> Reject
        </Button>
      )}

      <Dialog open={isOverrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {verb} {name} anyway?
            </DialogTitle>
            <DialogDescription>Not every check is done: {missing}. The driver can go online as soon as you approve.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button disabled={isPending} onClick={() => change("APPROVED", () => setOverrideOpen(false))}>
              {spinner("APPROVED") ?? (status === "PENDING" ? <CheckIcon /> : <PlayIcon />)} {verb} anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={decision !== null} onOpenChange={(open) => !open && setDecision(null)}>
        <DialogContent>
          {d && decision && (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (isReasonValid) change(decision, () => setDecision(null));
              }}
            >
              <DialogHeader>
                <DialogTitle>{d.title.replace("{name}", name)}</DialogTitle>
                <DialogDescription>{d.description}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor="status-reason">Reason{d.isReasonRequired ? "" : " (optional)"}</Label>
                <Textarea
                  id="status-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={d.placeholder}
                  maxLength={200}
                  rows={3}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  {trimmed.length}/200{d.isReasonRequired ? " · at least 3 characters" : ""}
                </p>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" variant="destructive" disabled={!isReasonValid || isPending}>
                  {spinner(decision) ?? (decision === "ON_HOLD" ? <PauseIcon /> : <XIcon />)} {d.button}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Verify (with the valid-until date) / Reject (with reason) one KYC document → POST /admin/drivers/:id/documents/:type.
 * A verified document offers "Change date" instead of Verify.
 */
export function DocumentActions({
  driverId,
  type,
  label,
  status,
  expiresOn,
}: {
  driverId: string;
  type: KycDocType;
  label: string;
  status: KycStatus;
  expiresOn?: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [action, setAction] = useState<"VERIFIED" | "REJECTED" | null>(null);
  const [isVerifyOpen, setVerifyOpen] = useState(false);
  const [isRejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(expiresOn?.slice(0, 10) ?? "");
  const isReasonValid = reason.trim().length >= 3 && reason.trim().length <= 200;
  const today = istDayKey();
  const isDateValid = date === "" || date >= today;
  // Nothing to check until the driver uploads it.
  const isMissing = status === "NOT_UPLOADED";
  const isVerified = status === "VERIFIED";

  /** Opens the date dialog on the stored date (it may have changed since the last open). */
  function openVerify() {
    setDate(expiresOn?.slice(0, 10) ?? "");
    setVerifyOpen(true);
  }

  function review(next: "VERIFIED" | "REJECTED") {
    setAction(next);
    startTransition(async () => {
      const ok = notify(await reviewDocument(driverId, type, next, next === "REJECTED" ? reason : undefined, next === "VERIFIED" ? date : undefined));
      if (ok && next === "REJECTED") {
        setRejectOpen(false);
        setReason("");
      }
      if (ok && next === "VERIFIED") setVerifyOpen(false);
      setAction(null);
    });
  }

  return (
    <div className="flex shrink-0 gap-2">
      {isVerified ? (
        <Button size="sm" variant="outline" disabled={isPending} onClick={() => openVerify()}>
          <CalendarClockIcon /> {expiresOn ? "Change date" : "Add date"}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="border-success/30 text-success-text hover:bg-success-tint hover:text-success-text"
          disabled={isPending || isMissing}
          onClick={() => openVerify()}
        >
          <CheckIcon /> Verify
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        className="border-error/30 text-error hover:bg-error-tint hover:text-error"
        disabled={isPending || isMissing || status === "REJECTED"}
        onClick={() => setRejectOpen(true)}
      >
        <XIcon /> Reject
      </Button>

      <Dialog open={isVerifyOpen} onOpenChange={setVerifyOpen}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isDateValid) review("VERIFIED");
            }}
            className="grid gap-4"
          >
            <DialogHeader>
              <DialogTitle>{isVerified ? `${label}: valid until` : `Verify ${label}?`}</DialogTitle>
              <DialogDescription>
                Enter the date printed on the {label.toLowerCase()}. The driver is reminded 30 and 7 days before; the day
                after, the document is rejected and they have to upload the renewed one before going online again.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor={`expires-${type}`}>Valid until</Label>
              <Input id={`expires-${type}`} type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} className="w-48" />
              <p className={isDateValid ? "text-xs text-muted-foreground" : "text-xs text-error"}>
                {isDateValid ? "Leave it empty if the document has no end date." : "That date has passed: reject the document instead."}
              </p>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={!isDateValid || isPending}>
                {isPending && action === "VERIFIED" ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} {isVerified ? "Save date" : "Verify document"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isRejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isReasonValid) review("REJECTED");
            }}
            className="grid gap-4"
          >
            <DialogHeader>
              <DialogTitle>Reject {label}?</DialogTitle>
              <DialogDescription>
                The driver sees this reason in the app and can upload the document again. Rejecting any document marks the
                driver as rejected.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor={`reason-${type}`}>Reason</Label>
              <Textarea
                id={`reason-${type}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Photo is blurred, please upload a clearer image"
                maxLength={200}
                rows={3}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">{reason.trim().length}/200 · at least 3 characters</p>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" variant="destructive" disabled={!isReasonValid || isPending}>
                {isPending && action === "REJECTED" ? <Loader2Icon className="animate-spin" /> : <XIcon />} Reject document
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Approve / reject a profile photo waiting for review (low face-match score) → POST /admin/drivers/:id/photo. */
export function PhotoReviewActions({ driverId }: { driverId: string }) {
  const [isPending, startTransition] = useTransition();
  const [action, setAction] = useState<"APPROVE" | "REJECT" | null>(null);
  const [isRejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const isReasonValid = reason.trim().length >= 3 && reason.trim().length <= 200;

  function review(isApproved: boolean) {
    setAction(isApproved ? "APPROVE" : "REJECT");
    startTransition(async () => {
      const ok = notify(await reviewPhoto(driverId, isApproved, isApproved ? undefined : reason));
      if (ok && !isApproved) {
        setRejectOpen(false);
        setReason("");
      }
      setAction(null);
    });
  }

  return (
    <div className="flex shrink-0 gap-2">
      <Button
        size="sm"
        variant="outline"
        className="border-success/30 text-success-text hover:bg-success-tint hover:text-success-text"
        disabled={isPending}
        onClick={() => review(true)}
      >
        {isPending && action === "APPROVE" ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Approve photo
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="border-error/30 text-error hover:bg-error-tint hover:text-error"
        disabled={isPending}
        onClick={() => setRejectOpen(true)}
      >
        <XIcon /> Reject
      </Button>

      <Dialog open={isRejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isReasonValid) review(false);
            }}
            className="grid gap-4"
          >
            <DialogHeader>
              <DialogTitle>Reject this photo?</DialogTitle>
              <DialogDescription>The driver sees this reason in the app and takes a new photo.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="photo-reason">Reason</Label>
              <Textarea
                id="photo-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Face is not clearly visible, please retake in good light"
                maxLength={200}
                rows={3}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">{reason.trim().length}/200 · at least 3 characters</p>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" variant="destructive" disabled={!isReasonValid || isPending}>
                {isPending && action === "REJECT" ? <Loader2Icon className="animate-spin" /> : <XIcon />} Reject photo
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
