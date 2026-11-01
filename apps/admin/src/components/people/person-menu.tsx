"use client";

import { BanIcon, Loader2Icon, MoreHorizontalIcon, PencilIcon, PowerOffIcon, SendIcon, ShieldCheckIcon, Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { vehicleLabel } from "@/lib/format";
import { DRIVER_VEHICLE_KINDS, type DriverProfileInput, type VehicleKind, type WorkType } from "@/lib/types";

import { deleteUserAccount, setUserBlocked, takeDriverOffline, updateDriverProfile, updateUserDetails, type ActionResult } from "@/app/(panel)/actions";

import { MessageDialog } from "./message-dialog";

/** The driver fields an admin can fix ([updateDriverProfile]). */
export interface DriverFields {
  readonly id: string;
  readonly isOnline: boolean;
  readonly vehicleKind: VehicleKind;
  readonly workType: WorkType;
  readonly vehicleModel: string;
  readonly vehicleColor: string;
  readonly plate: string;
  readonly upiId: string;
}

function notify(res: ActionResult): boolean {
  if (res.ok) toast.success(res.message);
  else toast.error(res.error);
  return res.ok;
}

/**
 * "More" on a person's page (driver or account): edit details, send a push, take a driver offline, block / unblock.
 * The same menu on both pages, so a driver and their account are looked after in one place. A blocked person also
 * gets a visible Unblock button.
 */
export function PersonMenu({
  userId,
  name,
  email,
  personName,
  isBlocked,
  driver,
  isSelf = false,
  canDelete = true,
}: {
  userId: string;
  /** Display name for titles ("Selvi R" or the phone). */
  name: string;
  email: string | null;
  /** The stored name (may be empty). */
  personName: string | null;
  isBlocked: boolean;
  driver?: DriverFields;
  /** The signed-in admin's own account: no block, no delete. */
  isSelf?: boolean;
  /** Owner admins only (support admins can't delete accounts). */
  canDelete?: boolean;
}) {
  const [dialog, setDialog] = useState<"edit" | "message" | "offline" | "block" | "delete" | null>(null);
  const [isPending, startTransition] = useTransition();
  const close = () => setDialog(null);

  function unblock() {
    startTransition(async () => {
      notify(await setUserBlocked(userId, false, undefined, driver?.id));
    });
  }

  return (
    <>
      {isBlocked && !isSelf && (
        <Button variant="outline" onClick={unblock} disabled={isPending}>
          {isPending ? <Loader2Icon className="animate-spin" /> : <ShieldCheckIcon />} Unblock
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" aria-label="More actions">
            <MoreHorizontalIcon /> More
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <PencilIcon /> Edit details
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("message")}>
            <SendIcon /> Send a push
          </DropdownMenuItem>
          {driver?.isOnline && (
            <DropdownMenuItem onSelect={() => setDialog("offline")}>
              <PowerOffIcon /> Take offline
            </DropdownMenuItem>
          )}
          {!isSelf && (
            <>
              <DropdownMenuSeparator />
              {!isBlocked && (
                <DropdownMenuItem variant="destructive" onSelect={() => setDialog("block")}>
                  <BanIcon /> Block account
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
                  <Trash2Icon /> Delete account
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog === "edit" && <EditDialog userId={userId} name={name} email={email} personName={personName} driver={driver} onClose={close} />}
      {dialog === "message" && (
        <MessageDialog
          userId={userId}
          driverId={driver?.id}
          name={name}
          defaultApp={driver ? "DRIVER" : "PASSENGER"}
          isOpen
          onOpenChange={(open) => !open && close()}
        />
      )}
      {dialog === "offline" && driver && <OfflineDialog userId={userId} driverId={driver.id} name={name} onClose={close} />}
      {dialog === "block" && <BlockDialog userId={userId} driverId={driver?.id} name={name} onClose={close} />}
      {dialog === "delete" && <DeleteDialog userId={userId} driverId={driver?.id} name={name} onClose={close} />}
    </>
  );
}

function EditDialog({
  userId,
  name,
  email,
  personName,
  driver,
  onClose,
}: {
  userId: string;
  name: string;
  email: string | null;
  personName: string | null;
  driver?: DriverFields;
  onClose: () => void;
}) {
  const [account, setAccount] = useState({ name: personName ?? "", email: email ?? "" });
  const [vehicle, setVehicle] = useState(
    driver
      ? { vehicleKind: driver.vehicleKind, workType: driver.workType, vehicleModel: driver.vehicleModel, vehicleColor: driver.vehicleColor, plate: driver.plate, upiId: driver.upiId }
      : null,
  );
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const accountChanges: { name?: string; email?: string } = {};
      if (account.name.trim() !== (personName ?? "")) accountChanges.name = account.name;
      if (account.email.trim() !== (email ?? "")) accountChanges.email = account.email;
      const driverChanges: Record<string, string> = {};
      if (driver && vehicle) {
        for (const [k, v] of Object.entries(vehicle)) if (v !== driver[k as keyof DriverFields]) driverChanges[k] = v;
      }
      if (Object.keys(accountChanges).length === 0 && Object.keys(driverChanges).length === 0) {
        toast.message("Nothing changed");
        return;
      }
      if (Object.keys(accountChanges).length && !notify(await updateUserDetails(userId, accountChanges, driver?.id))) return;
      if (driver && Object.keys(driverChanges).length && !notify(await updateDriverProfile(driver.id, userId, driverChanges as DriverProfileInput))) return;
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit {name}</DialogTitle>
            <DialogDescription>
              Fix details for them, e.g. a typo in the plate or UPI ID. Each change is kept in their history.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-name">Name</Label>
              <Input id="edit-name" value={account.name} maxLength={60} onChange={(e) => setAccount((a) => ({ ...a, name: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={account.email}
                placeholder="Optional"
                onChange={(e) => setAccount((a) => ({ ...a, email: e.target.value }))}
              />
            </div>
          </div>
          {driver && vehicle && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="edit-kind">Vehicle</Label>
                <Select value={vehicle.vehicleKind} onValueChange={(v) => setVehicle((x) => x && { ...x, vehicleKind: v as VehicleKind })} disabled={driver.isOnline}>
                  <SelectTrigger id="edit-kind" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DRIVER_VEHICLE_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {vehicleLabel(k)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {driver.isOnline && <p className="text-xs text-muted-foreground">Take them offline to change the vehicle.</p>}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-work">Works on</Label>
                <Select value={vehicle.workType} onValueChange={(v) => setVehicle((x) => x && { ...x, workType: v as WorkType })}>
                  <SelectTrigger id="edit-work" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RIDES">Rides</SelectItem>
                    <SelectItem value="DELIVERIES">Deliveries</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-model">Model</Label>
                <Input id="edit-model" value={vehicle.vehicleModel} maxLength={60} onChange={(e) => setVehicle((x) => x && { ...x, vehicleModel: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-colour">Colour</Label>
                <Input id="edit-colour" value={vehicle.vehicleColor} maxLength={30} onChange={(e) => setVehicle((x) => x && { ...x, vehicleColor: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-plate">Plate</Label>
                <Input
                  id="edit-plate"
                  value={vehicle.plate}
                  maxLength={15}
                  className="font-mono uppercase"
                  onChange={(e) => setVehicle((x) => x && { ...x, plate: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-upi">UPI ID</Label>
                <Input id="edit-upi" value={vehicle.upiId} className="font-mono" onChange={(e) => setVehicle((x) => x && { ...x, upiId: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2Icon className="animate-spin" />} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OfflineDialog({ userId, driverId, name, onClose }: { userId: string; driverId: string; name: string; onClose: () => void }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Take {name} offline?</DialogTitle>
          <DialogDescription>
            They stop getting requests now. A trip they are on carries on. They can go online again unless you also put
            them on hold or block them.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                if (notify(await takeDriverOffline(driverId, userId))) onClose();
              })
            }
          >
            {isPending ? <Loader2Icon className="animate-spin" /> : <PowerOffIcon />} Take offline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BlockDialog({ userId, driverId, name, onClose }: { userId: string; driverId?: string; name: string; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const isReasonValid = reason.trim().length >= 3 && reason.trim().length <= 200;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isReasonValid) return;
            startTransition(async () => {
              if (notify(await setUserBlocked(userId, true, reason, driverId))) onClose();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Block {name}?</DialogTitle>
            <DialogDescription>
              Blocking signs them out everywhere and stops new bookings{driverId ? " and rides" : ""} until you unblock them.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="block-reason">Reason</Label>
            <Textarea
              id="block-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Repeated no-shows reported by drivers"
              rows={3}
              maxLength={200}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">{reason.trim().length}/200 · at least 3 characters</p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={!isReasonValid || isPending}>
              {isPending ? <Loader2Icon className="animate-spin" /> : <BanIcon />} Block
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Confirms DELETE /admin/users/:id: what goes, what stays, and that it can't be undone. */
function DeleteDialog({ userId, driverId, name, onClose }: { userId: string; driverId?: string; name: string; onClose: () => void }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {name}&apos;s account?</DialogTitle>
          <DialogDescription>
            This can&apos;t be undone. They are signed out everywhere, and their name, number, email, saved places, emergency
            contacts and identity-check details are deleted
            {driverId ? ", with their documents, photos, UPI ID and plate; they can't drive again on this account" : ""}.
            Trips stay for the records, without personal details. Their number can sign up again as a new account. Not
            possible while they are on a trip.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                if (notify(await deleteUserAccount(userId, driverId))) onClose();
              })
            }
          >
            {isPending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />} Delete account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
