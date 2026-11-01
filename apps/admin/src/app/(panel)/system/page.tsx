import { ArchiveIcon, BellRingIcon, CpuIcon, DatabaseIcon, HardDriveIcon, MapIcon, MemoryStickIcon, TimerIcon, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminApi } from "@/lib/api";
import { formatAgo, formatCount, formatDateTime } from "@/lib/format";
import { backupLevel, formatBytes, formatUptime, levelOf, MAPS_ROWS, mapsUse, type Level } from "@/lib/system";
import { cn } from "@/lib/utils";

import { RefreshButton } from "./refresh-button";

export const metadata: Metadata = { title: "Server health" };

const BAR: Record<Level, string> = { ok: "bg-success", watch: "bg-warning", act: "bg-error" };
const PILL: Record<Level, string> = {
  ok: "bg-success-tint text-success-text",
  watch: "bg-warning-tint text-warning-text",
  act: "bg-error-tint text-error",
};

/** A thin bar, coloured by how full it is. */
function Meter({ share, className }: { share: number; className?: string }) {
  const level = levelOf(share);
  return (
    <span className={cn("block h-1.5 w-full overflow-hidden rounded-full bg-muted", className)} role="meter" aria-valuenow={Math.round(share * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span className={cn("block h-full rounded-full", BAR[level])} style={{ width: `${Math.min(100, Math.max(share > 0 ? 2 : 0, share * 100))}%` }} />
    </span>
  );
}

function Pill({ level, children }: { level: Level; children: React.ReactNode }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", PILL[level])}>{children}</span>;
}

/** One server number: value, a meter when it has a limit, and a hint. */
function Gauge({ label, value, hint, share, icon: Icon }: { label: string; value: string; hint: string; share?: number; icon: LucideIcon }) {
  return (
    <Card className="gap-2">
      <CardHeader className="flex items-center justify-between gap-2">
        <CardDescription className="font-medium">{label}</CardDescription>
        <span className="flex size-8 items-center justify-center rounded-lg bg-coral-50 text-coral-600">
          <Icon className="size-4" aria-hidden />
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="font-heading text-2xl font-semibold tabular-nums text-navy-900">{value}</p>
        {share !== undefined && <Meter share={share} />}
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

/** Label / value rows inside a card. */
function Facts({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="divide-y">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className="text-right font-medium tabular-nums text-navy-900">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const pct = (share: number) => `${Math.round(share * 100)}%`;

export default async function SystemHealthPage() {
  const h = await adminApi.system();
  const now = new Date(h.at);
  const { server, usage, backup } = h;
  const cpuShare = server.loadAvg[0] / Math.max(1, server.cpus);
  const memUsed = server.memTotal - server.memAvailable;
  const diskUsed = server.diskTotal != null && server.diskFree != null ? server.diskTotal - server.diskFree : null;
  const pushSent = usage.month["push.sent"];
  const pushFailed = usage.month["push.failed"];
  const failShare = pushSent + pushFailed ? pushFailed / (pushSent + pushFailed) : 0;
  // A few failures are normal (phones that uninstalled); a fifth or more means something is wrong.
  const failLevel: Level = failShare >= 0.2 ? "act" : failShare >= 0.05 ? "watch" : "ok";
  const bLevel = backupLevel(backup.last?.at, now);

  return (
    <>
      <PageHeader
        title="Server health"
        description="The server the API runs on, its database and Redis, Google Maps and push counts against the free tiers, and the last database backup."
        actions={<RefreshButton />}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <Gauge
          label="CPU load"
          value={`${server.loadAvg[0]?.toFixed(2) ?? "–"} / ${server.cpus}`}
          share={cpuShare}
          hint={`Last minute, on ${server.cpus} CPU${server.cpus === 1 ? "" : "s"} · 15 min ${server.loadAvg[2]?.toFixed(2) ?? "–"}`}
          icon={CpuIcon}
        />
        <Gauge
          label="Memory"
          value={`${formatBytes(memUsed)} of ${formatBytes(server.memTotal)}`}
          share={memUsed / server.memTotal}
          hint={`${formatBytes(server.memAvailable)} free · the API uses ${formatBytes(h.api.rss)}`}
          icon={MemoryStickIcon}
        />
        <Gauge
          label="Disk"
          value={diskUsed != null && server.diskTotal ? `${formatBytes(diskUsed)} of ${formatBytes(server.diskTotal)}` : "–"}
          share={diskUsed != null && server.diskTotal ? diskUsed / server.diskTotal : undefined}
          hint={server.diskFree != null ? `${formatBytes(server.diskFree)} free` : "Not readable here"}
          icon={HardDriveIcon}
        />
        <Gauge label="Up for" value={formatUptime(server.uptimeSec)} hint={`API process up ${formatUptime(h.api.uptimeSec)} · Node ${h.api.node}`} icon={TimerIcon} />
      </div>

      <Card className="mt-6 gap-0 pb-0">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 font-semibold">
            <MapIcon className="size-4 text-coral-600" aria-hidden /> Google Maps this month
          </CardTitle>
          <CardDescription>
            Calls the API made, against Google&apos;s free calls per month (they reset on the 1st). The Route Matrix runs out
            first. Google Cloud billing is the real bill.
          </CardDescription>
          <CardAction>{usage.isMapsOn ? <Pill level="ok">Key set</Pill> : <Pill level="watch">No key: local estimates</Pill>}</CardAction>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="pl-4">Call</TableHead>
              <TableHead className="text-right">Today</TableHead>
              <TableHead className="text-right">This month</TableHead>
              <TableHead className="text-right">Free a month</TableHead>
              <TableHead className="w-56 pr-4">Used</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MAPS_ROWS.map((row) => {
              const u = mapsUse(h, row.metric, now);
              return (
                <TableRow key={row.metric}>
                  <TableCell className="pl-4">
                    <span className="block font-medium text-navy-900">{row.label}</span>
                    <span className="block text-xs text-muted-foreground">{row.what}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCount(u.today)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatCount(u.month)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{u.free ? formatCount(u.free) : "–"}</TableCell>
                  <TableCell className="pr-4">
                    {u.share != null && u.free ? (
                      <span className="block space-y-1">
                        <span className="flex items-center gap-2">
                          <Meter share={u.share} />
                          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{pct(u.share)}</span>
                        </span>
                        {u.projected !== null && (
                          <span className={cn("block text-[11px]", u.projected > u.free ? "font-medium text-error" : "text-muted-foreground")}>
                            On pace for {formatCount(u.projected)}
                            {u.projected > u.free ? ": over the free calls" : ""}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">No free cap listed</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="gap-0 pb-0">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 font-semibold">
              <BellRingIcon className="size-4 text-coral-600" aria-hidden /> Push notifications
            </CardTitle>
            <CardDescription>Firebase deliveries to phones</CardDescription>
            <CardAction>{usage.isPushOn ? <Pill level={failLevel}>{pct(failShare)} failed</Pill> : <Pill level="act">Push off</Pill>}</CardAction>
          </CardHeader>
          <Facts
            rows={[
              { label: "Sent today", value: formatCount(usage.today["push.sent"]) },
              { label: "Failed today", value: formatCount(usage.today["push.failed"]) },
              { label: "Sent this month", value: formatCount(pushSent) },
              { label: "Failed this month", value: formatCount(pushFailed) },
            ]}
          />
          <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
            {usage.isPushOn ? "A few failures are normal: phones that uninstalled the app are removed." : "No Firebase key on the server: nobody gets pushes."}
          </p>
        </Card>

        <Card className="gap-0 pb-0">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 font-semibold">
              <DatabaseIcon className="size-4 text-coral-600" aria-hidden /> Database &amp; Redis
            </CardTitle>
            <CardDescription>Postgres and the live cache</CardDescription>
          </CardHeader>
          <Facts
            rows={[
              { label: "Database size", value: formatBytes(h.database.sizeBytes) },
              {
                label: "Connections",
                value: (
                  <span className="flex items-center justify-end gap-2">
                    <Meter share={h.database.connections / Math.max(1, h.database.maxConnections)} className="w-16" />
                    {h.database.connections} of {h.database.maxConnections}
                  </span>
                ),
              },
              { label: "Redis memory", value: formatBytes(h.redis.usedMemory) },
              { label: "Redis keys", value: formatCount(h.redis.keys) },
            ]}
          />
        </Card>

        <Card className="gap-0 pb-0">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 font-semibold">
              <ArchiveIcon className="size-4 text-coral-600" aria-hidden /> Last backup
            </CardTitle>
            <CardDescription>Database dumps on the server</CardDescription>
            <CardAction>
              {backup.dir === null ? (
                <Pill level="watch">Not set up</Pill>
              ) : (
                <Pill level={bLevel}>{backup.last ? `${formatAgo(backup.last.at, now)} ago` : "None"}</Pill>
              )}
            </CardAction>
          </CardHeader>
          {backup.dir === null ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              The API can&apos;t see the backups folder. On the server, mount it read-only and set <code className="text-xs">BACKUP_DIR</code>{" "}
              (see the deploy steps).
            </p>
          ) : backup.error ? (
            <p className="px-4 py-3 text-sm text-error">Can&apos;t read {backup.dir}: {backup.error}</p>
          ) : (
            <Facts
              rows={[
                { label: "Newest", value: backup.last ? <span className="font-mono text-xs">{backup.last.name}</span> : "–" },
                { label: "Taken", value: backup.last ? formatDateTime(backup.last.at) : "–" },
                { label: "Size", value: backup.last ? formatBytes(backup.last.sizeBytes) : "–" },
                { label: "Backups kept", value: formatCount(backup.count) },
              ]}
            />
          )}
          <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">Taken by hand at each deploy for now; nightly backups are on the ROADMAP.</p>
        </Card>
      </div>
    </>
  );
}
