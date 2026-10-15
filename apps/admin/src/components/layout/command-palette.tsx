"use client";

import { ArrowRightIcon, CarIcon, FileSearchIcon, Loader2Icon, RouteIcon, SearchIcon, UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { paletteItems, type PaletteGroup, type PalettePage } from "@/lib/palette";
import type { SearchResults } from "@/lib/types";
import { cn } from "@/lib/utils";

import { DEFAULT_SEARCH, NAV_PAGES, activePage, hasTabs, type NavGroup, type NavItem } from "./nav";

/** Where a page sits, shown next to it: "People › Drivers" for a tab, the group for a single page. */
function placeOf(item: NavItem, group: NavGroup): string {
  return hasTabs(item) ? `${group.label} › ${item.label}` : group.label;
}

// Every page, each tab included, so "approvals" or "payments" still finds its page.
const PAGES: readonly PalettePage[] = NAV_PAGES.map(({ page, item, group }) => ({ href: page.href, label: page.label, group: placeOf(item, group), searchHint: page.searchHint }));

const GROUP_ICON: Record<PaletteGroup, typeof SearchIcon> = {
  Search: SearchIcon,
  Pages: ArrowRightIcon,
  Drivers: CarIcon,
  "Riders & accounts": UserIcon,
  Trips: RouteIcon,
};

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/**
 * The top-bar search (Ctrl+K / ⌘K, or "/"): jump to any page, search the open list, or open a driver, rider or trip
 * straight from GET /admin/search (through /api/search). Arrow keys move, Enter opens, Esc closes.
 */
export function CommandPalette({ pathname }: { pathname: string }) {
  const router = useRouter();
  const [isOpen, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const open = activePage(pathname);
  const current: PalettePage = { href: open.page.href, label: open.page.label, group: open.item.label, searchHint: open.isExact ? open.page.searchHint : undefined };
  const fallback: PalettePage = { href: DEFAULT_SEARCH.href, label: DEFAULT_SEARCH.label, group: "Drivers", searchHint: DEFAULT_SEARCH.searchHint };
  const items = paletteItems({ q, current, fallbackSearch: fallback, pages: PAGES, results });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !isTyping(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Live results, debounced; an older request never overwrites a newer one.
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(text)}`, { signal: ctrl.signal });
        if (res.ok) setResults((await res.json()) as SearchResults);
      } catch {
        // Aborted or offline: keep the pages list.
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  function change(value: string) {
    setQ(value);
    setActive(0);
    if (value.trim().length < 2) setResults(null);
  }

  function go(index: number) {
    const item = items[index];
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  }

  function onOpenChange(open: boolean) {
    setOpen(open);
    if (!open) {
      setQ("");
      setResults(null);
      setActive(0);
    }
  }

  // Keep the highlighted row in view.
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-full max-w-sm items-center gap-2 rounded-lg border border-transparent bg-muted/60 px-3 text-left text-sm text-muted-foreground transition-colors hover:border-border md:flex"
      >
        <SearchIcon className="size-4" aria-hidden />
        <span className="flex-1 truncate">Search drivers, riders, trips or pages</span>
        <kbd className="rounded border bg-card px-1.5 font-sans text-[11px] text-muted-foreground">Ctrl K</kbd>
      </button>
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted md:hidden" aria-label="Search">
        <SearchIcon className="size-5" />
      </button>

      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false} className="top-[15%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">Find a page, driver, rider or trip</DialogDescription>
          <div className="flex items-center gap-2 border-b px-3">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => change(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(items.length - 1, i + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(0, i - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(active);
                }
              }}
              placeholder="Name, phone, plate, trip id (#E0TVH8TX), place or page"
              aria-label="Search"
              role="combobox"
              aria-expanded
              aria-controls="palette-list"
              aria-activedescendant={items[active] ? `palette-${active}` : undefined}
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {isLoading && <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-label="Searching" />}
          </div>
          <div ref={listRef} id="palette-list" role="listbox" className="max-h-[60vh] overflow-y-auto p-1.5">
            {items.length === 0 ? (
              <p className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <FileSearchIcon className="size-4" /> Nothing found for “{q.trim()}”.
              </p>
            ) : (
              items.map((item, index) => {
                const showHeader = item.group !== items[index - 1]?.group;
                const Icon = GROUP_ICON[item.group];
                return (
                  <div key={item.id}>
                    {showHeader && item.group !== "Search" && (
                      <p className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{item.group}</p>
                    )}
                    <button
                      type="button"
                      id={`palette-${index}`}
                      role="option"
                      aria-selected={index === active}
                      data-index={index}
                      onMouseMove={() => setActive(index)}
                      onClick={() => go(index)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-navy-900",
                        index === active && "bg-coral-50 text-coral-700",
                      )}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.hint && <span className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">{item.hint}</span>}
                    </button>
                  </div>
                );
              })
            )}
          </div>
          <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">↑ ↓ to move · Enter to open · Esc to close · Ctrl K or / from any page</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
