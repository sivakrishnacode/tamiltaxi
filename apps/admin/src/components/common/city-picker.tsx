"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { groupByState, matchCities, type PickCity } from "@/lib/city-pick";
import { formatCount } from "@/lib/format";

/** Rows drawn at once; a search narrows the rest. */
const MAX_ROWS = 150;

/**
 * Picks any number of cities out of hundreds: the picked ones as removable chips, a search over city and state names,
 * results grouped by state with "Pick all" per state.
 */
export function CityPicker({ cities, value, onChange }: { cities: readonly PickCity[]; value: readonly string[]; onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(cities.map((c) => [c.id, c])), [cities]);
  const matches = useMemo(() => matchCities(cities, query), [cities, query]);
  const shown = matches.slice(0, MAX_ROWS);
  const picked = new Set(value);

  const toggle = (id: string) => onChange(picked.has(id) ? value.filter((x) => x !== id) : [...value, id]);
  const pickAll = (ids: readonly string[]) => onChange([...new Set([...value, ...ids])]);

  return (
    <div className="grid gap-2">
      {value.length > 0 && (
        <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
          {value.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-coral-50 py-0.5 pr-1 pl-2.5 text-xs font-medium text-coral-700">
              {byId.get(id)?.name ?? id}
              <button type="button" className="rounded-full p-0.5 hover:bg-coral-100" aria-label={`Remove ${byId.get(id)?.name ?? id}`} onClick={() => toggle(id)}>
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search cities or states" className="pl-8" aria-label="Search cities" />
      </div>
      <div className="max-h-56 overflow-y-auto rounded-lg border">
        {shown.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">No city matches “{query}”.</p>
        ) : (
          groupByState(shown).map((g) => {
            const unpicked = g.cities.filter((c) => !picked.has(c.id)).map((c) => c.id);
            return (
              <div key={g.state}>
                <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-muted/80 px-3 py-1 backdrop-blur">
                  <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{g.state}</span>
                  {unpicked.length > 1 && (
                    <button type="button" className="text-[11px] font-medium text-coral-600 hover:underline" onClick={() => pickAll(unpicked)}>
                      Pick all {formatCount(g.cities.length)}
                    </button>
                  )}
                </div>
                <ul className="divide-y">
                  {g.cities.map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/50">
                        <input type="checkbox" className="size-4 accent-coral-600" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                        <span className="text-navy-900">{c.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
        {matches.length > shown.length && (
          <p className="border-t px-3 py-2 text-center text-xs text-muted-foreground">
            {formatCount(matches.length - shown.length)} more: search to narrow the list
          </p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {formatCount(value.length)} of {formatCount(cities.length)} cities picked
        {value.length > 0 && (
          <>
            {" · "}
            <button type="button" className="font-medium text-coral-600 hover:underline" onClick={() => onChange([])}>
              Clear
            </button>
          </>
        )}
      </p>
    </div>
  );
}
