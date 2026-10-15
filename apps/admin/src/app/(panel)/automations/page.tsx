import { BellRingIcon, CheckIcon, TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, PageHeader } from "@/components/common/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, adminApi } from "@/lib/api";
import { readReminderSettings } from "@/lib/automations";
import { displayName, formatDateTime, formatPhone } from "@/lib/format";
import type { AutomationsOverview, ReminderKind } from "@/lib/types";

import { RemindersForm } from "./reminders-form";

export const metadata: Metadata = { title: "Reminders" };

const KIND_LABEL: Record<ReminderKind, string> = { SEARCH: "Didn't book", ROUTINE: "Usual trip" };

export default async function RemindersPage() {
  const [settings, overview] = await Promise.all([
    adminApi.settings(),
    // Numbers and history come from a newer API: without it the page still works, with a note instead of the table.
    adminApi.automations().then(
      (data): { data: AutomationsOverview } | { error: string } => ({ data }),
      (e: unknown) => {
        if (e instanceof ApiError) return { error: e.status === 404 ? "It arrives with the next API update." : `The API said: ${e.message}` };
        throw e;
      },
    ),
  ]);
  const { values, isSupported } = readReminderSettings(settings);
  const data = "data" in overview ? overview.data : null;

  return (
    <>
      <PageHeader
        title="Reminders"
        description="Automatic pushes that bring riders back: one after a fare check with no booking, one before a trip they take every day."
      />
      <RemindersForm initial={values} isSupported={isSupported} stats={data ? { search: data.search, routine: data.routine } : null} />

      <Card className="mt-6 gap-0 pb-0">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold text-navy-900">Recent reminders</CardTitle>
          <CardDescription>The latest pushes, newest first. Booked = the rider booked within an hour.</CardDescription>
        </CardHeader>
        {!data ? (
          <EmptyState
            icon={TriangleAlertIcon}
            title="Reminder history isn't available"
            description={"error" in overview ? overview.error : undefined}
            className="border-t"
          />
        ) : data.recent.length === 0 ? (
          <EmptyState icon={BellRingIcon} title="No reminders sent yet" description="They show up here as riders get them." className="border-t" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Sent</TableHead>
                <TableHead>Rider</TableHead>
                <TableHead>Reminder</TableHead>
                <TableHead>Message</TableHead>
                <TableHead className="pr-4 text-center">Booked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recent.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-4 whitespace-nowrap text-navy-700">{formatDateTime(r.sentAt)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Link href={`/users/${encodeURIComponent(r.userId)}`} className="font-medium text-navy-900 hover:text-coral-600">
                      {displayName({ name: r.userName, phone: r.phone })}
                    </Link>
                    {r.userName && <span className="block text-xs text-muted-foreground">{formatPhone(r.phone)}</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{KIND_LABEL[r.kind] ?? r.kind}</Badge>
                  </TableCell>
                  <TableCell className="max-w-md min-w-60 whitespace-normal">
                    <span className="block font-medium text-navy-900">{r.title}</span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">{r.body}</span>
                  </TableCell>
                  <TableCell className="pr-4 text-center">
                    {r.booked ? (
                      <CheckIcon className="mx-auto size-4 text-success" aria-label="Booked" />
                    ) : (
                      <span className="text-muted-foreground" aria-label="Not booked">
                        –
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
