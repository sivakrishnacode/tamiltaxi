"use client";

import { KeyRoundIcon, Loader2Icon } from "lucide-react";
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
import { humanize } from "@/lib/format";
import { ROLES, type Role } from "@/lib/types";

import { changeRideOtp, setUserRole } from "../../actions";

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
                ? "Admins can sign in to this panel and change anything here. Note: phones in ADMIN_PHONES always sign in as admin."
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
