import {
  BadgeIndianRupeeIcon,
  BellRingIcon,
  FlameIcon,
  HexagonIcon,
  IdCardIcon,
  LayoutDashboardIcon,
  MegaphoneIcon,
  RadarIcon,
  RouteIcon,
  ServerCogIcon,
  SettingsIcon,
  ShieldAlertIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

/** One page (URL). Pages of the same sidebar item are shown as tabs above the page. */
export interface NavPage {
  readonly href: string;
  readonly label: string;
  /** Top-bar search hint when this list page is open (pages that support ?q). */
  readonly searchHint?: string;
}

/** A sidebar entry: one page, or several related pages shown as tabs (the link opens the first). */
export interface NavItem {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly pages: readonly [NavPage, ...NavPage[]];
}

export interface NavGroup {
  readonly label: string;
  readonly items: readonly NavItem[];
}

/** Where a sidebar item links to: its first page. */
export function hrefOf(item: NavItem): string {
  return item.pages[0].href;
}

/** True when the item's pages show as tabs. */
export function hasTabs(item: NavItem): boolean {
  return item.pages.length > 1;
}

/** Sidebar collections: about a dozen items, related pages grouped as tabs under one item. */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", icon: LayoutDashboardIcon, pages: [{ href: "/", label: "Dashboard" }] },
      { label: "Live map", icon: RadarIcon, pages: [{ href: "/live", label: "Live map" }] },
      { label: "Heatmap", icon: FlameIcon, pages: [{ href: "/heatmap", label: "Heatmap" }] },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Trips",
        icon: RouteIcon,
        pages: [
          { href: "/trips", label: "All trips", searchHint: "Search trips by id, pickup or drop" },
          { href: "/cancellation-fees", label: "Cancellation fees" },
        ],
      },
      {
        label: "SOS & support",
        icon: ShieldAlertIcon,
        pages: [
          { href: "/safety", label: "SOS alerts" },
          { href: "/support", label: "Support" },
        ],
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        label: "Drivers",
        icon: IdCardIcon,
        pages: [
          { href: "/drivers", label: "All drivers", searchHint: "Search drivers by name, phone or plate" },
          { href: "/drivers/approvals", label: "Approvals", searchHint: "Search approvals by name, phone or plate" },
          { href: "/kyc", label: "Documents" },
        ],
      },
      {
        label: "Riders",
        icon: UsersIcon,
        pages: [
          { href: "/passengers", label: "Riders", searchHint: "Search riders by name or phone" },
          { href: "/users", label: "All accounts", searchHint: "Search all accounts by name, phone or email" },
        ],
      },
    ],
  },
  {
    label: "Engage",
    items: [
      {
        label: "Automations",
        icon: BellRingIcon,
        pages: [
          { href: "/automations", label: "Reminders" },
          { href: "/automations/campaigns", label: "Campaigns" },
        ],
      },
      {
        label: "Announcements",
        icon: MegaphoneIcon,
        pages: [
          { href: "/announcements", label: "Announcements" },
          { href: "/promos", label: "Splash & banners" },
        ],
      },
    ],
  },
  {
    label: "Setup",
    items: [
      { label: "Cities & zones", icon: HexagonIcon, pages: [{ href: "/cities", label: "Cities & zones" }] },
      { label: "Settings", icon: SettingsIcon, pages: [{ href: "/settings", label: "Settings" }] },
      {
        label: "Driver plans",
        icon: BadgeIndianRupeeIcon,
        pages: [
          { href: "/plans", label: "Plans" },
          { href: "/payments", label: "Payments" },
        ],
      },
      {
        label: "System",
        icon: ServerCogIcon,
        pages: [
          { href: "/audit", label: "Audit log", searchHint: "Search audit log by action" },
          { href: "/travel-speeds", label: "Travel speeds" },
        ],
      },
    ],
  },
];

export const NAV: readonly NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** The group a nav item sits in (its collection). */
export function groupOf(item: NavItem): NavGroup {
  return NAV_GROUPS.find((g) => g.items.includes(item)) ?? NAV_GROUPS[0];
}

export interface ActivePage {
  readonly item: NavItem;
  readonly page: NavPage;
  /** The path is the page itself, not a detail page under it ("/drivers" vs "/drivers/abc"). */
  readonly isExact: boolean;
}

/**
 * The sidebar item and page a path belongs to, the longest page match winning: "/drivers/abc" → Drivers › All
 * drivers (a detail page), "/drivers/approvals" → Drivers › Approvals, "/kyc" → Drivers › Documents.
 */
export function activePage(pathname: string): ActivePage {
  let best: { item: NavItem; page: NavPage } | undefined;
  for (const item of NAV) {
    for (const page of item.pages) {
      const isMatch = page.href === "/" ? pathname === "/" : pathname === page.href || pathname.startsWith(`${page.href}/`);
      if (isMatch && (!best || page.href.length > best.page.href.length)) best = { item, page };
    }
  }
  const found = best ?? { item: NAV[0], page: NAV[0].pages[0] };
  return { ...found, isExact: pathname === found.page.href };
}

/** The sidebar item a path belongs to (detail pages included). */
export function activeNav(pathname: string): NavItem {
  return activePage(pathname).item;
}

/** Every page in sidebar order, with its item and group (the command palette lists these). */
export const NAV_PAGES: readonly { page: NavPage; item: NavItem; group: NavGroup }[] = NAV_GROUPS.flatMap((group) =>
  group.items.flatMap((item) => item.pages.map((page) => ({ page, item, group }))),
);

/** Default target of the top-bar search when the open page has no search. */
export const DEFAULT_SEARCH: NavPage = NAV_PAGES.find((p) => p.page.href === "/drivers")!.page;
