import { CalendarClockIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { expiryInfo, humanize } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "error" | "brand" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  success: "bg-success-tint text-success-text",
  warning: "bg-warning-tint text-warning-text",
  error: "bg-error-tint text-error",
  brand: "bg-coral-50 text-coral-700",
  neutral: "bg-info-tint text-navy-700",
};

const TONES: Record<string, Tone> = {
  // Driver
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "error",
  ON_HOLD: "neutral",
  // KYC
  NOT_UPLOADED: "neutral",
  UNDER_REVIEW: "warning",
  VERIFIED: "success",
  // Identity check (drivers)
  NOT_STARTED: "neutral",
  IN_REVIEW: "warning",
  DECLINED: "error",
  // Trip
  SCHEDULED: "neutral",
  SEARCHING: "brand",
  NO_DRIVERS: "warning",
  DRIVER_ASSIGNED: "brand",
  DRIVER_ARRIVED: "brand",
  IN_PROGRESS: "brand",
  PICKED_UP: "brand",
  COMPLETED: "success",
  DELIVERED: "success",
  CANCELLED: "error",
  // Subscription
  TRIAL: "brand",
  ACTIVE: "success",
  GRACE: "warning",
  EXPIRED: "error",
  PAUSED: "neutral",
  // Ticket
  OPEN: "warning",
  RESOLVED: "success",
  // SOS (OPEN / RESOLVED as tickets)
  ACKNOWLEDGED: "brand",
  FALSE_ALARM: "neutral",
  // Payment
  PAID: "success",
  FAILED: "error",
  REFUNDED: "neutral",
};

/** Coloured pill for any API status enum (driver, KYC, trip, plan, ticket, payment). */
export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  const tone = TONES[status] ?? "neutral";
  return (
    <Badge variant="secondary" className={cn("rounded-full font-medium", TONE_CLASS[tone], className)}>
      {label ?? humanize(status)}
    </Badge>
  );
}

/** "Valid until 12 Dec 2026 · 5 days left" under a document: amber within 30 days, red once expired. */
export function ExpiryNote({ expiresOn, className }: { expiresOn: string | null | undefined; className?: string }) {
  const info = expiryInfo(expiresOn);
  if (!info) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        info.tone === "expired" ? "font-medium text-error" : info.tone === "soon" ? "font-medium text-warning-text" : "text-muted-foreground",
        className,
      )}
    >
      <CalendarClockIcon className="size-3 shrink-0" aria-hidden /> {info.label}
    </span>
  );
}

/** Indian number plate look: white plate, dark border, monospace-ish letters. */
export function PlateBadge({ plate, className }: { plate: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[4px] border-[1.5px] border-navy-900 bg-white px-1.5 py-px font-mono text-[11px] font-semibold tracking-wider whitespace-nowrap text-navy-900 uppercase shadow-[inset_0_0_0_1px_#fff]",
        className,
      )}
    >
      <span className="mr-1 rounded-[2px] bg-[#1d4ed8] px-0.5 text-[8px] leading-tight text-white">IND</span>
      {plate}
    </span>
  );
}

export function OnlineDot({ isOnline, withLabel = false }: { isOnline: boolean; withLabel?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        aria-hidden
        className={cn("size-2 rounded-full", isOnline ? "bg-success ring-3 ring-success/20" : "bg-navy-300")}
      />
      {withLabel ? (isOnline ? "Online" : "Offline") : <span className="sr-only">{isOnline ? "Online" : "Offline"}</span>}
    </span>
  );
}

/** "3/5" with a small bar. */
export function KycProgress({ verified, total }: { verified: number; total: number }) {
  const pct = Math.round((verified / total) * 100);
  return (
    <span className="inline-flex items-center gap-2" title={`${verified} of ${total} documents verified`}>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <span
          className={cn("block h-full rounded-full", verified === total ? "bg-success" : "bg-coral-500")}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="text-xs tabular-nums text-navy-700">
        {verified}/{total}
      </span>
    </span>
  );
}
