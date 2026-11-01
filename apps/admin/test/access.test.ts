import { describe, expect, it } from "vitest";

import { can, canManageCity, canOpen, isOwner } from "@/lib/access";
import { permissionSummary } from "@/lib/permissions";

const owner = { adminLevel: "OWNER" as const };
const kyc = { adminLevel: "SUPPORT" as const, permissions: ["drivers.manage", "trips.view"], cityIds: [], cityScoped: false };
const cityManager = { adminLevel: "SUPPORT" as const, permissions: ["cities.manage"], cityIds: ["tiruppur"], cityScoped: true };

describe("admin access", () => {
  it("treats an access without a level as an owner", () => {
    expect(isOwner({})).toBe(true);
    expect(isOwner(null)).toBe(true);
    expect(isOwner(kyc)).toBe(false);
  });

  it("lets a role's change include view", () => {
    expect(can(kyc, "drivers.view")).toBe(true);
    expect(can(kyc, "trips.manage")).toBe(false);
    expect(can(owner, "exports")).toBe(true);
  });

  it("opens the pages a role allows, the team for owners only", () => {
    expect(canOpen(kyc, "/drivers/approvals")).toBe(true);
    expect(canOpen(kyc, "/kyc")).toBe(true);
    expect(canOpen(kyc, "/trips/missed")).toBe(true);
    expect(canOpen(kyc, "/users")).toBe(false);
    expect(canOpen(kyc, "/settings")).toBe(false);
    expect(canOpen(kyc, "/cancellation-fees")).toBe(false);
    expect(canOpen(kyc, "/team")).toBe(false);
    expect(canOpen(kyc, "/")).toBe(true);
    expect(canOpen(owner, "/team/roles")).toBe(true);
  });

  it("keeps a city-limited role to its own cities", () => {
    expect(canOpen(cityManager, "/cities")).toBe(true);
    expect(canOpen(cityManager, "/cities/tiruppur")).toBe(true);
    expect(canOpen(cityManager, "/cities/coimbatore")).toBe(false);
    expect(canManageCity(cityManager, "tiruppur")).toBe(true);
    expect(canManageCity(cityManager, "coimbatore")).toBe(false);
    expect(canManageCity(kyc, "tiruppur")).toBe(false);
  });

  it("sums up a role", () => {
    expect(permissionSummary(["trips.manage", "riders.view", "exports"])).toBe("Trips: change · Riders & accounts: view · Download CSV exports");
    expect(permissionSummary([])).toBe("Dashboard only");
  });
});
