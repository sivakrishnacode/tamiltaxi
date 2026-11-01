"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { vehicleLabel } from "@/lib/format";
import { VEHICLE_KINDS, type VehicleKind, type Zone, type ZoneKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toMinute, toTime, WEEK } from "@/lib/zone-rules";

/** The zone form's rule fields, as typed (times "07:30", dates for <input type="datetime-local">). */
export interface RulesDraft {
  days: number[];
  hasHours: boolean;
  from: string;
  to: string;
  startsAt: string;
  endsAt: string;
  vehicleKinds: VehicleKind[];
  blockPickups: boolean;
  blockDrops: boolean;
}

/** ISO → "2026-11-12T18:30" in the browser's time (India for our admins). */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function rulesDraftOf(z?: Zone): RulesDraft {
  const hasHours = z?.startMinute != null && z?.endMinute != null;
  return {
    days: [...(z?.days ?? [])],
    hasHours,
    from: hasHours ? toTime(z!.startMinute!) : "07:00",
    to: hasHours ? toTime(z!.endMinute!) : "10:00",
    startsAt: toLocalInput(z?.startsAt ?? null),
    endsAt: toLocalInput(z?.endsAt ?? null),
    vehicleKinds: [...(z?.vehicleKinds ?? [])],
    blockPickups: z?.blockPickups ?? true,
    blockDrops: z?.blockDrops ?? true,
  };
}

/** What is wrong with the rules, or null. */
export function rulesError(r: RulesDraft, kind: ZoneKind): string | null {
  if (r.hasHours) {
    const from = toMinute(r.from);
    const to = toMinute(r.to);
    if (from == null || to == null) return "Pick both times";
    if (from === to) return "The start and end time are the same";
  }
  if (r.startsAt && r.endsAt && new Date(r.endsAt) <= new Date(r.startsAt)) return "The end must be after the start";
  if (kind === "NO_SERVICE" && !r.blockPickups && !r.blockDrops) return "Stop pickups, drops or both";
  return null;
}

/** The API fields for [r] (fields that don't apply to [kind] keep their defaults). */
export function rulesPayload(r: RulesDraft, kind: ZoneKind) {
  return {
    days: r.days,
    startMinute: r.hasHours ? toMinute(r.from) : null,
    endMinute: r.hasHours ? toMinute(r.to) : null,
    startsAt: r.startsAt ? new Date(r.startsAt).toISOString() : null,
    endsAt: r.endsAt ? new Date(r.endsAt).toISOString() : null,
    vehicleKinds: kind === "SURGE" ? r.vehicleKinds : [],
    blockPickups: kind === "NO_SERVICE" ? r.blockPickups : true,
    blockDrops: kind === "NO_SERVICE" ? r.blockDrops : true,
  };
}

function Chip({ isOn, onClick, children, label }: { isOn: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={isOn}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "h-7 min-w-7 rounded-md border px-2 text-xs font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        isOn ? "border-coral-600 bg-coral-600 text-white" : "bg-card text-navy-700 hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

/** When the zone counts, which vehicles a surge covers, what a no-service zone stops. */
export function ZoneRulesFields({ kind, value, onChange }: { kind: ZoneKind; value: RulesDraft; onChange: (next: RulesDraft) => void }) {
  const set = (patch: Partial<RulesDraft>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-3 border-t pt-3">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium text-navy-900">When it counts</legend>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Days">
          {WEEK.map((w) => (
            <Chip key={w.day} isOn={value.days.includes(w.day)} label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][w.day]} onClick={() => set({ days: toggle(value.days, w.day) })}>
              {w.short}
            </Chip>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">No day picked = every day.</p>
        <label className="flex items-center justify-between gap-3 text-sm">
          Only at certain hours
          <Switch checked={value.hasHours} onCheckedChange={(on) => set({ hasHours: on })} aria-label="Only at certain hours" />
        </label>
        {value.hasHours && (
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label htmlFor="zone-from" className="text-xs">
                From
              </Label>
              <Input id="zone-from" type="time" value={value.from} onChange={(e) => set({ from: e.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="zone-to" className="text-xs">
                Until
              </Label>
              <Input id="zone-to" type="time" value={value.to} onChange={(e) => set({ to: e.target.value })} />
            </div>
            <p className="col-span-2 text-xs text-muted-foreground">India time. Past midnight works, e.g. 22:00 to 02:00.</p>
          </div>
        )}
        <div className="grid gap-2">
          <div className="grid gap-1">
            <Label htmlFor="zone-starts" className="text-xs">
              Starts (optional)
            </Label>
            <Input id="zone-starts" type="datetime-local" value={value.startsAt} onChange={(e) => set({ startsAt: e.target.value })} className="text-xs" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="zone-ends" className="text-xs">
              Ends (optional)
            </Label>
            <Input id="zone-ends" type="datetime-local" value={value.endsAt} onChange={(e) => set({ endsAt: e.target.value })} className="text-xs" />
          </div>
        </div>
      </fieldset>

      {kind === "SURGE" && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium text-navy-900">Vehicles</legend>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Vehicles">
            {VEHICLE_KINDS.map((k) => (
              <Chip key={k} isOn={value.vehicleKinds.includes(k)} onClick={() => set({ vehicleKinds: toggle(value.vehicleKinds, k) })}>
                {vehicleLabel(k)}
              </Chip>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">None picked = every vehicle. Autos charge the government fare: leave them out to keep it.</p>
        </fieldset>
      )}

      {kind === "NO_SERVICE" && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium text-navy-900">What it stops</legend>
          <label className="flex items-center justify-between gap-3 text-sm">
            Pickups inside
            <Switch checked={value.blockPickups} onCheckedChange={(on) => set({ blockPickups: on })} aria-label="Stop pickups" />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            Drops inside
            <Switch checked={value.blockDrops} onCheckedChange={(on) => set({ blockDrops: on })} aria-label="Stop drops" />
          </label>
          <p className="text-xs text-muted-foreground">Only pickups: e.g. next to a taxi stand, where drops are fine.</p>
        </fieldset>
      )}
    </div>
  );
}
