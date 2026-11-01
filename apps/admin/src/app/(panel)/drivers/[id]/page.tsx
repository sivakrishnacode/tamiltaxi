import { ArrowLeftIcon, ExternalLinkIcon, FileTextIcon, RouteIcon, ScanFaceIcon, StarIcon, WalletCardsIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ApprovalChecks, missingChecks } from "@/components/common/approval-checks";
import { PhotoTile } from "@/components/common/photo-tile";
import { EmptyState, Field, PageHeader } from "@/components/common/page";
import { ExpiryNote, KycProgress, OnlineDot, PlateBadge, StatusBadge } from "@/components/common/status";
import { TripRouteCell } from "@/components/common/trip-bits";
import { PersonMenu } from "@/components/people/person-menu";
import { PersonRecord } from "@/components/people/person-record";
import { PersonTabs } from "@/components/people/person-tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isOwner } from "@/lib/access";
import { adminApi, docFileHref } from "@/lib/api";
import {
  displayName,
  docLabel,
  formatDate,
  formatDateTime,
  formatInr,
  formatPhone,
  humanize,
  initials,
  kycProgress,
  shortId,
  vehicleLabel,
} from "@/lib/format";
import { GOODS_TRUCKS, KYC_DOC_TYPES, type GoodsTruck, type KycDocument } from "@/lib/types";
import { getSessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";

import { LiftBlockButton } from "./block-actions";
import { DocumentActions, DriverStatusActions, PhotoReviewActions } from "./driver-actions";

export async function generateMetadata({ params }: PageProps<"/drivers/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: `Driver ${shortId(id)}` };
}

export default async function DriverPage({ params }: PageProps<"/drivers/[id]">) {
  const { id } = await params;
  // The offer record is extra: the page still renders without it.
  const [d, offers, me] = await Promise.all([adminApi.driver(id), adminApi.driverOfferStats(id).catch(() => null), getSessionUser()]);
  const identity = d.user.identityChecks?.[0] ?? null;
  const kyc = kycProgress(d.documents, d.user.identityStatus ?? "NOT_STARTED");
  const name = displayName(d.user);
  // Always list every uploaded document (RC, insurance), even if the API has no row for one yet.
  const docs: KycDocument[] = KYC_DOC_TYPES.map(
    (type) =>
      d.documents.find((doc) => doc.type === type) ?? {
        id: type,
        driverId: d.id,
        type,
        status: "NOT_UPLOADED",
        rejectReason: null,
        fileUrl: null,
        updatedAt: d.createdAt,
      },
  );
  const payments = d.subscriptions.flatMap((s) => (s.payments ?? []).map((p) => ({ ...p, plan: s.plan })));
  const rate = d.cancelRate;
  const blocks = d.blocks ?? [];
  const pausedUntil = rate?.blockedUntil ?? null;

  return (
    <>
      <Link href="/drivers" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> All drivers
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar className="size-12">
              {d.photoFile && <AvatarImage src={docFileHref(d.photoFile)} alt={`Photo of ${name}`} className="object-cover" />}
              <AvatarFallback className="bg-coral-50 text-base font-semibold text-coral-600">{initials(d.user.name)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0">
              <span className="block truncate">{name}</span>
              <span className="mt-1 flex flex-wrap items-center gap-2 font-sans text-sm font-normal text-muted-foreground">
                <StatusBadge status={d.status} />
                <OnlineDot isOnline={d.isOnline} withLabel />
                <span>· {formatPhone(d.user.phone)}</span>
                <span>· joined {formatDate(d.createdAt)}</span>
              </span>
            </span>
          </span>
        }
        actions={
          d.user.deletedAt ? undefined : (
            <>
              <DriverStatusActions driverId={d.id} status={d.status} name={name} missing={d.checklist ? missingChecks(d.checklist) : undefined} />
              <PersonMenu
                userId={d.user.id}
                name={name}
                email={d.user.email}
                personName={d.user.name}
                isBlocked={!!d.user.isBlocked}
                canDelete={isOwner(me)}
                driver={{
                  id: d.id,
                  isOnline: d.isOnline,
                  vehicleKind: d.vehicleKind,
                  workType: d.workType,
                  vehicleModel: d.vehicleModel,
                  vehicleColor: d.vehicleColor,
                  plate: d.plate,
                  upiId: d.upiId,
                }}
              />
            </>
          )
        }
      />
      <PersonTabs userId={d.user.id} driverId={d.id} active="driver" />

      {d.user.deletedAt && (
        <p className="mb-4 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
          Account deleted {formatDateTime(d.user.deletedAt)}: documents, photos and personal details are wiped; trips stay for
          the records.
        </p>
      )}

      {d.user.isBlocked && !d.user.deletedAt && (
        <p className="mb-4 rounded-lg bg-error-tint px-4 py-3 text-sm text-error">
          Account blocked{d.user.blockedReason ? `: ${d.user.blockedReason}` : ""}. The driver can&apos;t sign in or go online.
        </p>
      )}

      {d.checklist && (d.status === "PENDING" || d.status === "REJECTED") && (
        <Card className="mb-4 gap-2 border-coral-500/30 bg-coral-50/40 py-4">
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-navy-900">
                {d.status === "REJECTED"
                  ? "Rejected: waiting for the driver to fix and re-upload"
                  : d.checklist.isReady
                    ? "Ready to approve: every check is done"
                    : `Not ready yet: ${missingChecks(d.checklist)}`}
              </p>
              <ApprovalChecks checklist={d.checklist} />
            </div>
            <Link href="/drivers/approvals" className="text-sm text-coral-600 hover:underline">
              Open Approvals
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="font-semibold">Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <Field label="Name">{d.user.name ?? "–"}</Field>
              <Field label="Phone">{formatPhone(d.user.phone)}</Field>
              <Field label="Email">{d.user.email ?? "–"}</Field>
              <Field label="Gender">{humanize(d.user.gender)}</Field>
              <Field label="Works on">{d.workType === "RIDES" ? "Rides" : "Deliveries"}</Field>
              <Field label="Account">
                <Link href={`/users/${d.user.id}`} className="text-coral-600 hover:underline">
                  Open account
                </Link>
              </Field>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-semibold">Vehicle &amp; payout</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <Field label="Vehicle">{vehicleLabel(d.vehicleKind)}</Field>
              <Field label="Plate">
                <PlateBadge plate={d.plate} />
              </Field>
              <Field label="Model">{d.vehicleModel}</Field>
              <Field label="Colour">{d.vehicleColor || "–"}</Field>
              {GOODS_TRUCKS.includes(d.vehicleKind as GoodsTruck) && (
                <Field label="Packers & Movers" className="col-span-2">
                  {d.bookingPrefs?.shifting
                    ? `Takes moves · brings ${d.bookingPrefs.helpers ?? 2} helper${(d.bookingPrefs.helpers ?? 2) === 1 ? "" : "s"}`
                    : "Not taking moves (switched off in the driver app)"}
                </Field>
              )}
              <Field label="UPI ID" className="col-span-2">
                <span className="font-mono text-[13px]">{d.upiId}</span>
              </Field>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-semibold">Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <Field label="Rating">
                <span className="inline-flex items-center gap-1 font-heading text-xl font-semibold">
                  <StarIcon className="size-4 fill-warning text-warning" /> {d.rating.toFixed(1)}
                </span>
              </Field>
              <Field label="Trips completed">
                <span className="font-heading text-xl font-semibold">{d.ridesCount}</span>
              </Field>
              <Field label="KYC">
                <KycProgress verified={kyc.verified} total={kyc.total} />
              </Field>
              <Field label="Cancelled (7 days)">
                {rate ? (
                  <span className={cn("font-heading text-xl font-semibold", rate.level === "BLOCK" ? "text-error" : rate.level === "NUDGE" && "text-warning-text")}>
                    {Math.round(rate.rate * 100)}%
                    <span className="block font-sans text-xs font-normal text-muted-foreground">
                      {rate.cancelled} of {rate.assigned} rides{rate.assigned < rate.minTrips ? ` · judged from ${rate.minTrips}` : ""}
                    </span>
                  </span>
                ) : (
                  "–"
                )}
              </Field>
              <Field label="Offers (7 days)" className="col-span-2">
                {offers ? (
                  <span className="font-heading text-xl font-semibold">
                    {offers.acceptRate === null ? "–" : `${Math.round(offers.acceptRate * 100)}% accepted`}
                    <span className="block font-sans text-xs font-normal text-muted-foreground">
                      {offers.offered} offered · {offers.accepted} accepted · {offers.declined} declined · {offers.ignored} ignored ·{" "}
                      {offers.cancelled} cancelled after accepting
                      {offers.isRanked ? "" : ` · ranked from ${offers.minOffers} offers`}
                    </span>
                  </span>
                ) : (
                  "–"
                )}
              </Field>
              <Field label="Current plan">
                {d.subscriptions[0] ? (
                  <span className="flex items-center gap-2">
                    <StatusBadge status={d.subscriptions[0].status} /> {humanize(d.subscriptions[0].plan.period)}
                  </span>
                ) : (
                  "No plan"
                )}
              </Field>
            </dl>
          </CardContent>
        </Card>
      </div>

      {(pausedUntil || blocks.length > 0) && (
        <Card className="mt-4 gap-0">
          <CardHeader className="border-b">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 font-semibold">
              <span>Pauses</span>
              {pausedUntil && <LiftBlockButton driverId={d.id} />}
            </CardTitle>
            <CardDescription>
              {pausedUntil
                ? `Paused until ${formatDateTime(pausedUntil)}: can't go online, skipped by dispatch.`
                : "Paused for too many cancellations (driver's fault ÷ assigned trips, 7 days)."}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <ul className="space-y-2">
              {blocks.map((b) => (
                <li key={b.id} className="rounded-lg border px-3 py-2 text-sm">
                  <span className="font-medium text-navy-900">
                    {formatDateTime(b.fromAt)} → {formatDateTime(b.untilAt)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {humanize(b.reason)}
                    {b.details?.assigned ? ` · ${b.details.cancelled} of ${b.details.assigned} rides cancelled` : ""}
                    {b.liftedAt ? ` · lifted by an admin ${formatDateTime(b.liftedAt)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="mt-4 gap-0">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 font-semibold">
            <ScanFaceIcon className="size-4 text-navy-700" aria-hidden /> Identity check (Didit)
            <StatusBadge status={d.user.identityStatus ?? "NOT_STARTED"} />
          </CardTitle>
          <CardDescription>
            Driving licence + Aadhaar + selfie, checked in the driver app. &ldquo;In review&rdquo; sessions are decided
            in the Didit console (business.didit.me); the result arrives here by webhook.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {identity ? (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Name on ID">{identity.fullName ?? "–"}</Field>
              <Field label="Date of birth">{identity.dateOfBirth ?? "–"}</Field>
              <Field label="Documents">
                {identity.documents?.length
                  ? identity.documents.map((doc) => (
                      <span key={`${doc.type}-${doc.last4}`} className="block">
                        {doc.type} {doc.last4 && <span className="font-mono text-[13px]">•••• {doc.last4}</span>}
                      </span>
                    ))
                  : "–"}
              </Field>
              <Field label="Didit session">
                <span className="block font-mono text-[12px] break-all">{identity.sessionId}</span>
                <span className="block text-xs text-muted-foreground">
                  {identity.providerStatus}
                  {identity.decidedAt ? ` · ${formatDateTime(identity.decidedAt)}` : ""}
                </span>
              </Field>
              {identity.warnings && identity.warnings.length > 0 && (
                <Field label="Warnings" className="sm:col-span-2 lg:col-span-4">
                  <span className="text-error">{identity.warnings.join(" · ")}</span>
                </Field>
              )}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">The driver hasn&apos;t started the identity check yet.</p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4 gap-0">
        <CardHeader className="border-b">
          <CardTitle className="font-semibold">Profile photo</CardTitle>
          <CardDescription>
            Riders see the approved photo. The driver takes it in the app; it is matched to the live selfie from the
            identity check. A clear match goes live at once; an unclear one waits here.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-start gap-6">
            <PhotoTile label="Shown to riders" file={d.photoFile} note={d.photoUpdatedAt ? `Since ${formatDateTime(d.photoUpdatedAt)}` : "None yet"} />
            <PhotoTile label="Verified selfie (Didit)" file={d.selfieFile} note="Reference face, never shown to riders" />
            {d.pendingPhotoFile && (
              <div className="flex flex-col gap-3">
                <PhotoTile
                  label="Waiting for review"
                  file={d.pendingPhotoFile}
                  note={d.photoMatchScore != null ? `Face match ${d.photoMatchScore.toFixed(0)}%` : "Face match not run"}
                />
                <PhotoReviewActions driverId={d.id} />
              </div>
            )}
          </div>
          {d.selfieFile && (
            <p className="mt-3 text-xs text-muted-foreground">
              Daily selfie check (matched to the verified selfie before going online):{" "}
              {d.selfieCheckedAt ? `last passed ${formatDateTime(d.selfieCheckedAt)}` : "not taken yet"}
            </p>
          )}
          {d.photoRejectReason && !d.pendingPhotoFile && (
            <p className="mt-3 text-xs text-error">Last photo rejected: {d.photoRejectReason}</p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4 gap-0 pb-0">
        <CardHeader className="border-b">
          <CardTitle className="font-semibold">KYC documents</CardTitle>
          <CardDescription>
            {kyc.verified} of {kyc.total} verified (identity check included). RC and insurance verified plus an approved
            identity check approves the driver; any rejection marks the driver rejected.
          </CardDescription>
        </CardHeader>
        <ul className="divide-y">
          {docs.map((doc) => (
            <li key={doc.type} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-navy-700">
                  <FileTextIcon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-navy-900">
                    {docLabel(doc.type)} <StatusBadge status={doc.status} />
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Updated {formatDateTime(doc.updatedAt)}
                    {doc.fileUrl && (
                      <>
                        {" · "}
                        <a
                          href={docFileHref(doc.fileUrl)}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-0.5 text-coral-600 hover:underline"
                        >
                          View file <ExternalLinkIcon className="size-3" />
                        </a>
                      </>
                    )}
                  </p>
                  {doc.status === "REJECTED" && doc.rejectReason && (
                    <p className="mt-1 text-xs text-error">Reason: {doc.rejectReason}</p>
                  )}
                  {doc.status === "VERIFIED" && <ExpiryNote expiresOn={doc.expiresOn} className="mt-1" />}
                </div>
              </div>
              <DocumentActions driverId={d.id} type={doc.type} label={docLabel(doc.type)} status={doc.status} expiresOn={doc.expiresOn} />
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card className="gap-0 pb-0">
          <CardHeader className="border-b">
            <CardTitle className="font-semibold">Subscriptions</CardTitle>
            <CardDescription>Daily, weekly or monthly plans. Tamil Taxi takes no commission on fares.</CardDescription>
          </CardHeader>
          {d.subscriptions.length === 0 ? (
            <EmptyState icon={WalletCardsIcon} title="No subscriptions" description="The driver hasn't started a plan yet." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="pr-4 text-right">Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.subscriptions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="pl-4">
                      {vehicleLabel(s.plan.vehicleKind)} · {humanize(s.plan.period)}
                      <span className="block text-xs text-muted-foreground">
                        {s.autopay ? "UPI Autopay" : "Manual"}
                        {s.upiApp ? ` · ${s.upiApp}` : ""}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                    <TableCell className="text-navy-700">
                      {formatDate(s.startsAt)} – {formatDate(s.endsAt)}
                    </TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">{formatInr(s.plan.price)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card className="gap-0 pb-0">
          <CardHeader className="border-b">
            <CardTitle className="font-semibold">Payments</CardTitle>
            <CardDescription>Plan payments collected from this driver.</CardDescription>
          </CardHeader>
          {payments.length === 0 ? (
            <EmptyState icon={WalletCardsIcon} title="No payments yet" description="Payments appear after the free trial ends." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Date</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="pl-4">
                      {formatDateTime(p.createdAt)}
                      {p.providerRef && <span className="block font-mono text-xs text-muted-foreground">{p.providerRef}</span>}
                    </TableCell>
                    <TableCell>{humanize(p.plan.period)}</TableCell>
                    <TableCell>
                      <StatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">{formatInr(p.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <Card className="mt-4 gap-0 pb-0">
        <CardHeader className="border-b">
          <CardTitle className="font-semibold">Recent trips</CardTitle>
          <CardDescription>Last 20 rides and deliveries.</CardDescription>
        </CardHeader>
        {d.trips.length === 0 ? (
          <EmptyState icon={RouteIcon} title="No trips yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Trip</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4 text-right">Fare</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.trips.map((t) => (
                <TableRow key={t.id} className="relative">
                  <TableCell className="pl-4">
                    <Link href={`/trips/${t.id}`} className="font-mono text-xs font-medium text-navy-900 after:absolute after:inset-0 hover:text-coral-600">
                      {shortId(t.id)}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{humanize(t.kind)}</span>
                  </TableCell>
                  <TableCell className="text-navy-700">{formatDateTime(t.createdAt)}</TableCell>
                  <TableCell>
                    <TripRouteCell pickup={t.pickupName} drop={t.dropName} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={t.status} />
                  </TableCell>
                  <TableCell className="pr-4 text-right tabular-nums">{formatInr(t.fareTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Suspense fallback={<Skeleton className="mt-4 h-48 w-full rounded-xl" />}>
        <PersonRecord userId={d.user.id} driverId={d.id} />
      </Suspense>
    </>
  );
}
