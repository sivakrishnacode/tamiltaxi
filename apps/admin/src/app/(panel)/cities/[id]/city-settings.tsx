"use client";

import { Loader2Icon, SaveIcon, Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { PointPicker } from "@/components/map/google/point-picker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { CityDetail } from "@/lib/types";

import { deleteCity, updateCity } from "../../actions";

/** Tab d) name/state/centre/active → PATCH; delete (danger dialog) → DELETE. */
export function CitySettings({
  city,
  isOwner = true,
}: {
  city: CityDetail;
  isOwner?: boolean;
}) {
  const [name, setName] = useState(city.name);
  const [state, setState] = useState(city.state);
  const [lat, setLat] = useState(String(city.centerLat));
  const [lng, setLng] = useState(String(city.centerLng));
  const [isActive, setActive] = useState(city.isActive);
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [isPending, startTransition] = useTransition();
  const latN = Number(lat);
  const lngN = Number(lng);
  const isValid =
    name.trim().length >= 2 &&
    state.trim().length >= 2 &&
    lat !== "" &&
    lng !== "" &&
    Math.abs(latN) <= 90 &&
    Math.abs(lngN) <= 180;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="font-semibold">City details</CardTitle>
          <CardDescription>
            Id <span className="font-mono">{city.id}</span> · H3 resolution{" "}
            {city.h3Resolution} (fixed after creation)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!isValid) return;
              startTransition(async () => {
                const res = await updateCity(city.id, {
                  name: name.trim(),
                  state: state.trim(),
                  centerLat: latN,
                  centerLng: lngN,
                  isActive,
                });
                if (res.ok) toast.success(res.message);
                else toast.error(res.error);
              });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="cs-name">Name</Label>
                <Input
                  id="cs-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cs-state">State</Label>
                <Input
                  id="cs-state"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cs-lat">Centre lat</Label>
                <Input
                  id="cs-lat"
                  inputMode="decimal"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cs-lng">Centre lng</Label>
                <Input
                  id="cs-lng"
                  inputMode="decimal"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                />
              </div>
            </div>
            <div className="h-56 overflow-hidden rounded-xl border">
              <PointPicker
                lat={latN}
                lng={lngN}
                onPick={(a, b) => {
                  setLat(String(a));
                  setLng(String(b));
                }}
              />
            </div>
            <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <span>
                <span className="block text-sm font-medium text-navy-900">
                  Active
                </span>
                <span className="block text-xs text-muted-foreground">
                  {isOwner
                    ? "Inactive cities are ignored by fares and dispatch."
                    : "Only an owner admin switches a city on or off."}
                </span>
              </span>
              <Switch
                checked={isActive}
                onCheckedChange={setActive}
                disabled={!isOwner}
                aria-label="City active"
              />
            </label>
            <Button
              type="submit"
              disabled={!isValid || isPending}
              className="justify-self-start"
            >
              {isPending ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <SaveIcon />
              )}{" "}
              Save city
            </Button>
          </form>
        </CardContent>
      </Card>

      {isOwner && (
        <Card className="h-fit ring-error/30">
          <CardHeader>
            <CardTitle className="font-semibold text-error">
              Danger zone
            </CardTitle>
            <CardDescription>
              Deleting removes the service area, all zones and city fares.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2Icon /> Delete {city.name}
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={isDeleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {city.name}?</DialogTitle>
            <DialogDescription>
              {city.serviceCells.length.toLocaleString("en-IN")} hexagons and{" "}
              {city.zones.length} zones are removed. Type the city id{" "}
              <span className="font-mono font-medium">{city.id}</span> to
              confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-label="City id"
            className="font-mono"
            autoFocus
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={confirm !== city.id || isPending}
              onClick={() =>
                startTransition(async () => {
                  // On success the action redirects to /cities.
                  const res = await deleteCity(city.id);
                  if (!res.ok) toast.error(res.error);
                })
              }
            >
              {isPending ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <Trash2Icon />
              )}{" "}
              Delete city
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
