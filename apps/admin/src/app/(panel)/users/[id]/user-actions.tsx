"use client";

import { KeyRoundIcon, Loader2Icon, ShieldCheckIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { accessLabel, type AdminAccess } from "@/lib/access";
import { humanize } from "@/lib/format";
import { ROLES, type Role } from "@/lib/types";

import { changeRideOtp, setAdminAccess, setUserRole } from "../../actions";

/** Role select with a confirmation dialog → PATCH /admin/users/:id {role}. */
export function RoleControl({ userId, role, name }: { userId: string; role: Role; name: string }) {
  const [target, setTarget] = useState<Role | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <Select value={role} onValueChange={(v) => v !== role && setTarget(v as Role)}>
        <SelectTrigger className="w-40" aria-label="Role">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => (
            <SelectItem key={r} value={r}>
              {humanize(r)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Make {name} {target === "ADMIN" ? "an" : "a"} {target ? humanize(target).toLowerCase() : ""}?
            </DialogTitle>
            <DialogDescription>
              {target === "ADMIN"
                ? "They can sign in to this panel as a support admin: trips, tickets, SOS, people and documents, no setup or exports. Change that with Access afterwards. Phones in ADMIN_PHONES always sign in as owners."
                : "The new role applies at once, also to the sessions the user already has. A driver role still needs a driver profile to take rides."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              disabled={isPending}
              onClick={() =>
                target &&
                startTransition(async () => {
                  const res = await setUserRole(userId, target);
                  if (res.ok) {
                    toast.success(res.message);
                    setTarget(null);
                  } else toast.error(res.error);
                })
              }
            >
              {isPending && <Loader2Icon className="animate-spin" />} Change role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The person's ride OTP (the same for every ride they take themselves) and a Change dialog for when it was overheard:
 * POST /admin/users/:id/ride-otp. Their rides that haven't started move to the new code.
 */
export function RideOtpControl({ userId, name, rideOtp }: { userId: string; name: string; rideOtp: string | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [isPending, startTransition] = useTransition();
  const isTypedValid = typed === "" || /^[1-9]\d{3}$/.test(typed);

  return (
    <>
      <span className="flex items-center gap-2">
        {rideOtp ? (
          <span className="font-mono text-base font-semibold tracking-[0.2em] text-navy-900">{rideOtp}</span>
        ) : (
          <span className="text-muted-foreground">Made at the first ride</span>
        )}
        <Button variant="outline" size="xs" onClick={() => setIsOpen(true)}>
          Change
        </Button>
      </span>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) setTyped("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!isTypedValid) return;
              startTransition(async () => {
                const res = await changeRideOtp(userId, typed);
                if (res.ok) {
                  toast.success(res.message);
                  setIsOpen(false);
                  setTyped("");
                } else toast.error(res.error);
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Change {name}&apos;s ride OTP?</DialogTitle>
              <DialogDescription>
                Use this when someone overheard the code. Every ride they take starts with the new one; a ride that
                hasn&apos;t started yet switches to it, and their app shows it at once.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="ride-otp">New code</Label>
              <Input
                id="ride-otp"
                value={typed}
                onChange={(e) => setTyped(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="Leave empty for a random code"
                inputMode="numeric"
                autoComplete="off"
                className="font-mono tracking-[0.2em] placeholder:font-sans placeholder:tracking-normal"
                aria-invalid={!isTypedValid}
              />
              <p className={isTypedValid ? "text-xs text-muted-foreground" : "text-xs text-error"}>
                {isTypedValid ? "4 digits, or empty for a random one" : "Enter 4 digits, not starting with 0"}
              </p>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={!isTypedValid || isPending}>
                {isPending ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />} Change OTP
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

const LEVEL_TEXT = {
  OWNER: "Everything: pricing, cities and zones, settings, plans, announcements, campaigns, exports and who is an admin.",
  SUPPORT: "Day-to-day work: trips, tickets, SOS, riders and drivers, documents and approvals. No setup, exports or account deletion.",
} as const;

/**
 * Owner or support, and the cities a support admin sets up (a city admin: that city's service area, zones, fares,
 * rentals and settings) → PATCH /admin/users/:id. Owner admins only.
 */
export function AdminAccessControl({
  userId,
  name,
  access,
  cities,
}: {
  userId: string;
  name: string;
  access: AdminAccess;
  cities: readonly { id: string; name: string }[];
}) {
  const [isOpen, setOpen] = useState(false);
  const [level, setLevel] = useState<"OWNER" | "SUPPORT">(access.adminLevel ?? "OWNER");
  const [cityIds, setCityIds] = useState<string[]>([...(access.adminCityIds ?? [])]);
  const [isPending, startTransition] = useTransition();
  const names = Object.fromEntries(cities.map((c) => [c.id, c.name]));

  function open() {
    setLevel(access.adminLevel ?? "OWNER");
    setCityIds([...(access.adminCityIds ?? [])]);
    setOpen(true);
  }

  return (
    <>
      <Button variant="outline" onClick={open}>
        <ShieldCheckIcon /> {accessLabel(access, names)}
      </Button>
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const res = await setAdminAccess(userId, level, cityIds);
                if (res.ok) {
                  toast.success(res.message);
                  setOpen(false);
                } else toast.error(res.error);
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>What can {name} do?</DialogTitle>
              <DialogDescription>Applies to their next request. Their sidebar updates when they sign in again.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="admin-level">Access</Label>
              <Select value={level} onValueChange={(v) => setLevel(v as "OWNER" | "SUPPORT")}>
                <SelectTrigger id="admin-level" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OWNER">Owner</SelectItem>
                  <SelectItem value="SUPPORT">Support</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{LEVEL_TEXT[level]}</p>
            </div>
            {level === "SUPPORT" && (
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">Cities they set up</legend>
                <p className="text-xs text-muted-foreground">
                  A support admin with cities is a city admin: they also edit those cities&apos; service area, zones, fares,
                  rentals and city settings (not switching a city on or off).
                </p>
                <ul className="mt-1 max-h-56 divide-y overflow-y-auto rounded-lg border">
                  {cities.map((c) => {
                    const isOn = cityIds.includes(c.id);
                    return (
                      <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <Label htmlFor={`city-${c.id}`} className="font-normal">
                          {c.name}
                        </Label>
                        <Switch
                          id={`city-${c.id}`}
                          checked={isOn}
                          onCheckedChange={(on) => setCityIds((ids) => (on ? [...ids, c.id] : ids.filter((x) => x !== c.id)))}
                        />
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2Icon className="animate-spin" />} Save access
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
