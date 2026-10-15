import Link from "next/link";

import { cn } from "@/lib/utils";

export interface PageTab {
  readonly href: string;
  readonly label: string;
  /** Counter next to the label (e.g. documents waiting for review). */
  readonly badge?: React.ReactNode;
}

/**
 * Related pages as tabs (plain links, so every tab keeps its own URL). Underlined, unlike the pill-shaped filter
 * tabs inside a page; scrolls sideways on phones.
 */
export function PageTabs({ tabs, active, label }: { tabs: readonly PageTab[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="mb-6 border-b">
      <ul className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => {
          const isActive = t.href === active;
          return (
            <li key={t.href} className="shrink-0">
              <Link
                href={t.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 border-b-2 px-3 pt-1 pb-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                  isActive
                    ? "border-coral-600 text-navy-900"
                    : "border-transparent text-muted-foreground hover:border-navy-300 hover:text-navy-900",
                )}
              >
                {t.label}
                {t.badge}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
