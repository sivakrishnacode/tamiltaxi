import { HistoryIcon, StickyNoteIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adminApi } from "@/lib/api";
import { displayName, formatDateTime } from "@/lib/format";

import { NotesPanel } from "./notes-panel";

/**
 * Notes + history of one person, on their driver page and their rider page (same user id; the rider page's history
 * leaves the driver profile's changes out, [riderOnly]). Older APIs without these endpoints show the cards empty
 * rather than breaking the page.
 */
export async function PersonRecord({ userId, driverId, riderOnly = false }: { userId: string; driverId?: string; riderOnly?: boolean }) {
  const [notes, activity] = await Promise.all([
    adminApi.notes(userId).catch(() => null),
    adminApi.activity(userId, undefined, riderOnly ? "rider" : undefined).catch(() => null),
  ]);
  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 font-semibold">
            <StickyNoteIcon className="size-4 text-coral-600" aria-hidden /> Notes
          </CardTitle>
          <CardDescription>What was agreed on calls, warnings given, anything the next admin should know.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {notes ? <NotesPanel userId={userId} driverId={driverId} notes={notes} /> : <p className="text-sm text-muted-foreground">Notes need a newer API.</p>}
        </CardContent>
      </Card>
      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 font-semibold">
            <HistoryIcon className="size-4 text-coral-600" aria-hidden /> History
          </CardTitle>
          <CardDescription>Every admin change to this person, newest first (from the audit log).</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {!activity ? (
            <p className="text-sm text-muted-foreground">History needs a newer API.</p>
          ) : activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No admin changes yet.</p>
          ) : (
            <ol className="relative space-y-3 border-l pl-4">
              {activity.map((a) => (
                <li key={a.id} className="relative">
                  <span aria-hidden className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-card bg-coral-500" />
                  <p className="text-sm text-navy-900">{a.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(a.at)} · {a.actor ? displayName(a.actor) : "Unknown admin"}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
