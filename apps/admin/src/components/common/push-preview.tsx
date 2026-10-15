import { CarTaxiFrontIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** A phone notification as the rider sees it: app name, bold title, message. Empty parts show a placeholder. */
export function PushPreview({ title, body, caption, className }: { title: string; body: string; caption?: string; className?: string }) {
  return (
    <figure className={cn("grid gap-1.5", className)}>
      <div className="rounded-2xl bg-muted/70 p-3 ring-1 ring-foreground/5">
        <div className="flex items-start gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-coral-600 text-white" aria-hidden>
            <CarTaxiFrontIcon className="size-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground">
              <span className="font-medium text-navy-700">Tamil Taxi</span> · now
            </p>
            <p className={cn("truncate text-sm font-semibold", title.trim() ? "text-navy-900" : "text-muted-foreground")}>{title.trim() || "Title"}</p>
            <p className={cn("line-clamp-3 text-xs leading-relaxed break-words", body.trim() ? "text-navy-700" : "text-muted-foreground")}>
              {body.trim() || "Message"}
            </p>
          </div>
        </div>
      </div>
      {caption && <figcaption className="px-1 text-[11px] text-muted-foreground">{caption}</figcaption>}
    </figure>
  );
}
