import { describe, expect, it } from "vitest";

import { backupLevel, formatBytes, formatUptime, levelOf, mapsUse } from "@/lib/system";
import type { SystemHealth } from "@/lib/types";

describe("server health helpers", () => {
  it("formats bytes and uptime", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(860 * 1024 * 1024)).toBe("860 MB");
    expect(formatBytes(2.04 * 1024 ** 3)).toBe("2.0 GB");
    expect(formatBytes(null)).toBe("–");
    expect(formatUptime(8 * 60)).toBe("8 min");
    expect(formatUptime(5 * 3600 + 12 * 60)).toBe("5 h 12 min");
    expect(formatUptime(76 * 3600)).toBe("3 days 4 h");
  });

  it("calls 70% watch and 90% act", () => {
    expect(levelOf(0.5)).toBe("ok");
    expect(levelOf(0.7)).toBe("watch");
    expect(levelOf(0.95)).toBe("act");
  });

  it("projects the month from its pace", () => {
    const health = {
      usage: {
        today: { "maps.matrix_elements": 300 },
        month: { "maps.matrix_elements": 21_000 },
        freePerMonth: { "maps.matrix_elements": 70_000 },
      },
    } as unknown as SystemHealth;
    // Noon IST on 11 Nov: 10.5 of 30 days gone.
    const use = mapsUse(health, "maps.matrix_elements", new Date("2026-11-11T06:30:00Z"));
    expect(use).toEqual({ today: 300, month: 21_000, free: 70_000, share: 0.3, projected: 60_000 });
    expect(mapsUse(health, "maps.autocomplete", new Date("2026-11-11T06:30:00Z")).free).toBeNull();
    // Too early in the month to project.
    expect(mapsUse(health, "maps.matrix_elements", new Date("2026-11-02T06:30:00Z")).projected).toBeNull();
  });

  it("wants a backup from the last 2 days", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    expect(backupLevel("2026-11-09T12:00:00Z", now)).toBe("ok");
    expect(backupLevel("2026-11-05T12:00:00Z", now)).toBe("watch");
    expect(backupLevel("2026-10-01T12:00:00Z", now)).toBe("act");
    expect(backupLevel(null, now)).toBe("act");
  });
});
