import { Suspense, cache } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { UserMenu } from "@/components/layout/user-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { adminApi } from "@/lib/api";
import { getSessionUser } from "@/lib/session";

/** Reads the session cookie inside its own Suspense boundary so page loading.tsx skeletons still stream. */
async function SessionUserMenu() {
  const user = await getSessionUser();
  return <UserMenu name={user?.name ?? null} phone={user?.phone ?? ""} />;
}

// One API read each per render: the sidebar's Drivers counter adds up the two tab counters below. Never break the layout.
const kycWaiting = cache(() =>
  adminApi
    .kyc({ status: "UNDER_REVIEW", pageSize: 1 })
    .then((r) => r.total)
    .catch(() => 0),
);
const approvalsWaiting = cache(() =>
  adminApi
    .approvals({ stage: "ready", pageSize: 1 })
    .then((r) => r.counts.ready + r.counts.photos)
    .catch(() => 0),
);

function CountBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="rounded-full bg-coral-600 px-1.5 py-px text-[11px] font-semibold text-white tabular-nums">
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Documents waiting for review, on the Documents tab. */
async function KycBadge() {
  return <CountBadge count={await kycWaiting()} />;
}

/** Drivers ready to approve plus photos to review, on the Approvals tab. */
async function ApprovalsBadge() {
  return <CountBadge count={await approvalsWaiting()} />;
}

/** Everything waiting on an admin under Drivers (approvals + documents), on the sidebar item. */
async function DriversBadge() {
  const [approvals, kyc] = await Promise.all([approvalsWaiting(), kycWaiting()]);
  return <CountBadge count={approvals + kyc} />;
}

/** One settings read per render for the badges below. */
const settingsOnce = cache(() => adminApi.settings().catch(() => null));

/** "Off" next to Driver plans while paid driver plans are switched off (the free app). */
async function PlansOffBadge() {
  const settings = await settingsOnce();
  if (!settings || settings.driverPlansEnabled) return null;
  return <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Off</span>;
}

const sosOpen = cache(() =>
  adminApi
    .sos({ status: "OPEN", pageSize: 1 })
    .then((r) => r.open)
    .catch(() => 0),
);

/** Open SOS alerts, shown in red on "SOS & support" and its SOS alerts tab. Never breaks the layout. */
async function SosBadge() {
  const open = await sosOpen();
  if (!open) return null;
  return (
    <span className="animate-pulse rounded-full bg-error px-1.5 py-px text-[11px] font-semibold text-white tabular-nums">
      {open > 99 ? "99+" : open}
    </span>
  );
}

export default function PanelLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell
      userMenu={
        <Suspense fallback={<Skeleton className="size-9 rounded-full" />}>
          <SessionUserMenu />
        </Suspense>
      }
      badges={{
        "/drivers": (
          <Suspense fallback={null}>
            <DriversBadge />
          </Suspense>
        ),
        "/safety": (
          <Suspense fallback={null}>
            <SosBadge />
          </Suspense>
        ),
      }}
      tabBadges={{
        "/drivers/approvals": (
          <Suspense fallback={null}>
            <ApprovalsBadge />
          </Suspense>
        ),
        "/kyc": (
          <Suspense fallback={null}>
            <KycBadge />
          </Suspense>
        ),
        "/safety": (
          <Suspense fallback={null}>
            <SosBadge />
          </Suspense>
        ),
      }}
      tags={{
        "/plans": (
          <Suspense fallback={null}>
            <PlansOffBadge />
          </Suspense>
        ),
      }}
    >
      {children}
    </AppShell>
  );
}
