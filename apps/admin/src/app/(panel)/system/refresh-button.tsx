"use client";

import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";

/** Re-reads the page's numbers from the API. */
export function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <Button variant="outline" size="sm" disabled={isPending} onClick={() => startTransition(() => router.refresh())}>
      {isPending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} Refresh
    </Button>
  );
}
