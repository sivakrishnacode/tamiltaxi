"use client";

import { CloudRainIcon, Loader2Icon, ZapIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { vehicleLabel } from "@/lib/format";
import { VEHICLE_KINDS, type VehicleKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { GOVERNMENT_FARE_KINDS } from "@/lib/zone-rules";

import { surgeNow } from "../../actions";

const MULTIPLIERS = [1.1, 1.2, 1.3, 1.4, 1.5] as const;
const HOURS = [1, 2, 3, 6] as const;

function Choice({ isOn, onClick, children }: { isOn: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={isOn}
      onClick={onClick}
      className={cn(
        "h-8 min-w-12 rounded-md border px-2.5 text-sm font-medium tabular-nums transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        isOn ? "border-coral-600 bg-coral-600 text-white" : "bg-card text-navy-700 hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/**
 * "Surge now": higher fares for the next few hours (rain, a festival rush) over the whole city or one zone, for the
 * chosen vehicles, ending by itself; optionally pushes the city's drivers to come online.
 */
export function SurgeNowButton({ cityId, cityName, zones }: { cityId: string; cityName: string; zones: readonly { id: string; name: string }[] }) {
  const [isOpen, setOpen] = useState(false);
  const [name, setName] = useState("Rain surge");
  const [multiplier, setMultiplier] = useState<number>(1.2);
  const [hours, setHours] = useState<number>(2);
  const [zoneId, setZoneId] = useState("city");
  const [kinds, setKinds] = useState<VehicleKind[]>(() => VEHICLE_KINDS.filter((k) => !GOVERNMENT_FARE_KINDS.includes(k)));
  const [notify, setNotify] = useState(true);
  const [isPending, startTransition] = useTransition();
  const isEvery = kinds.length === VEHICLE_KINDS.length;

  function submit() {
    startTransition(async () => {
      const res = await surgeNow(cityId, {
        name,
        multiplier,
        hours,
        zoneId: zoneId === "city" ? undefined : zoneId,
        vehicleKinds: isEvery ? [] : kinds,
        notifyDrivers: notify,
      });
      if (res.ok) {
        toast.success(res.message);
        setOpen(false);
      } else toast.error(res.error);
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <ZapIcon /> Surge now
      </Button>
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (kinds.length > 0) submit();
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CloudRainIcon className="size-5 text-coral-600" aria-hidden /> Surge now in {cityName}
              </DialogTitle>
              <DialogDescription>
                For rain or a sudden rush: fares go up for a few hours, the whole fare goes to the driver, and it ends by itself. The
                usual cap applies.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-1.5">
              <Label htmlFor="surge-name">Name</Label>
              <Input id="surge-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="grid gap-1.5">
              <Label>Fares</Label>
              <div className="flex flex-wrap gap-1.5">
                {MULTIPLIERS.map((m) => (
                  <Choice key={m} isOn={multiplier === m} onClick={() => setMultiplier(m)}>
                    ×{m.toFixed(1)}
                  </Choice>
                ))}
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>For</Label>
              <div className="flex flex-wrap gap-1.5">
                {HOURS.map((h) => (
                  <Choice key={h} isOn={hours === h} onClick={() => setHours(h)}>
                    {h} h
                  </Choice>
                ))}
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="surge-area">Where</Label>
              <Select value={zoneId} onValueChange={setZoneId}>
                <SelectTrigger id="surge-area" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="city">The whole service area</SelectItem>
                  {zones.map((z) => (
                    <SelectItem key={z.id} value={z.id}>
                      {z.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Vehicles</Label>
              <div className="flex flex-wrap gap-1">
                {VEHICLE_KINDS.map((k) => (
                  <Choice key={k} isOn={kinds.includes(k)} onClick={() => setKinds((list) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]))}>
                    <span className="text-xs">{vehicleLabel(k)}</span>
                  </Choice>
                ))}
              </div>
              <p className={cn("text-xs", kinds.length ? "text-muted-foreground" : "text-error")}>
                {kinds.length ? "Autos are left out: they charge the government fare." : "Pick at least one vehicle."}
              </p>
            </div>

            <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <span>
                <span className="block text-sm font-medium text-navy-900">Tell {cityName}&apos;s drivers</span>
                <span className="block text-xs text-muted-foreground">A push to approved drivers of these vehicles: busy now, go online.</span>
              </span>
              <Switch checked={notify} onCheckedChange={setNotify} aria-label="Tell the drivers" />
            </label>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isPending || kinds.length === 0}>
                {isPending ? <Loader2Icon className="animate-spin" /> : <ZapIcon />} Start ×{multiplier.toFixed(1)} for {hours} h
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
