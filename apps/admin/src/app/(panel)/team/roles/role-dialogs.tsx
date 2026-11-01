"use client";

import { Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EXTRA_PERMISSIONS, PERMISSION_AREAS } from "@/lib/permissions";
import type { StaffRole } from "@/lib/types";

import { deleteRole, saveRole } from "../../actions";

function Check({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (on: boolean) => void; label: string }) {
  return <input id={id} type="checkbox" className="size-4 cursor-pointer accent-coral-600" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />;
}

/** New role / Edit: name, what it may see and change per area, and whether it is limited to its members' cities. */
export function RoleEditor({ role }: { role?: StaffRole }) {
  const [isOpen, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [scoped, setScoped] = useState(false);
  const [isPending, startTransition] = useTransition();

  function open() {
    setName(role?.name ?? "");
    setDescription(role?.description ?? "");
    setPerms(new Set(role?.permissions ?? []));
    setScoped(role?.isCityScoped ?? false);
    setOpen(true);
  }

  /** Change includes view: ticking change ticks view, unticking view unticks change. */
  function setArea(area: string, level: "view" | "manage", on: boolean) {
    const next = new Set(perms);
    if (level === "manage") {
      if (on) {
        next.add(`${area}.manage`);
        next.delete(`${area}.view`);
      } else next.delete(`${area}.manage`);
    } else if (on) next.add(`${area}.view`);
    else {
      next.delete(`${area}.view`);
      next.delete(`${area}.manage`);
    }
    setPerms(next);
  }

  function toggle(key: string, on: boolean) {
    const next = new Set(perms);
    if (on) next.add(key);
    else next.delete(key);
    setPerms(next);
  }

  return (
    <>
      {role ? (
        <Button variant="ghost" size="sm" onClick={open}>
          <PencilIcon /> Edit
        </Button>
      ) : (
        <Button onClick={open}>
          <PlusIcon /> New role
        </Button>
      )}
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const res = await saveRole(role?.id ?? null, { name, description, permissions: [...perms], isCityScoped: scoped });
                if (res.ok) {
                  toast.success(res.message);
                  setOpen(false);
                } else toast.error(res.error);
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>{role ? `Edit ${role.name}` : "New role"}</DialogTitle>
              <DialogDescription>Every admin with this role gets exactly this, from their next page or action. Owners always have everything.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="role-name">Name</Label>
                <Input id="role-name" value={name} maxLength={40} placeholder="e.g. KYC reviewer" onChange={(e) => setName(e.target.value)} autoFocus />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="role-desc">What they do</Label>
                <Input id="role-desc" value={description} maxLength={160} placeholder="Optional" onChange={(e) => setDescription(e.target.value)} />
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Area</th>
                    <th className="w-16 px-2 py-2 text-center font-medium">View</th>
                    <th className="w-16 px-2 py-2 text-center font-medium">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {PERMISSION_AREAS.map((a) => {
                    const canChange = perms.has(`${a.key}.manage`);
                    const canView = canChange || perms.has(`${a.key}.view`);
                    return (
                      <tr key={a.key}>
                        <td className="px-3 py-2">
                          <span className="block font-medium text-navy-900">{a.label}</span>
                          <span className="block text-xs text-muted-foreground">{a.hint}</span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <Check id={`${a.key}-view`} label={`${a.label}: view`} checked={canView} onChange={(on) => setArea(a.key, "view", on)} />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <Check id={`${a.key}-manage`} label={`${a.label}: change`} checked={canChange} onChange={(on) => setArea(a.key, "manage", on)} />
                        </td>
                      </tr>
                    );
                  })}
                  {EXTRA_PERMISSIONS.map((x) => (
                    <tr key={x.key}>
                      <td className="px-3 py-2">
                        <span className="block font-medium text-navy-900">{x.label}</span>
                        <span className="block text-xs text-muted-foreground">{x.hint}</span>
                      </td>
                      <td />
                      <td className="px-2 py-2 text-center">
                        <Check id={x.key} label={x.label} checked={perms.has(x.key)} onChange={(on) => toggle(x.key, on)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <span>
                <span className="block text-sm font-medium text-navy-900">Only their own cities</span>
                <span className="block text-xs text-muted-foreground">
                  Members see and set up just the cities you assign to each of them (e.g. a Tiruppur manager).
                </span>
              </span>
              <Switch checked={scoped} onCheckedChange={setScoped} aria-label="Only their own cities" />
            </label>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isPending || name.trim().length < 2}>
                {isPending && <Loader2Icon className="animate-spin" />} {role ? "Save role" : "Create role"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Delete a role nobody holds (the API refuses one in use). */
export function DeleteRoleButton({ role }: { role: StaffRole }) {
  const [isOpen, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const members = role._count?.members ?? 0;
  return (
    <>
      <Button variant="ghost" size="sm" className="text-error hover:text-error" onClick={() => setOpen(true)} disabled={members > 0} title={members > 0 ? "Give its members another role first" : undefined}>
        <Trash2Icon /> Delete
      </Button>
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {role.name}?</DialogTitle>
            <DialogDescription>Nobody has this role, so nothing else changes.</DialogDescription>
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
                  const res = await deleteRole(role.id);
                  if (res.ok) {
                    toast.success(res.message);
                    setOpen(false);
                  } else toast.error(res.error);
                })
              }
            >
              {isPending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />} Delete role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
