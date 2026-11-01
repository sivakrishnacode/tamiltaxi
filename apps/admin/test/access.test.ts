import { describe, expect, it } from "vitest";

import { accessLabel, canManageCity, canOpen, isCityAdmin, isOwner } from "@/lib/access";

const owner = { adminLevel: "OWNER" as const };
const support = { adminLevel: "SUPPORT" as const, adminCityIds: [] };
const tiruppur = { adminLevel: "SUPPORT" as const, adminCityIds: ["tiruppur"] };

describe("admin access", () => {
  it("treats a session without a level as an owner (they all were)", () => {
    expect(isOwner({})).toBe(true);
    expect(isOwner(null)).toBe(true);
    expect(isOwner(support)).toBe(false);
  });

  it("keeps support off owner-only pages, not off day-to-day ones", () => {
    for (const path of ["/settings", "/plans", "/payments", "/announcements", "/promos", "/automations/campaigns"]) {
      expect(canOpen(support, path)).toBe(false);
      expect(canOpen(owner, path)).toBe(true);
    }
    for (const path of ["/", "/trips/missed", "/drivers/abc", "/kyc", "/support", "/system", "/settings-x"]) expect(canOpen(support, path)).toBe(true);
  });

  it("lets a city admin open the city list and their own cities only", () => {
    expect(isCityAdmin(tiruppur)).toBe(true);
    expect(isCityAdmin(support)).toBe(false);
    expect(canOpen(tiruppur, "/cities")).toBe(true);
    expect(canOpen(tiruppur, "/cities/tiruppur")).toBe(true);
    expect(canOpen(tiruppur, "/cities/coimbatore")).toBe(false);
    expect(canOpen(support, "/cities")).toBe(false);
    expect(canManageCity(tiruppur, "tiruppur")).toBe(true);
    expect(canManageCity(owner, "coimbatore")).toBe(true);
  });

  it("labels the access", () => {
    expect(accessLabel(owner)).toBe("Owner");
    expect(accessLabel(support)).toBe("Support");
    expect(accessLabel(tiruppur, { tiruppur: "Tiruppur" })).toBe("City admin: Tiruppur");
  });
});
