import { CheckIcon, HistoryIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, PageHeader } from "@/components/common/page";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, adminApi } from "@/lib/api";
import { filterHistory, HISTORY_FILTERS, historyItems, isHistoryFilter, type HistoryItem } from "@/lib/engage";
import { formatDateTime, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ChannelBadge } from "../automations/flow";

export const metadata: Metadata = { title: "Engage history" };

/** null when this API doesn't have the endpoint yet (404). */
function orNull<T>(p: Promise<T>): Promise<T | null> {
  return p.catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  });
}

function Result({ result }: { result: HistoryItem["result"] }) {
  if (result.tone === "good") {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-success-text">
        <CheckIcon className="size-4" aria-hidden /> {result.label}
      </span>
    );
  }
  return (
    <>
      <span className={cn("block text-sm", result.tone === "bad" ? "font-medium text-error" : "text-navy-700")}>{result.label}</span>
      {result.detail && <span className="line-clamp-2 text-xs text-muted-foreground">{result.detail}</span>}
    </>
  );
}

export default async function EngageHistoryPage({ searchParams }: PageProps<"/engage/history">) {
  const sp = await searchParams;
  const filter = isHistoryFilter(sp.type) ? sp.type : "all";
  const [automations, welcome, campaigns, announcements] = await Promise.all([
    orNull(adminApi.automations()),
    orNull(adminApi.welcomeMessages()),
    adminApi.campaigns(),
    adminApi.announcements(),
  ]);
  const all = historyItems({ reminders: automations?.recent, welcomes: welcome?.recent, campaigns, announcements });
  const items = filterHistory(all, filter);

  return (
    <>
      <PageHeader title="History" description="Every message that went out, newest first: reminders, WhatsApp welcomes, campaigns and announcements." />
      <nav aria-label="Filter history" className="mb-4 flex flex-wrap gap-2">
        {HISTORY_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/engage/history" : `/engage/history?type=${f.key}`}
            aria-current={f.key === filter ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              f.key === filter ? "border-navy-900 bg-navy-900 text-white" : "bg-card text-navy-700 hover:border-navy-300",
            )}
          >
            {f.label}
            <span className="ml-1.5 tabular-nums opacity-70">{filterHistory(all, f.key).length}</span>
          </Link>
        ))}
      </nav>
      <Card className="gap-0 py-0">
        {items.length === 0 ? (
          <EmptyState icon={HistoryIcon} title="Nothing here yet" description="Messages show up here as they go out." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">When</TableHead>
                <TableHead>To</TableHead>
                <TableHead>What</TableHead>
                <TableHead>Message</TableHead>
                <TableHead className="pr-4">Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="pl-4 whitespace-nowrap text-navy-700">{formatDateTime(i.at)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {i.who.href ? (
                      <Link href={i.who.href} className="font-medium text-navy-900 hover:text-coral-600">
                        {i.who.name.startsWith("+") ? formatPhone(i.who.name) : i.who.name}
                      </Link>
                    ) : (
                      <span className="font-medium text-navy-900">{i.who.name}</span>
                    )}
                    {i.who.phone && <span className="block text-xs text-muted-foreground">{formatPhone(i.who.phone)}</span>}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <ChannelBadge channel={i.channel} />
                      <Badge variant="outline">{i.label}</Badge>
                    </span>
                  </TableCell>
                  <TableCell className="max-w-md min-w-60 whitespace-normal">
                    <span className="block font-medium text-navy-900">{i.title}</span>
                    <span className={cn("line-clamp-2 text-xs text-muted-foreground", i.type === "WELCOME" && "font-mono")}>{i.body}</span>
                  </TableCell>
                  <TableCell className="max-w-xs min-w-32 pr-4 whitespace-normal">
                    <Result result={i.result} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">Shows the latest 50 reminders and 30 WhatsApp welcomes, with every sent campaign and announcement.</p>
    </>
  );
}
