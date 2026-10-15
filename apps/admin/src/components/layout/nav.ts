import {
  BadgeIndianRupeeIcon,
  ClipboardCheckIcon,
  FlameIcon,
  GaugeIcon,
  HexagonIcon,
  IdCardIcon,
  ImagesIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  MegaphoneIcon,
  RadarIcon,
  ReceiptIndianRupeeIcon,
  RouteIcon,
  ScrollTextIcon,
  SettingsIcon,
  ShieldAlertIcon,
  UserCheckIcon,
  UserCogIcon,
  UsersIcon,
  WalletCardsIcon,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Top-bar search hint when this list page is open (pages that support ?q). */
  readonly searchHint?: string;
}

export interface NavGroup {
  readonly label: string;
  readonly items: readonly NavItem[];
}

/** Sidebar collections: one per thing an admin looks after (drivers, riders, trips, money, the platform). */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboardIcon },
      { href: "/live", label: "Live map", icon: RadarIcon },
      { href: "/heatmap", label: "Heatmap", icon: FlameIcon },
    ],
  },
  {
    label: "Drivers",
    items: [
      { href: "/drivers", label: "All drivers", icon: IdCardIcon, searchHint: "Search drivers by name, phone or plate" },
      { href: "/drivers/approvals", label: "Approvals", icon: UserCheckIcon, searchHint: "Search approvals by name, phone or plate" },
      { href: "/kyc", label: "Documents", icon: ClipboardCheckIcon },
    ],
  },
  {
    label: "Riders",
    items: [
      { href: "/passengers", label: "All riders", icon: UsersIcon, searchHint: "Search riders by name or phone" },
      { href: "/users", label: "All accounts", icon: UserCogIcon, searchHint: "Search all accounts by name, phone or email" },
    ],
  },
  {
    label: "Trips",
    items: [
      { href: "/trips", label: "All trips", icon: RouteIcon, searchHint: "Search trips by id, pickup or drop" },
      { href: "/safety", label: "SOS alerts", icon: ShieldAlertIcon },
      { href: "/support", label: "Support", icon: LifeBuoyIcon },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/cancellation-fees", label: "Cancellation fees", icon: ReceiptIndianRupeeIcon },
      { href: "/plans", label: "Driver plans", icon: BadgeIndianRupeeIcon },
      { href: "/payments", label: "Plan payments", icon: WalletCardsIcon },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/cities", label: "Cities & zones", icon: HexagonIcon },
      { href: "/announcements", label: "Announcements", icon: MegaphoneIcon },
      { href: "/promos", label: "Splash & banners", icon: ImagesIcon },
      { href: "/settings", label: "Settings", icon: SettingsIcon },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/audit", label: "Audit log", icon: ScrollTextIcon, searchHint: "Search audit log by action" },
      { href: "/travel-speeds", label: "Travel speeds", icon: GaugeIcon },
    ],
  },
];

/** The group a nav item sits in (its collection). */
export function groupOf(item: NavItem): NavGroup {
  return NAV_GROUPS.find((g) => g.items.includes(item)) ?? NAV_GROUPS[0];
}

export const NAV: readonly NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** The nav item a path belongs to, the longest match winning ("/drivers/abc" → Drivers, "/drivers/approvals" → Approvals). */
export function activeNav(pathname: string): NavItem {
  const matches = NAV.filter((n) => (n.href === "/" ? pathname === "/" : pathname === n.href || pathname.startsWith(`${n.href}/`)));
  return matches.reduce<NavItem | undefined>((best, n) => (!best || n.href.length > best.href.length ? n : best), undefined) ?? NAV[0];
}

/** Default target of the top-bar search when the open page has no search. */
export const DEFAULT_SEARCH: NavItem = NAV.find((n) => n.href === "/drivers")!;
