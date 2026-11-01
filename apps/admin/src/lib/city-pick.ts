// Picking cities from a long list (hundreds of cities): search by city or state, grouped by state (unit-tested).

export interface PickCity {
  readonly id: string;
  readonly name: string;
  readonly state: string;
}

/** Cities whose name or state contains [query] (any case), sorted by state, then name. */
export function matchCities(cities: readonly PickCity[], query: string): PickCity[] {
  const q = query.trim().toLowerCase();
  return cities
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.state.toLowerCase().includes(q))
    .sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
}

/** [cities] (already sorted) in runs of the same state. */
export function groupByState(cities: readonly PickCity[]): { state: string; cities: PickCity[] }[] {
  const groups: { state: string; cities: PickCity[] }[] = [];
  for (const c of cities) {
    const last = groups[groups.length - 1];
    if (last?.state === c.state) last.cities.push(c);
    else groups.push({ state: c.state, cities: [c] });
  }
  return groups;
}

/** "Coimbatore, Tiruppur, Erode +4 more" for a table cell. */
export function citiesShort(ids: readonly string[], names: ReadonlyMap<string, string>, shown = 3): string {
  const labels = ids.map((id) => names.get(id) ?? id);
  return labels.length > shown ? `${labels.slice(0, shown).join(", ")} +${labels.length - shown} more` : labels.join(", ");
}
