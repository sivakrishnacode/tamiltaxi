"use client";

import { Loader2Icon, PencilIcon, UserMinusIcon, UserPlusIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { CityPicker } from "@/components/common/city-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PickCity } from "@/lib/city-pick";
import { permissionSummary } from "@/lib/permissions";
import type { StaffMember, StaffRole } from "@/lib/types";

import { addStaff, removeStaff, updateStaff } from "../actions";

type City = PickCity;
const OWNER = "owner";

/** Owner, or one of the roles, and the cities for a city-limited role. */
function AccessFields({
  roles,
  cities,
  choice,
  onChoice,
  cityIds,
  onCityIds,
}: {
  roles: readonly StaffRole[];
  cities: readonly City[];
  choice: string;
  onChoice: (v: string) => void;
  cityIds: string[];
  onCityIds: (ids: string[]) => void;
}) {
  const role = roles.find((r) => r.id === choice);
  return (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor="staff-access">Access</Label>
        <Select value={choice} onValueChange={onChoice}>
          <SelectTrigger id="staff-access" className="w-full">
            <SelectValue placeholder="Pick a role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={OWNER}>Owner</SelectItem>
            {roles.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {choice === OWNER
            ? "Everything, including the team and roles."
            : role
              ? permissionSummary(role.permissions)
              : "Roles say what a person may see and change; make them under Roles."}
        </p>
      </div>
      {role?.isCityScoped && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Cities they set up</legend>
          {cities.length === 0 ? (
            <p className="text-xs text-error">Add a city under Cities & zones first.</p>
          ) : (
            <CityPicker cities={cities} value={cityIds} onChange={onCityIds} />
          )}
        </fieldset>
      )}
    </>
  );
}

const missing = (roles: readonly StaffRole[], choice: string, cityIds: string[]) => {
  if (!choice) return "Pick a role";
  const role = roles.find((r) => r.id === choice);
  return role?.isCityScoped && cityIds.length === 0 ? "Pick at least one city" : null;
};

/** Team › Staff › Add staff: by phone; the person signs in with it later. */
export function AddStaffButton({ roles, cities }: { roles: readonly StaffRole[]; cities: readonly City[] }) {
  const [isOpen, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [choice, setChoice] = useState("");
  const [cityIds, setCityIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const problem = missing(roles, choice, cityIds);

  function open() {
    setPhone("");
    setName("");
    setChoice(roles[0]?.id ?? "");
    setCityIds([]);
    setOpen(true);
  }

  return (
    <>
      <Button onClick={open}>
        <UserPlusIcon /> Add staff
      </Button>
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (problem) return;
              startTransition(async () => {
                const res = await addStaff({ phone, name, level: choice === OWNER ? "OWNER" : "SUPPORT", roleId: choice === OWNER ? null : choice, cityIds });
                if (res.ok) {
                  toast.success(res.message);
                  setOpen(false);
                } else toast.error(res.error);
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Add staff</DialogTitle>
              <DialogDescription>They sign in to this panel with this phone number. No account yet? One is made now.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="staff-phone">Phone</Label>
                <Input id="staff-phone" inputMode="tel" value={phone} maxLength={14} placeholder="98765 43210" onChange={(e) => setPhone(e.target.value)} autoFocus />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="staff-name">Name</Label>
                <Input id="staff-name" value={name} maxLength={60} placeholder="Optional" onChange={(e) => setName(e.target.value)} />
              </div>
            </div>
            <AccessFields roles={roles} cities={cities} choice={choice} onChoice={setChoice} cityIds={cityIds} onCityIds={setCityIds} />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isPending || !!problem || phone.replace(/\D/g, "").length < 10}>
                {isPending ? <Loader2Icon className="animate-spin" /> : <UserPlusIcon />} Add to the team
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Edit access / Remove on one row (not for yourself; a server owner can't be changed here). */
export function StaffRowActions({ member, roles, cities }: { member: StaffMember; roles: readonly StaffRole[]; cities: readonly City[] }) {
  const [dialog, setDialog] = useState<"edit" | "remove" | null>(null);
  const [choice, setChoice] = useState("");
  const [cityIds, setCityIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const label = member.name ?? member.phone;
  const problem = missing(roles, choice, cityIds);

  function edit() {
    setChoice(member.adminLevel === "OWNER" ? OWNER : (member.staffRole?.id ?? ""));
    setCityIds([...member.adminCityIds]);
    setDialog("edit");
  }

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={edit} disabled={member.isServerOwner} title={member.isServerOwner ? "In ADMIN_PHONES on the server: always an owner" : undefined}>
        <PencilIcon /> Access
      </Button>
      <Button variant="ghost" size="sm" className="text-error hover:text-error" onClick={() => setDialog("remove")} disabled={member.isServerOwner}>
        <UserMinusIcon /> Remove
      </Button>

      <Dialog open={dialog === "edit"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (problem) return;
              startTransition(async () => {
                const res = await updateStaff(member.id, { level: choice === OWNER ? "OWNER" : "SUPPORT", roleId: choice === OWNER ? null : choice, cityIds });
                if (res.ok) {
                  toast.success(res.message);
                  setDialog(null);
                } else toast.error(res.error);
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>What can {label} do?</DialogTitle>
              <DialogDescription>Applies at once: their next page or action follows the new access.</DialogDescription>
            </DialogHeader>
            <AccessFields roles={roles} cities={cities} choice={choice} onChoice={setChoice} cityIds={cityIds} onCityIds={setCityIds} />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isPending || !!problem}>
                {isPending && <Loader2Icon className="animate-spin" />} Save access
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "remove"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {label} from the team?</DialogTitle>
            <DialogDescription>
              They lose the admin panel at once. Their account stays: a rider again, or a driver if they drive.
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
                  const res = await removeStaff(member.id);
                  if (res.ok) {
                    toast.success(res.message);
                    setDialog(null);
                  } else toast.error(res.error);
                })
              }
            >
              {isPending ? <Loader2Icon className="animate-spin" /> : <UserMinusIcon />} Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
