"use client";

import { Loader2Icon, RotateCcwIcon, SaveIcon } from "lucide-react";
import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatInr, vehicleLabel } from "@/lib/format";
import {
  CAB_TIERS,
  GOODS_TRUCKS,
  HOME_SIZES,
  type CabTier,
  type CityPricing,
  type GoodsTruck,
  type HomeSize,
  type ModePricing,
  type PricingSection,
} from "@/lib/types";

import { resetCityPricing, setCityPricing } from "../../actions";

const TIER: Record<CabTier, string> = { CAB: "Mini", SEDAN: "Sedan", SUV: "SUV" };
const SIZE: Record<HomeSize, string> = { FEW_ITEMS: "A few items", ONE_RK: "Studio / 1 RK", ONE_BHK: "1 BHK", TWO_BHK: "2 BHK", THREE_BHK: "3 BHK or more" };

/** Every number as the text in its input (empty while typing), mirroring the section's shape. */
type Draft<T> = T extends number ? string : T extends (infer U)[] ? Draft<U>[] : T extends object ? { [K in keyof T]: Draft<T[K]> } : T;

function toDraft<T>(v: T): Draft<T> {
  if (typeof v === "number") return String(v) as Draft<T>;
  if (Array.isArray(v)) return v.map(toDraft) as Draft<T>;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toDraft(x)])) as Draft<T>;
  return v as Draft<T>;
}

/** The draft as numbers, or null if a box is empty or not a number. Strings that aren't numbers (vehicle) stay. */
function fromDraft<T>(d: Draft<T>, template: T): T | null {
  if (typeof template === "number") {
    const s = (d as string).trim();
    const n = Number(s);
    return s === "" || !Number.isFinite(n) ? null : (n as T);
  }
  if (Array.isArray(template)) {
    const out = (d as unknown[]).map((x, i) => fromDraft(x as Draft<unknown>, template[i] as unknown));
    return out.some((x) => x === null) ? null : (out as T);
  }
  if (template && typeof template === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(template)) {
      const x = fromDraft((d as Record<string, unknown>)[k] as Draft<unknown>, (template as Record<string, unknown>)[k]);
      if (x === null) return null;
      out[k] = x;
    }
    return out as T;
  }
  return d as T;
}

