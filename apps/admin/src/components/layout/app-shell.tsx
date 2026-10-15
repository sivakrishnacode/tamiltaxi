"use client";

import { ChevronDownIcon, MenuIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";

import { Wordmark } from "@/components/common/wordmark";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { CommandPalette } from "./command-palette";
import { NAV_GROUPS, activePage, groupOf, hasTabs, hrefOf } from "./nav";
import { PageTabs } from "./page-tabs";

// Collapsed sidebar groups, per browser (a convenience: everything works without storage).
const COLLAPSED_KEY = "tt-admin-nav-collapsed";
const COLLAPSED_EVENT = "tt-admin-nav-collapsed";

function subscribeCollapsed(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(COLLAPSED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(COLLAPSED_EVENT, onChange);
  };
}

function readCollapsed(): string {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeCollapsed(labels: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, [...labels].join("|"));
  } catch {
    // Private window or blocked storage: the group still toggles until the next render.
  }
  window.dispatchEvent(new Event(COLLAPSED_EVENT));
}

function SidebarNav({
  pathname,
  badges,
  tags,
  onNavigate,
}: {
  pathname: string;
  badges?: Record<string, React.ReactNode>;
  tags?: Record<string, React.ReactNode>;
  onNavigate?: () => void;
}) {
  const current = activePage(pathname).item;
  const currentGroup = groupOf(current);
  const raw = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => "");
  const collapsed = useMemo(() => new Set(raw ? raw.split("|") : []), [raw]);

  return (
    <nav aria-label="Main" className="flex flex-col gap-3">
      {NAV_GROUPS.map((group) => {
        // The collection holding the open page always stays open.
        const isOpen = group === currentGroup || !collapsed.has(group.label);
        const listId = `nav-${group.label.toLowerCase().replace(/\W+/g, "-")}`;
        return (
          <div key={group.label} className="flex flex-col gap-0.5">
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={listId}
              disabled={group === currentGroup}
              onClick={() => {
                const next = new Set(collapsed);
                if (next.has(group.label)) next.delete(group.label);
                else next.add(group.label);
                writeCollapsed(next);
              }}
              className="group/nav flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase hover:text-navy-900 disabled:cursor-default disabled:hover:text-muted-foreground"
            >
              <span className="flex-1 text-left">{group.label}</span>
              {/* Badges of a closed collection move to its header, so nothing urgent is hidden. */}
              {!isOpen && group.items.map((item) => <span key={item.label}>{badges?.[hrefOf(item)]}</span>)}
              {group !== currentGroup && (
                <ChevronDownIcon className={cn("size-3.5 transition-transform", !isOpen && "-rotate-90")} aria-hidden />
              )}
            </button>
            {isOpen && (
              <ul id={listId} className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const isActive = item === current;
                  const href = hrefOf(item);
                  const Icon = item.icon;
                  return (
                    <li key={item.label}>
                      <Link
                        href={href}
                        onClick={onNavigate}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium text-navy-700 transition-colors hover:bg-muted hover:text-navy-900",
                          isActive && "bg-coral-50 text-coral-600 hover:bg-coral-50 hover:text-coral-600",
                        )}
                      >
                        <Icon className="size-4.5" aria-hidden />
                        <span className="flex-1">{item.label}</span>
                        {tags?.[href]}
                        {badges?.[href]}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/** Sidebar (desktop) / sheet (mobile) + top bar around every signed-in page. */
export function AppShell({
  userMenu,
  badges,
  tabBadges,
  tags,
  children,
}: {
  userMenu: React.ReactNode;
  /**
   * Server-rendered counters next to sidebar items, keyed by the item's link (its first page, e.g. "/drivers" for
   * approvals + documents together); shown on a collapsed group too.
   */
  badges?: Record<string, React.ReactNode>;
  /** Counters on the page tabs, keyed by page href (e.g. "/kyc"). */
  tabBadges?: Record<string, React.ReactNode>;
  /** Quiet labels next to sidebar items (e.g. "Off"), only on the item itself. */
  tags?: Record<string, React.ReactNode>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isMenuOpen, setMenuOpen] = useState(false);
  const { item: section, isExact } = activePage(pathname);
  // Related pages show as tabs on each of them (not on detail pages like /drivers/abc).
  const tabs = hasTabs(section) && isExact ? section.pages.map((p) => ({ href: p.href, label: p.label, badge: tabBadges?.[p.href] })) : null;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col overflow-y-auto border-r bg-sidebar px-4 py-6 lg:flex">
        <Link href="/" className="mb-6 px-3" aria-label="Tamil Taxi admin home">
          <Wordmark className="text-[28px]" />
          <span className="mt-1 block text-xs font-medium tracking-wide text-muted-foreground uppercase">Admin</span>
        </Link>
        <SidebarNav pathname={pathname} badges={badges} tags={tags} />
        <p className="mt-auto px-3 pt-6 text-xs text-muted-foreground">Zero-commission rides &amp; parcels</p>
      </aside>

      <Sheet open={isMenuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 overflow-y-auto px-4 py-6">
          <SheetHeader className="mb-4 p-0 px-3">
            <SheetTitle>
              <Wordmark className="text-[28px]" />
            </SheetTitle>
            <SheetDescription>Admin</SheetDescription>
          </SheetHeader>
          <SidebarNav pathname={pathname} badges={badges} tags={tags} onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
            <MenuIcon />
          </Button>
          <p className="font-heading text-lg font-semibold text-navy-900 lg:hidden">{section.label}</p>
          <CommandPalette pathname={pathname} />
          <div className="ml-auto">{userMenu}</div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
          {tabs && <PageTabs tabs={tabs} active={pathname} label={section.label} />}
          {children}
        </main>
      </div>
    </div>
  );
}
