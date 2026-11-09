"use client";

import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import type { AnnouncementAudience } from "@/lib/types";

import { createAnnouncement, deleteAnnouncement, setAnnouncementActive } from "../../actions";

const AUDIENCE_LABEL: Record<AnnouncementAudience, string> = {
  ALL: "Everyone",
  PASSENGER: "Riders",
  DRIVER: "Drivers",
};

export function NewAnnouncementButton({ cities }: { cities: { id: string; name: string }[] }) {
  const [isOpen, setOpen] = useState(false);
  const [audience, setAudience] = useState<AnnouncementAudience>("ALL");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [cityId, setCityId] = useState("ALL");
  const [endsAt, setEndsAt] = useState("");
  const [isPending, startTransition] = useTransition();
  const isValid = title.trim().length >= 3 && title.trim().length <= 80 && body.trim().length >= 3 && body.trim().length <= 500;

  function reset() {
    setAudience("ALL");
    setTitle("");
    setBody("");
    setCityId("ALL");
    setEndsAt("");
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon /> New announcement
      </Button>
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!isValid) return;
              startTransition(async () => {
                const res = await createAnnouncement({
                  audience,
                  title,
                  body,
                  cityId: cityId === "ALL" ? undefined : cityId,
                  // datetime-local is local time; the action converts it to ISO.
                  endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
                });
                if (res.ok) {
                  toast.success(res.message);
                  setOpen(false);
                  reset();
                } else toast.error(res.error);
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>New announcement</DialogTitle>
              <DialogDescription>Shown as a banner in the Tamil Taxi apps while it is active.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Audience</Label>
                <Select value={audience} onValueChange={(v) => setAudience(v as AnnouncementAudience)}>
                  <SelectTrigger className="w-full" aria-label="Audience">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(AUDIENCE_LABEL) as AnnouncementAudience[]).map((a) => (
                      <SelectItem key={a} value={a}>
                        {AUDIENCE_LABEL[a]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>City</Label>
                <Select value={cityId} onValueChange={setCityId}>
                  <SelectTrigger className="w-full" aria-label="City">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All cities</SelectItem>
                    {cities.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ann-title">Title</Label>
              <Input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="e.g. Heavy rain near Ukkadam" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ann-body">Message</Label>
              <Textarea id="ann-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} rows={4} />
              <p className="text-xs text-muted-foreground">{body.trim().length}/500</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ann-ends">Ends (optional)</Label>
              <Input id="ann-ends" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={!isValid || isPending}>
                {isPending && <Loader2Icon className="animate-spin" />} Publish
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AnnouncementToggle({ id, isActive, title }: { id: string; isActive: boolean; title: string }) {
  const [checked, setChecked] = useState(isActive);
  const [isPending, startTransition] = useTransition();
  return (
    <Switch
      checked={checked}
      disabled={isPending}
      aria-label={`Show “${title}”`}
      onCheckedChange={(next) => {
        setChecked(next);
        startTransition(async () => {
          const res = await setAnnouncementActive(id, next);
          if (res.ok) toast.success(res.message);
          else {
            setChecked(!next);
            toast.error(res.error);
          }
        });
      }}
    />
  );
}

export function DeleteAnnouncementButton({ id, title }: { id: string; title: string }) {
  const [isOpen, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label={`Delete “${title}”`} onClick={() => setOpen(true)}>
        <Trash2Icon />
      </Button>
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{title}”?</DialogTitle>
            <DialogDescription>It disappears from the apps immediately. This can&apos;t be undone.</DialogDescription>
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
                  const res = await deleteAnnouncement(id);
                  if (res.ok) {
                    toast.success(res.message);
                    setOpen(false);
                  } else toast.error(res.error);
                })
              }
            >
              {isPending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