/** A section's draft, whether it changed, and Save / Reset through the server actions. */
function useSection<S extends PricingSection>(cityId: string, section: S, saved: ModePricing[S]) {
  const [draft, setDraft] = useState<Draft<ModePricing[S]>>(() => toDraft(saved));
  const [isPending, startTransition] = useTransition();
  const value = fromDraft(draft, saved);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(toDraft(saved));
  const save = (): void =>
    startTransition(async () => {
      if (!value) return void toast.error("Fill in every box with a number");
      const res = await setCityPricing(cityId, section, value);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  const reset = (): void =>
    startTransition(async () => {
      const res = await resetCityPricing(cityId, section);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  return { draft, setDraft, value, isDirty, isPending, save, reset };
}

function Money({ value, onChange, label, step = "1" }: { value: string; onChange: (v: string) => void; label: string; step?: string }) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      min="0"
      step={step}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-24 text-right tabular-nums"
    />
  );
}

/** The card around a section: what it prices, whether the city has its own prices, Save and Reset. */
function SectionCard(props: {
  title: string;
  description: ReactNode;
  isDefault: boolean;
  isDirty: boolean;
  isValid: boolean;
  isPending: boolean;
  onSave: () => void;
  onReset: () => void;
  example?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1.5">
            <CardTitle className="flex items-center gap-2 font-semibold">
              {props.title}
              {props.isDefault ? <Badge variant="outline">Default</Badge> : <Badge className="bg-coral-50 text-coral-700">City prices</Badge>}
            </CardTitle>
            <CardDescription className="max-w-3xl">{props.description}</CardDescription>
          </div>
          <div className="flex items-center gap-1">
            {props.isDirty && !props.isValid && <span className="mr-1 text-xs text-error">Fill in every box</span>}
            <Button size="sm" disabled={!props.isDirty || !props.isValid || props.isPending} onClick={props.onSave}>
              {props.isPending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Save
            </Button>
            <Button size="sm" variant="ghost" disabled={props.isDefault || props.isPending} onClick={props.onReset}>
              <RotateCcwIcon /> Reset
            </Button>
          </div>
        </div>
      </CardHeader>
      {props.children}
      {props.example && <div className="border-t px-4 py-3 text-sm text-navy-700">{props.example}</div>}
    </Card>
  );
}

function RentalCard({ cityId, pricing }: { cityId: string; pricing: CityPricing }) {
  const s = useSection(cityId, "rental", pricing.sections.rental.value);
  const set = (tier: CabTier, patch: Partial<Draft<ModePricing["rental"][CabTier]>>) =>
    s.setDraft((d) => ({ ...d, [tier]: { ...d[tier], ...patch } }));
  const fourHours = pricing.packages.findIndex((p) => p.id === "4h");
  return (
    <SectionCard
      title="Rentals"
      description="A cab and driver by the hour (Mini, Sedan, SUV). Each package's price, then the rates past its hours and km, added when the rental ends. A longer package can't cost less than a shorter one."
      isDefault={pricing.sections.rental.isDefault}
      isDirty={s.isDirty}
      isValid={!!s.value}
      isPending={s.isPending}
      onSave={s.save}
      onReset={s.reset}
      example={
        s.value && fourHours >= 0 ? (
          <>
            4 hrs · 40 km, 5 km and 20 min over: Sedan {formatInr(s.value.SEDAN.prices[fourHours])} +{" "}
            {formatInr(Math.floor(5 * s.value.SEDAN.extraKm + 1e-9))} + {formatInr(Math.floor(20 * s.value.SEDAN.extraMin + 1e-9))} ={" "}
            <strong>
              {formatInr(
                s.value.SEDAN.prices[fourHours] + Math.floor(5 * s.value.SEDAN.extraKm + 1e-9) + Math.floor(20 * s.value.SEDAN.extraMin + 1e-9),
              )}
            </strong>
          </>
        ) : null
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Package</TableHead>
            {CAB_TIERS.map((t) => (
              <TableHead key={t}>{TIER[t]} ₹</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pricing.packages.map((p, i) => (
            <TableRow key={p.id}>
              <TableCell className="pl-4 font-medium text-navy-900">
                {p.hours === 1 ? "1 hr" : `${p.hours} hrs`} · {p.km} km
              </TableCell>
              {CAB_TIERS.map((t) => (
                <TableCell key={t}>
                  <Money
                    value={s.draft[t].prices[i]}
                    label={`${TIER[t]} ${p.hours} hours`}
                    onChange={(v) => set(t, { prices: s.draft[t].prices.map((x, j) => (j === i ? v : x)) })}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
          <TableRow className="bg-muted/40">
            <TableCell className="pl-4 text-navy-700">Past the package, ₹ a km</TableCell>
            {CAB_TIERS.map((t) => (
              <TableCell key={t}>
                <Money value={s.draft[t].extraKm} step="0.5" label={`${TIER[t]} extra per km`} onChange={(v) => set(t, { extraKm: v })} />
              </TableCell>
            ))}
          </TableRow>
          <TableRow className="bg-muted/40">
            <TableCell className="pl-4 text-navy-700">Past the package, ₹ a minute</TableCell>
            {CAB_TIERS.map((t) => (
              <TableCell key={t}>
                <Money value={s.draft[t].extraMin} step="0.5" label={`${TIER[t]} extra per minute`} onChange={(v) => set(t, { extraMin: v })} />
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </SectionCard>
  );
}

function OutstationCard({ cityId, pricing }: { cityId: string; pricing: CityPricing }) {
  const s = useSection(cityId, "outstation", pricing.sections.outstation.value);
  type Key = keyof ModePricing["outstation"][CabTier];
  const set = (tier: CabTier, key: Key, v: string) => s.setDraft((d) => ({ ...d, [tier]: { ...d[tier], [key]: v } }));
  const cols: { key: Key; label: string; step: string }[] = [
    { key: "oneWayPerKm", label: "One way ₹/km", step: "0.5" },
    { key: "roundTripPerKm", label: "Round trip ₹/km", step: "0.5" },
    { key: "waitPerHour", label: "Waiting ₹/hour", step: "10" },
    { key: "allowancePerDay", label: "Driver allowance ₹/24 h", step: "10" },
    { key: "oneWayMinKm", label: "One way, at least km", step: "5" },
  ];
  const v = s.value;
  const oneWay = (t: CabTier): number => (v ? Math.floor(Math.max(v[t].oneWayMinKm, 150) * v[t].oneWayPerKm) + v[t].allowancePerDay : 0);
  // 75 km each way (2 h's drive), back after 8 h: 150 km, 4 h waiting, one allowance.
  const roundTrip = (t: CabTier): number => (v ? Math.floor(150 * v[t].roundTripPerKm) + 4 * v[t].waitPerHour + v[t].allowancePerDay : 0);
  return (
    <SectionCard
      title="Outstation (cabs)"
      description="To another town. One way: the route km (at least the minimum) at the one-way rate plus one day's driver allowance, fixed. Round trip, priced by time: both ways' km at the round-trip rate, the time waiting there (away time past the drive both ways) at the waiting rate, and the allowance per 24 hours away; more km, and coming back more than 30 min late, are added at the end."
      isDefault={pricing.sections.outstation.isDefault}
      isDirty={s.isDirty}
      isValid={!!v}
      isPending={s.isPending}
      onSave={s.save}
      onReset={s.reset}
      example={
        v ? (
          <>
            150 km one way: {CAB_TIERS.map((t) => `${TIER[t]} ${formatInr(oneWay(t))}`).join(" · ")}
            <br />
            75 km each way, back after 8 h: {CAB_TIERS.map((t) => `${TIER[t]} ${formatInr(roundTrip(t))}`).join(" · ")}
          </>
        ) : null
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Cab</TableHead>
            {cols.map((c) => (
              <TableHead key={c.key}>{c.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {CAB_TIERS.map((t) => (
            <TableRow key={t}>
              <TableCell className="pl-4 font-medium text-navy-900">{TIER[t]}</TableCell>
              {cols.map((c) => (
                <TableCell key={c.key}>
                  <Money value={s.draft[t][c.key]} step={c.step} label={`${TIER[t]} ${c.label}`} onChange={(x) => set(t, c.key, x)} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SectionCard>
  );
}

function GoodsCard({ cityId, pricing }: { cityId: string; pricing: CityPricing }) {
  const s = useSection(cityId, "goodsOutstation", pricing.sections.goodsOutstation.value);
  const set = (k: GoodsTruck, key: "perKm" | "minKm", v: string) => s.setDraft((d) => ({ ...d, [k]: { ...d[k], [key]: v } }));
  const v = s.value;
  return (
    <SectionCard
      title="Goods to another town"
      description="Parcels by three-wheeler, mini truck, pickup or truck to another town, one way: the route km (at least the minimum) at the rate. The price covers the drive back empty; tolls and permits are the sender's."
      isDefault={pricing.sections.goodsOutstation.isDefault}
      isDirty={s.isDirty}
      isValid={!!v}
      isPending={s.isPending}
      onSave={s.save}
      onReset={s.reset}
      example={
        v ? (
          <>
            120 km: {GOODS_TRUCKS.map((k) => `${vehicleLabel(k)} ${formatInr(Math.floor(Math.max(120, v[k].minKm) * v[k].perKm))}`).join(" · ")}
          </>
        ) : null
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Vehicle</TableHead>
            <TableHead>₹ a km</TableHead>
            <TableHead>At least km</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {GOODS_TRUCKS.map((k) => (
            <TableRow key={k}>
              <TableCell className="pl-4 font-medium text-navy-900">{vehicleLabel(k)}</TableCell>
              <TableCell>
                <Money value={s.draft[k].perKm} step="0.5" label={`${vehicleLabel(k)} per km`} onChange={(x) => set(k, "perKm", x)} />
              </TableCell>
              <TableCell>
                <Money value={s.draft[k].minKm} step="5" label={`${vehicleLabel(k)} minimum km`} onChange={(x) => set(k, "minKm", x)} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SectionCard>
  );
}

function ShiftingCard({ cityId, pricing }: { cityId: string; pricing: CityPricing }) {
  const s = useSection(cityId, "shifting", pricing.sections.shifting.value);
  type SizeDraft = Draft<ModePricing["shifting"]["sizes"][HomeSize]>;
  const setSize = (size: HomeSize, patch: Partial<SizeDraft>) =>
    s.setDraft((d) => ({ ...d, sizes: { ...d.sizes, [size]: { ...d.sizes[size], ...patch } } }));
  type Flat = "helperCity" | "helperBetween" | "stairsPerFloor" | "dismantlePerPiece" | "weekendPct";
  const flat: { key: Flat; label: string; step: string }[] = [
    { key: "helperCity", label: "Helper, in town ₹", step: "10" },
    { key: "helperBetween", label: "Helper, to another town ₹", step: "10" },
    { key: "stairsPerFloor", label: "Stairs, per floor without a lift ₹", step: "10" },
    { key: "dismantlePerPiece", label: "Taking apart, per piece ₹", step: "10" },
    { key: "weekendPct", label: "Saturday and Sunday, extra %", step: "1" },
  ];
  const v = s.value;
  const example = v
    ? (() => {
        const z = v.sizes.ONE_BHK;
        const helpers = z.helpers * v.helperCity;
        const stairs = 2 * v.stairsPerFloor;
        return (
          <>
            1 BHK in town, 2nd floor without a lift, basic packing, a weekday: {vehicleLabel(z.vehicle)} fare + {z.helpers} helpers{" "}
            {formatInr(helpers)} + stairs {formatInr(stairs)} + packing {formatInr(z.packing.BASIC)} ={" "}
            <strong>fare + {formatInr(helpers + stairs + z.packing.BASIC)}</strong>
          </>
        );
      })()
    : null;
  return (
    <SectionCard
      title="Packers & Movers"
      description="The vehicle suggested for each home size (riders can change it), the helpers that come with it, packing and unpacking. In town the vehicle is priced at this city's in-town fare (no surge); to another town by the goods rates above. Weekends add the % to the whole price."
      isDefault={pricing.sections.shifting.isDefault}
      isDirty={s.isDirty}
      isValid={!!v}
      isPending={s.isPending}
      onSave={s.save}
      onReset={s.reset}
      example={example}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Home</TableHead>
            <TableHead>Suggested vehicle</TableHead>
            <TableHead>Helpers</TableHead>
            <TableHead>Basic packing ₹</TableHead>
            <TableHead>Full packing ₹</TableHead>
            <TableHead>Unpacking ₹</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {HOME_SIZES.map((size) => {
            const d = s.draft.sizes[size];
            return (
              <TableRow key={size}>
                <TableCell className="pl-4 font-medium text-navy-900">{SIZE[size]}</TableCell>
                <TableCell>
                  <Select value={d.vehicle} onValueChange={(x) => setSize(size, { vehicle: x as GoodsTruck })}>
                    <SelectTrigger className="h-8 w-36" aria-label={`${SIZE[size]} vehicle`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GOODS_TRUCKS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {vehicleLabel(k)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Money value={d.helpers} label={`${SIZE[size]} helpers`} onChange={(x) => setSize(size, { helpers: x })} />
                </TableCell>
                <TableCell>
                  <Money
                    value={d.packing.BASIC}
                    step="10"
                    label={`${SIZE[size]} basic packing`}
                    onChange={(x) => setSize(size, { packing: { ...d.packing, BASIC: x } })}
                  />
                </TableCell>
                <TableCell>
                  <Money
                    value={d.packing.FULL}
                    step="10"
                    label={`${SIZE[size]} full packing`}
                    onChange={(x) => setSize(size, { packing: { ...d.packing, FULL: x } })}
                  />
                </TableCell>
                <TableCell>
                  <Money value={d.unpack} step="10" label={`${SIZE[size]} unpacking`} onChange={(x) => setSize(size, { unpack: x })} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <CardContent className="grid gap-4 border-t py-4 sm:grid-cols-2 lg:grid-cols-5">
        {flat.map((f) => (
          <div key={f.key} className="grid gap-1.5">
            <Label htmlFor={`shift-${f.key}`} className="text-xs text-navy-700">
              {f.label}
            </Label>
            <Input
              id={`shift-${f.key}`}
              type="number"
              inputMode="decimal"
              min="0"
              step={f.step}
              value={s.draft[f.key]}
              onChange={(e) => s.setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              className="h-8 text-right tabular-nums"
            />
          </div>
        ))}
      </CardContent>
    </SectionCard>
  );
}

/** Tab "Rentals & more": this city's prices for the services priced up front, each over the built-in defaults. */
export function PricingEditor({ cityId, pricing }: { cityId: string; pricing: CityPricing }) {
  // Remount a card when its saved value changes (after Save / Reset), so the draft starts from it.
  const k = (section: PricingSection) => `${section}-${JSON.stringify(pricing.sections[section])}`;
  return (
    <div className="grid gap-4">
      <RentalCard key={k("rental")} cityId={cityId} pricing={pricing} />
      <OutstationCard key={k("outstation")} cityId={cityId} pricing={pricing} />
      <GoodsCard key={k("goodsOutstation")} cityId={cityId} pricing={pricing} />
      <ShiftingCard key={k("shifting")} cityId={cityId} pricing={pricing} />
      <p className="text-xs text-muted-foreground">
        Rides and parcels in town are priced per km on the Fares tab. Quotes and bookings use these prices at once; riders with the app open
        see new prices on their next quote.
      </p>
    </div>
  );
}
