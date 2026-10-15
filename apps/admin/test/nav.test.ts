import { describe, expect, it } from "vitest";

import { DEFAULT_SEARCH, NAV, NAV_GROUPS, NAV_PAGES, activeNav, activePage, groupOf, hasTabs, hrefOf } from "@/components/layout/nav";

describe("activePage", () => {
  it("picks the longest matching page", () => {
    expect(activePage("/").page.href).toBe("/");
    expect(activePage("/drivers").page.href).toBe("/drivers");
    expect(activePage("/drivers/approvals").page.href).toBe("/drivers/approvals");
    expect(activePage("/automations/campaigns").page.href).toBe("/automations/campaigns");
    expect(activePage("/automations").page.href).toBe("/automations");
  });

  it("tells a tab page from a detail page under it", () => {
    expect(activePage("/drivers").isExact).toBe(true);
    expect(activePage("/drivers/cm123")).toMatchObject({ page: { href: "/drivers" }, isExact: false });
    expect(activePage("/trips/abc").isExact).toBe(false);
  });

  it("falls back to the dashboard for unknown paths", () => {
    expect(activeNav("/nowhere").label).toBe("Dashboard");
    expect(activePage("/nowhere").isExact).toBe(false);
  });
});

describe("activeNav", () => {
  it("maps every tab and detail page to its sidebar item", () => {
    const cases: Record<string, string> = {
      "/": "Dashboard",
      "/live": "Live map",
      "/heatmap": "Heatmap",
      "/trips": "Trips",
      "/trips/abc": "Trips",
      "/cancellation-fees": "Trips",
      "/safety": "SOS & support",
      "/support": "SOS & support",
      "/drivers": "Drivers",
      "/drivers/cm123": "Drivers",
      "/drivers/approvals": "Drivers",
      "/kyc": "Drivers",
      "/passengers": "Riders",
      "/users": "Riders",
      "/users/abc": "Riders",
      "/automations": "Automations",
      "/automations/campaigns": "Automations",
      "/announcements": "Announcements",
      "/promos": "Announcements",
      "/cities": "Cities & zones",
      "/cities/coimbatore": "Cities & zones",
      "/settings": "Settings",
      "/plans": "Driver plans",
      "/payments": "Driver plans",
      "/audit": "System",
      "/travel-speeds": "System",
    };
    for (const [path, label] of Object.entries(cases)) expect(activeNav(path).label, path).toBe(label);
  });

  it("puts each item in its collection", () => {
    expect(groupOf(activeNav("/drivers/approvals")).label).toBe("People");
    expect(groupOf(activeNav("/users/abc")).label).toBe("People");
    expect(groupOf(activeNav("/safety")).label).toBe("Operations");
    expect(groupOf(activeNav("/automations/campaigns")).label).toBe("Engage");
    expect(groupOf(activeNav("/payments")).label).toBe("Setup");
  });
});

describe("NAV", () => {
  it("keeps the sidebar short enough to fit without scrolling", () => {
    expect(NAV.length).toBeLessThanOrEqual(13);
    expect(NAV_GROUPS.every((g) => g.items.length > 0)).toBe(true);
  });

  it("lists every page once, each sidebar item linking to its first tab", () => {
    const hrefs = NAV_PAGES.map((p) => p.page.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(new Set(NAV.map((i) => i.label)).size).toBe(NAV.length);
    expect(hrefOf(activeNav("/kyc"))).toBe("/drivers");
    expect(hasTabs(activeNav("/kyc"))).toBe(true);
    expect(hasTabs(activeNav("/settings"))).toBe(false);
  });

  it("keeps the per-page search hints", () => {
    const hinted = NAV_PAGES.filter((p) => p.page.searchHint).map((p) => p.page.href);
    expect(hinted).toEqual(["/trips", "/drivers", "/drivers/approvals", "/passengers", "/users", "/audit"]);
    expect(DEFAULT_SEARCH.href).toBe("/drivers");
  });
});
