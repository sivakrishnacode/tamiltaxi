import { ArrowLeftIcon, EyeOffIcon, HomeIcon, LifeBuoyIcon, NavigationIcon, PackageIcon, ShieldAlertIcon, StarIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Field, PageHeader } from "@/components/common/page";
import { AttachmentThumb, PhotoTile } from "@/components/common/photo-tile";
import { PlateBadge, StatusBadge } from "@/components/common/status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { adminApi } from "@/lib/api";
import { cancelSummary, faultSummary, type CancelFault } from "@/lib/cancel";
import { formatKm } from "@/lib/polyline";
import { isSosActive, safetyEventLine, sosMapUrl, sosSourceLabel } from "@/lib/safety";
import { displayName, formatDateTime, formatInr, formatPhone, humanize, shortId, vehicleLabel } from "@/lib/format";
import type { FareBreakdown, ShiftingInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

import { MarkReviewedButton } from "./review-actions";
import { TripPathMap } from "./trip-path-map";

export async function generateMetadata({ params }: PageProps<"/trips/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: `Trip #${shortId(id)}` };
}

const FARE_LINES: { key: keyof FareBreakdown; label: string }[] = [
  { key: "base", label: "Base fare" },
  { key: "distanceCharge", label: "Distance charge" },
  { key: "timeCharge", label: "Time charge" },
  { key: "minFareTopUp", label: "Minimum fare top-up" },
];

function Timeline({ steps }: { steps: { label: string; at: string | null }[] }) {
  return (
    <ol className="relative space-y-4 pl-6">
      {steps.map((s, i) => (
        <li key={s.label} className="relative">
          <span
            aria-hidden
            className={cn(
              "absolute top-1 -left-6 size-3 rounded-full border-2",
              s.at ? "border-coral-600 bg-coral-600" : "border-navy-300 bg-card",
            )}
          />
          {i < steps.length - 1 && <span aria-hidden className="absolute top-4 -left-[19px] h-[calc(100%+4px)] w-px bg-border" />}
          <p className={cn("text-sm font-medium", s.at ? "text-navy-900" : "text-muted-foreground")}>{s.label}</p>
          <p className="text-xs text-muted-foreground">{s.at ? formatDateTime(s.at) : "Not reached"}</p>
        </li>
      ))}
    </ol>
  );
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "–";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default async function TripPage({ params }: PageProps<"/trips/[id]">) {
  const { id } = await params;
  const t = await adminApi.trip(id);
  const fare = t.fare ?? {};
  const isParcel = t.kind === "PARCEL";
  const isCancelled = t.status === "CANCELLED" || t.status === "NO_DRIVERS";
  const endLabel = t.status === "CANCELLED" ? "Cancelled" : t.status === "NO_DRIVERS" ? "No drivers" : isParcel ? "Delivered" : "Completed";
  const cancellations = t.cancellations ?? [];
  const sos = t.sos ?? [];
  const safetyEvents = t.safetyEvents ?? [];
  const activeSos = sos.filter((x) => isSosActive(x.status));

  return (
    <>
      <Link href="/trips" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Trips
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">#{shortId(t.id)}</span>
            <StatusBadge status={t.status} />
          </span>
        }
        description={[
          t.shifting ? "Packers & Movers" : isParcel ? "Parcel" : "Ride",
          t.rideMode === "RENTAL" ? "rental" : t.rideMode === "OUTSTATION" ? "to another town" : null,
          vehicleLabel(t.vehicleKind),
          `booked ${formatDateTime(t.createdAt)}`,
          t.scheduledAt ? `for ${formatDateTime(t.scheduledAt)}` : null,
          t.paymentMode === "UPI" ? "UPI" : "Cash",
        ]
          .filter(Boolean)
          .join(" · ")}
      />

      {activeSos.length > 0 && (
        <Link
          href="/safety?status=active"
          className="mb-4 flex items-center gap-3 rounded-xl border border-error bg-error-tint px-4 py-3 text-sm font-medium text-error hover:underline"
        >
          <ShieldAlertIcon className="size-5 shrink-0" aria-hidden />
          {activeSos.length === 1 ? "An SOS on this trip is still open" : `${activeSos.length} SOS on this trip are still open`}: open the SOS page
        </Link>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-semibold">Route</CardTitle>
            <CardDescription>
              {t.distanceKm.toFixed(1)} km · about {t.durationMin} min
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <span aria-hidden className="mt-1.5 flex flex-col items-center">
                <span className="size-2.5 rounded-full bg-success" />
                <span className="my-1 h-10 w-px bg-navy-300" />
                <span className="size-2.5 rounded-[3px] bg-coral-600" />
              </span>
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Pickup</p>
                  <p className="text-sm font-medium text-navy-900">{t.pickupName}</p>
                  {t.pickupAddr && <p className="text-xs text-muted-foreground">{t.pickupAddr}</p>}
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {t.pickupLat.toFixed(5)}, {t.pickupLng.toFixed(5)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Drop</p>
                  <p className="text-sm font-medium text-navy-900">{t.dropName}</p>
                  {t.dropAddr && <p className="text-xs text-muted-foreground">{t.dropAddr}</p>}
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {t.dropLat.toFixed(5)}, {t.dropLng.toFixed(5)}
                  </p>
                </div>
              </div>
            </div>
            <Separator />
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="Passenger">
                {t.passenger ? (
                  <Link href={`/users/${t.passenger.id}`} className="hover:text-coral-600 hover:underline">
                    {displayName(t.passenger)}
                  </Link>
                ) : (
                  "–"
                )}
                <span className="block text-xs text-muted-foreground">{formatPhone(t.passenger?.phone)}</span>
                {t.riderName && (
                  <span className="mt-1 block text-xs text-navy-900">
                    Booked for <span className="font-medium">{t.riderName}</span> · {formatPhone(t.riderPhone)}
                    {t.riderIsWoman ? " (woman)" : ""}
                  </span>
                )}
                {t.womenDriver && t.womenDriver !== "NONE" && (
                  <span className="mt-1 inline-block rounded-full bg-pink-50 px-2 py-0.5 text-[11px] font-medium text-pink-700">
                    Pink Taxi · {t.womenDriver === "ONLY" ? "women drivers only" : "women preferred"}
                  </span>
                )}
              </Field>
              <Field label="Driver">
                {t.driver ? (
                  <>
                    <Link href={`/drivers/${t.driver.id}`} className="hover:text-coral-600 hover:underline">
                      {displayName(t.driver.user)}
                    </Link>
                    <span className="mt-1 block">
                      <PlateBadge plate={t.driver.plate} />
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Not assigned</span>
                )}
              </Field>
              <Field label="Trip OTP">
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <EyeOffIcon className="size-3.5" /> Hidden
                </span>
              </Field>
              <Field label="Rating">
                {t.rating ? (
                  <span className="inline-flex items-center gap-1">
                    <StarIcon className="size-3.5 fill-warning text-warning" /> {t.rating}/5
                  </span>
                ) : (
                  "–"
                )}
              </Field>
            </dl>
            {t.needsReview && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warning-tint px-3 py-2 text-sm text-warning-text">
                <p>
                  Needs review: {t.reviewNote ?? "flagged by a trip timeout"}.
                  {!t.endedAt && " The driver was asked to end the trip; it is never completed automatically."}
                </p>
                <MarkReviewedButton tripId={t.id} />
              </div>
            )}
            {!t.needsReview && t.reviewNote && (
              <p className="rounded-lg bg-muted px-3 py-2 text-sm text-navy-700">Review: {t.reviewNote}</p>
            )}
            {(t.reassignCount ?? 0) > 0 && (
              <p className="rounded-lg bg-muted px-3 py-2 text-sm text-navy-700">
                Sent back to search for another driver {t.reassignCount} time{t.reassignCount === 1 ? "" : "s"} (see Cancellations).
              </p>
            )}
            {t.arrivedFarReason && (
              <p className="rounded-lg bg-warning-tint px-3 py-2 text-sm text-warning-text">
                Marked arrived {formatMetres(t.arrivedDistanceM)} from the pickup: {t.arrivedFarReason}
              </p>
            )}
            {t.endFarReason && (
              <p className="rounded-lg bg-warning-tint px-3 py-2 text-sm text-warning-text">
                Ended {formatMetres(t.endDistanceM)} from the drop: {t.endFarReason}
              </p>
            )}
            {isCancelled && (t.cancelledBy || t.cancelReason) && (
              <p className="rounded-lg bg-error-tint px-3 py-2 text-sm text-error">
                {t.status === "NO_DRIVERS" ? "Ended" : "Cancelled"} by {cancelSummary(t.cancelledBy, t.cancelCode)}
                {t.cancelledAt && <span className="text-error/80"> · {formatDateTime(t.cancelledAt)}</span>}
                {t.cancelReason && <span className="block">Note: {t.cancelReason}</span>}
                {t.cancelCode === "BUTTERFLY_MISMATCH" &&
                  (t.riderName
                    ? " (reported by the driver; 2 reports turn off Pink Taxi for others on this account)"
                    : " (reported by the driver)")}
              </p>
            )}
            {cancellations.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Cancellations</p>
                <ul className="space-y-2">
                  {cancellations.map((c) => (
                    <li key={c.id} className="rounded-lg border px-3 py-2 text-sm">
                      <span className="font-medium text-navy-900">{cancelSummary(c.by, c.code)}</span>
                      {c.fault && (
                        <span
                          className={cn("ml-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium", FAULT_TONE[c.fault])}
                          title={c.signals ? signalsText(c.signals) : undefined}
                        >
                          {faultSummary(c.fault, c.faultRule)}
                        </span>
                      )}
                      {c.driver && (
                        <>
                          {" · "}
                          <Link href={`/drivers/${c.driver.id}`} className="hover:text-coral-600 hover:underline">
                            {c.driver.user.name ?? "Driver"}
                          </Link>{" "}
                          <PlateBadge plate={c.driver.plate} />
                        </>
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {formatDateTime(c.createdAt)} · was {humanize(c.fromStatus).toLowerCase()}
                        {c.reassigned && " · sent back to search for another driver"}
                        {c.isDriverFault && " · counts against the driver"}
                        {c.signals && <span className="block">{signalsText(c.signals)}</span>}
                      </span>
                      {c.note && <span className="block text-xs text-navy-700">Note: {c.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-semibold">Fare</CardTitle>
            <CardDescription>100% goes to the driver</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              {FARE_LINES.map((l) => (
                <div key={l.key} className="flex justify-between">
                  <dt className="text-navy-700">{l.label}</dt>
                  <dd className="tabular-nums">{formatInr(Number(fare[l.key] ?? 0))}</dd>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between">
                <dt className="text-navy-700">Subtotal</dt>
                <dd className="tabular-nums">{formatInr(Number(fare.subtotal ?? 0))}</dd>
              </div>
              {Number(fare.peakCharge ?? 0) !== 0 && (
                <div className="flex justify-between">
                  <dt className="text-navy-700">
                    Peak charge{fare.multiplier && fare.multiplier > 1 ? ` (×${fare.multiplier})` : ""}
                  </dt>
                  <dd className="tabular-nums">{formatInr(Number(fare.peakCharge ?? 0))}</dd>
                </div>
              )}
              {Number(fare.extra ?? 0) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-navy-700">
                    Extra from the rider
                    <span className="block text-xs text-muted-foreground">Added while searching, goes to the driver</span>
                  </dt>
                  <dd className="tabular-nums">{formatInr(Number(fare.extra ?? 0))}</dd>
                </div>
              )}
              {Number(fare.previousCancellationFee ?? 0) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-navy-700">
                    Previous cancellation fee
                    <span className="block text-xs text-muted-foreground">Collected for another driver (Finance › Cancellation fees)</span>
                  </dt>
                  <dd className="tabular-nums">{formatInr(Number(fare.previousCancellationFee ?? 0))}</dd>
                </div>
              )}
              {Number(fare.waitingCharge ?? 0) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-navy-700">
                    Waiting charge
                    <span className="block text-xs text-muted-foreground">
                      after {fare.freeWaitMin ?? 3} free min · {formatInr(Number(fare.waitPerMin ?? 0))}/min, max{" "}
                      {formatInr(Number(fare.waitMaxCharge ?? 0))}
                    </span>
                  </dt>
                  <dd className="tabular-nums">{formatInr(Number(fare.waitingCharge ?? 0))}</dd>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-heading text-base font-semibold text-navy-900">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatInr(Number(fare.total ?? t.fareTotal))}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-semibold">Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <Timeline
              steps={[
                { label: "Booked", at: t.createdAt },
                { label: "Driver assigned", at: t.assignedAt },
                { label: "Driver arrived", at: t.arrivedAt ?? null },
                { label: isParcel ? "Picked up" : "Ride started", at: t.startedAt },
                { label: endLabel, at: isCancelled ? (t.cancelledAt ?? t.endedAt) : t.endedAt },
              ]}
            />
          </CardContent>
        </Card>

        {t.endedAt && !isCancelled && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-semibold">
                <NavigationIcon className="size-4 text-coral-600" /> GPS path
              </CardTitle>
              <CardDescription>
                Recorded from the driver&apos;s phone (orange); the quoted route is dashed. The fare is always the quote.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                <Field label="Driven">
                  {t.distanceCalcFailed ? <span className="text-warning-text">Not measured</span> : formatKm(t.actualDistanceM)}
                </Field>
                <Field label="Quoted">{t.distanceKm.toFixed(1)} km</Field>
                <Field label="To pickup">{formatKm(t.approachDistanceM)}</Field>
                <Field label="GPS points">{t.gpsPoints ?? 0}</Field>
                <Field label="Mock GPS fixes">
                  <span className={cn((t.gpsMockCount ?? 0) > 0 && "font-semibold text-error")}>{t.gpsMockCount ?? 0}</span>
                </Field>
              </dl>
              {t.pathPolyline || t.routePolyline ? (
                <TripPathMap
                  polyline={t.pathPolyline ?? null}
                  route={t.routePolyline}
                  pickup={{ lat: t.pickupLat, lng: t.pickupLng }}
                  drop={{ lat: t.dropLat, lng: t.dropLng }}
                />
              ) : (
                <p className="text-sm text-muted-foreground">No path recorded for this trip.</p>
              )}
            </CardContent>
          </Card>
        )}

        {isParcel && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-semibold">
                <PackageIcon className="size-4 text-coral-600" /> Parcel
              </CardTitle>
              <CardDescription>Paid by {t.payer ? humanize(t.payer).toLowerCase() : "–"}</CardDescription>
            </CardHeader>
            <CardContent>
              {t.parcel && Object.keys(t.parcel).length > 0 ? (
                <dl className="grid grid-cols-2 gap-3">
                  {Object.entries(t.parcel).map(([k, v]) => (
                    <Field key={k} label={humanize(k.replace(/([a-z])([A-Z])/g, "$1_$2"))}>
                      <span className="break-words">{renderValue(v)}</span>
                    </Field>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">No parcel details recorded.</p>
              )}
              <div className="mt-4 flex flex-wrap gap-4 border-t pt-4">
                <PhotoTile label="Parcel (sender)" file={t.parcelPhotoFile} note={t.parcelPhotoFile ? "Taken before pickup" : "Not added"} />
                <PhotoTile label="Proof of delivery" file={t.deliveryPhotoFile} note={t.deliveryPhotoFile ? "Taken by the driver at the drop" : "Not taken"} />
              </div>
            </CardContent>
          </Card>
        )}

        {t.shifting && <ShiftingCard s={t.shifting} />}

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-semibold">
              <ShieldAlertIcon className="size-4 text-coral-600" /> Safety
            </CardTitle>
            <CardDescription>
              SOS alerts and ride checks (long stops, route changes, night check-ins).{" "}
              <Link href="/safety" className="text-coral-600 hover:underline">
                All SOS
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase">SOS</p>
              {sos.length === 0 ? (
                <p className="text-sm text-muted-foreground">No SOS on this trip.</p>
              ) : (
                <ul className="space-y-3">
                  {sos.map((x) => {
                    const map = sosMapUrl(x);
                    return (
                      <li key={x.id} className={cn("rounded-lg border p-3", x.status === "OPEN" && "border-error bg-error-tint/50")}>
                        <p className="flex items-center justify-between gap-2 text-sm font-medium text-navy-900">
                          {humanize(x.role)} · {sosSourceLabel(x.source)} <StatusBadge status={x.status} />
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDateTime(x.createdAt)}
                          {map && (
                            <>
                              {" · "}
                              <a href={map} target="_blank" rel="noreferrer" className="text-coral-600 hover:underline">
                                Where
                              </a>
                            </>
                          )}
                          {x.resolvedAt && ` · closed ${formatDateTime(x.resolvedAt)}`}
                        </p>
                        {x.note && <p className="mt-1 text-sm text-navy-700">{x.note}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase">Events</p>
              {safetyEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No safety events.</p>
              ) : (
                <ul className="space-y-2">
                  {safetyEvents.map((e) => {
                    const line = safetyEventLine(e);
                    return (
                      <li key={e.id} className="flex items-start justify-between gap-3 text-sm">
                        <span>
                          <span className="font-medium text-navy-900">{line.title}</span>
                          {line.detail && <span className="block text-navy-700">{line.detail}</span>}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(e.at)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className={isParcel ? "" : "lg:col-span-2"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-semibold">
              <LifeBuoyIcon className="size-4 text-coral-600" /> Support tickets
            </CardTitle>
          </CardHeader>
          <CardContent>
            {t.tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tickets for this trip.</p>
            ) : (
              <ul className="space-y-3">
                {t.tickets.map((tk) => (
                  <li key={tk.id} className="rounded-lg border p-3">
                    <p className="flex items-center justify-between gap-2 text-sm font-medium text-navy-900">
                      {tk.topic} <StatusBadge status={tk.status} />
                    </p>
                    <p className="mt-1 text-sm text-navy-700">{tk.description}</p>
                    {tk.attachmentFile && <AttachmentThumb file={tk.attachmentFile} />}
                    <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(tk.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

const FAULT_TONE: Record<CancelFault, string> = {
  DRIVER: "bg-error-tint text-error",
  PASSENGER: "bg-warning-tint text-warning-text",
  NONE: "bg-muted text-navy-700",
  SHARED: "bg-muted text-navy-700",
};

/** "Waited 4 min · 6 min after accept · 900 m from the pickup (1.5 km at accept)". */
function signalsText(s: Record<string, unknown>): string {
  const num = (k: string): number | null => (typeof s[k] === "number" ? (s[k] as number) : null);
  const min = (sec: number) => `${Math.round(sec / 60)} min`;
  const parts: string[] = [];
  const waited = num("waitedSec");
  if (waited !== null) parts.push(`waited ${min(waited)} at the pickup`);
  const since = num("sinceAcceptSec");
  if (since !== null) parts.push(`${min(since)} after accept`);
  const now = num("nowM");
  const atAccept = num("atAcceptM");
  if (now !== null) parts.push(`${formatMetres(now)} from the pickup${atAccept !== null ? ` (${formatMetres(atAccept)} at accept)` : ""}`);
  if (s.isMovingAway === true) parts.push("moving away");
  return parts.length ? `Signals: ${parts.join(" · ")}` : "No signals";
}

function formatMetres(m: number | null | undefined): string {
  if (m == null) return "far";
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

const HOME_SIZE: Record<ShiftingInfo["homeSize"], string> = {
  FEW_ITEMS: "A few items",
  ONE_RK: "Studio / 1 RK",
  ONE_BHK: "1 BHK",
  TWO_BHK: "2 BHK",
  THREE_BHK: "3 BHK or more",
};

const floorText = (floor: number, lift: boolean): string => `${floor === 0 ? "Ground floor" : `Floor ${floor}`}${floor > 0 ? (lift ? ", lift" : ", no lift") : ""}`;

/** House shifting: what the mover was asked to do (the items as the rider typed them) and the price lines. */
function ShiftingCard({ s }: { s: ShiftingInfo }) {
  const l = s.lines;
  const extras = [
    s.packing !== "NONE" && `${s.packing === "FULL" ? "Full" : "Basic"} packing`,
    s.dismantlePieces > 0 && `${s.dismantlePieces} piece${s.dismantlePieces === 1 ? "" : "s"} taken apart`,
    s.unpack && "Unpacking",
    s.extraHelpers > 0 && `${s.extraHelpers} extra helper${s.extraHelpers === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-semibold">
          <HomeIcon className="size-4 text-coral-600" /> Packers &amp; Movers
        </CardTitle>
        <CardDescription>
          {HOME_SIZE[s.homeSize]} · {s.between ? "to another town" : "in town"}
          {l ? ` · ${l.helperCount} helper${l.helperCount === 1 ? "" : "s"}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-3">
        <dl className="grid gap-3">
          <Field label="Pickup">{floorText(s.pickupFloor, s.pickupLift)}</Field>
          <Field label="Drop">{floorText(s.dropFloor, s.dropLift)}</Field>
          <Field label="Extras">{extras.length ? extras.join(", ") : "None"}</Field>
        </dl>
        <div>
          <p className="mb-2 text-sm font-medium">Items ({s.items.reduce((n, i) => n + i.qty, 0)})</p>
          <ul className="space-y-1 text-sm">
            {s.items.map((i, k) => (
              <li key={k}>
                <span className="tabular-nums">{i.qty} ×</span> {i.name}
                {i.note ? <span className="text-muted-foreground"> · {i.note}</span> : null}
              </li>
            ))}
          </ul>
        </div>
        {l && (
          <dl className="grid gap-1 text-sm">
            {(
              [
                ["Vehicle", l.transport],
                ["Helpers", l.helpers],
                ["Stairs", l.stairs],
                ["Packing", l.packing],
                ["Taking apart", l.dismantle],
                ["Unpacking", l.unpack],
                ["Weekend", l.weekend],
              ] as const
            )
              .filter(([, v]) => v > 0)
              .map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="tabular-nums">{formatInr(v)}</dd>
                </div>
              ))}
            <Separator className="my-1" />
            <div className="flex justify-between font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatInr(l.total)}</dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
