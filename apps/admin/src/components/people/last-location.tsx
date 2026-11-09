import { ExternalLinkIcon, LocateFixedIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAgo, formatDateTime } from "@/lib/format";
import { sosMapUrl } from "@/lib/safety";
import type { LastLocation } from "@/lib/types";

export interface LastLocationRow {
  /** "Rider app", "Driver app". */
  readonly label: string;
  /** What the point is: "map pin, to ~110 m", "GPS". */
  readonly source: string;
  readonly location: LastLocation | null | undefined;
}

/** Where the apps last placed this person, with the time (admin user page). */
export function LastLocationCard({ rows, className }: { rows: readonly LastLocationRow[]; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-semibold">
          <LocateFixedIcon className="size-4 text-coral-600" /> Last location
        </CardTitle>
        <CardDescription>Kept for 30 days.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="space-y-4">
          {rows.map((r) => (
            <div key={r.label} className="space-y-0.5">
              <dt className="text-xs font-medium text-muted-foreground">
                {r.label} · {r.source}
              </dt>
              <dd className="text-sm text-navy-900">
                <LastLocationValue location={r.location} />
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

/** "9 Nov 2026, 11:40 am · 12 min ago", then the coordinates and a Google Maps link. */
export function LastLocationValue({ location }: { location: LastLocation | null | undefined }) {
  if (!location) return <span className="text-muted-foreground">Not seen in the last 30 days.</span>;
  return (
    <>
      <span className="block">
        {formatDateTime(location.at)} <span className="text-muted-foreground">· {ago(location.at)}</span>
      </span>
      <span className="flex flex-wrap items-center gap-x-3 text-xs">
        <span className="font-mono text-navy-700 tabular-nums">
          {coord(location.lat)}, {coord(location.lng)}
        </span>
        <a href={sosMapUrl(location)!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-coral-600 hover:underline">
          Open map <ExternalLinkIcon className="size-3" />
        </a>
      </span>
    </>
  );
}

/** Up to 5 decimals (~1 m), no padding: a rider's pin comes rounded to 3. */
function coord(n: number): string {
  return String(Number(n.toFixed(5)));
}

function ago(at: string): string {
  const a = formatAgo(at);
  return a === "just now" ? a : `${a} ago`;
}
