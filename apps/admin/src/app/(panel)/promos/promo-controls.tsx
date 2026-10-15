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
import { PLACEMENT_HINT, PLACEMENT_LABEL, PROMO_IMAGE_TYPES, PROMO_PLACEMENTS, promoInputError } from "@/lib/promos";
import type { PromoPlacement } from "@/lib/types";
import { cn } from "@/lib/utils";

import { createPromo, deletePromo, setBannerOrder, setPromoActive } from "../actions";

/** datetime-local (local time) → ISO, or "". */
function toIso(local: string): string {
  return local ? new Date(local).toISOString() : "";
}

export function NewPromoButton({ nextOrder }: { nextOrder: number }) {
  const [isOpen, setOpen] = useState(false);
  const [placement, setPlacement] = useState<PromoPlacement>("BANNER");
  const [title, setTitle] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [sortOrder, setSortOrder] = useState(String(nextOrder));
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [isPending, startTransition] = useTransition();
  const isBanner = placement === "BANNER";
  const input = { placement, title, image, linkUrl, sortOrder, startsAt: toIso(startsAt), endsAt: toIso(endsAt) };
  // Shown only once the form is filled in: an empty form isn't an error yet.
  const error = title.trim() && image ? promoInputError(input) : null;

  /** The chosen file and its preview; the previous preview's object URL is released. */
  function chooseImage(file: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    setImage(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  function reset() {
    setPlacement("BANNER");
    setTitle("");
    chooseImage(null);
    setLinkUrl("");
    setSortOrder(String(nextOrder));
    setStartsAt("");
    setEndsAt("");
  }

  return (
    <>
      <Button
        onClick={() => {
          setSortOrder(String(nextOrder));
          setOpen(true);
        }}
      >
        <PlusIcon /> New picture
      </Button>
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (promoInputError(input)) return;
              const form = new FormData();
              form.set("placement", placement);
              form.set("title", title);
              form.set("image", image!);
              form.set("linkUrl", linkUrl);
              form.set("sortOrder", sortOrder);
              form.set("startsAt", input.startsAt);
              form.set("endsAt", input.endsAt);
              startTransition(async () => {
                const res = await createPromo(form);
                if (res.ok) {
                  toast.success(res.message);
                  setOpen(false);
                  reset();
                } else toast.error(res.error);
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>New picture</DialogTitle>
              <DialogDescription>For the passenger app. It goes live at its start time, until you hide it or it ends.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label>Where</Label>
              <Select value={placement} onValueChange={(v) => setPlacement(v as PromoPlacement)}>
                <SelectTrigger className="w-full" aria-label="Where">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROMO_PLACEMENTS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PLACEMENT_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="promo-image">Picture</Label>
              <Input
                id="promo-image"
                type="file"
                accept={PROMO_IMAGE_TYPES.join(",")}
                onChange={(e) => chooseImage(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">{PLACEMENT_HINT[placement]} JPG, PNG or WebP, up to 2 MB.</p>
              {preview && (
                // eslint-disable-next-line @next/next/no-img-element -- a local preview (object URL) of the chosen file
                <img
                  src={preview}
                  alt="Preview"
                  className={cn(
                    "rounded-lg border bg-muted object-cover",
                    isBanner ? "aspect-[2/1] w-full" : "aspect-[9/20] w-32",
                  )}
                />
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="promo-title">What it says</Label>
              <Input
                id="promo-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                placeholder={isBanner ? "e.g. Drive with Tamil Taxi: zero commission" : "e.g. Happy Diwali from Tamil Taxi"}
              />
              <p className="text-xs text-muted-foreground">Read aloud to riders who use a screen reader.</p>
            </div>
            {isBanner && (
              <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
                <div className="grid gap-2">
                  <Label htmlFor="promo-link">Link (optional)</Label>
                  <Input
                    id="promo-link"
                    type="url"
                    inputMode="url"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    maxLength={500}
                    placeholder="https://"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="promo-order">Order</Label>
                  <Input
                    id="promo-order"
                    type="number"
                    min={0}
                    max={999}
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                  />
                </div>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="promo-starts">Starts (optional)</Label>
                <Input id="promo-starts" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="promo-ends">Ends (optional)</Label>
                <Input id="promo-ends" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </div>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={!!promoInputError(input) || isPending}>
                {isPending && <Loader2Icon className="animate-spin" />} Publish
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PromoToggle({ id, isActive, title }: { id: string; isActive: boolean; title: string }) {
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
          const res = await setPromoActive(id, next);
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

/** A banner's place in the row: saved when the field loses focus (or on Enter). */
export function BannerOrderInput({ id, sortOrder, title }: { id: string; sortOrder: number; title: string }) {
  const [value, setValue] = useState(String(sortOrder));
  const [isPending, startTransition] = useTransition();

  function save() {
    const next = Number(value);
    if (value.trim() === "" || next === sortOrder) return setValue(String(sortOrder));
    startTransition(async () => {
      const res = await setBannerOrder(id, next);
      if (res.ok) toast.success(res.message);
      else {
        setValue(String(sortOrder));
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={`order-${id}`} className="text-xs text-muted-foreground">
        Order
      </Label>
      <Input
        id={`order-${id}`}
        type="number"
        min={0}
        max={999}
        value={value}
        disabled={isPending}
        aria-label={`Order of “${title}”`}
        className="h-8 w-16"
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </div>
  );
}

export function DeletePromoButton({ id, title }: { id: string; title: string }) {
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
            <DialogDescription>
              It leaves the app at once (a splash already on phones goes at their next start). This can&apos;t be undone.
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
                  const res = await deletePromo(id);
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
