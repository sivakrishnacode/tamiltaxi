import { ExternalLinkIcon, LocateFixedIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAgo, formatDateTime } from "@/lib/format";
import { sosMapUrl } from "@/lib/safety";
import type { LastLocation } from "@/lib/types";

/** Where the rider app last placed this rider, with the time (admin rider page). */
export function LastLocationCard({ location }: { location: LastLocation | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-semibold">
          <LocateFixedIcon className="size-4 text-coral-600" /> Last location
        </CardTitle>
        <CardDescription>The rider app&apos;s map pin, to about 110 m. Kept for 30 days.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-navy-900">
        <LastLocationValue location={location} />
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
