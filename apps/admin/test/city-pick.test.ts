import { describe, expect, it } from "vitest";

import { citiesShort, groupByState, matchCities } from "@/lib/city-pick";

const cities = [
  { id: "tiruppur", name: "Tiruppur", state: "Tamil Nadu" },
  { id: "kochi", name: "Kochi", state: "Kerala" },
  { id: "coimbatore", name: "Coimbatore", state: "Tamil Nadu" },
  { id: "erode", name: "Erode", state: "Tamil Nadu" },
];

describe("city picking", () => {
  it("finds cities by city or state name, sorted by state then name", () => {
    expect(matchCities(cities, "").map((c) => c.id)).toEqual(["kochi", "coimbatore", "erode", "tiruppur"]);
    expect(matchCities(cities, "tir").map((c) => c.id)).toEqual(["tiruppur"]);
    expect(matchCities(cities, "  KERALA ").map((c) => c.id)).toEqual(["kochi"]);
  });

  it("groups by state", () => {
    expect(groupByState(matchCities(cities, "")).map((g) => [g.state, g.cities.length])).toEqual([
      ["Kerala", 1],
      ["Tamil Nadu", 3],
    ]);
  });

  it("shortens a long list for a table", () => {
    const names = new Map(cities.map((c) => [c.id, c.name]));
    expect(citiesShort(["coimbatore", "erode"], names)).toBe("Coimbatore, Erode");
    expect(citiesShort(["coimbatore", "erode", "tiruppur", "kochi", "x"], names)).toBe("Coimbatore, Erode, Tiruppur +2 more");
  });
});
