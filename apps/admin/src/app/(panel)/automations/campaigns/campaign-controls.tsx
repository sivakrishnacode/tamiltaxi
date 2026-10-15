"use client";

import { BanIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { cancelCampaign, deleteCampaign } from "../../actions";

/** Cancel (a scheduled campaign: it won't be sent) or Delete (a sent or cancelled one: removed from the list), confirmed. */
export function CampaignAction({ id, title, kind }: { id: string; title: string; kind: "cancel" | "delete" }) {
  const [isOpen, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isCancel = kind === "cancel";
  return (
    <>
      {isCancel ? (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <BanIcon /> Cancel
        </Button>
      ) : (
        <Button variant="ghost" size="icon-sm" aria-label={`Delete “${title}”`} onClick={() => setOpen(true)}>
          <Trash2Icon />
        </Button>
      )}
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isCancel ? `Cancel “${title}”?` : `Delete “${title}”?`}</DialogTitle>
            <DialogDescription>
              {isCancel ? "It won't be sent. It stays in the list as cancelled." : "It disappears from this list. Riders who got it keep the notification."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{isCancel ? "Keep it" : "Back"}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const res = await (isCancel ? cancelCampaign(id) : deleteCampaign(id));
                  if (res.ok) {
                    toast.success(res.message);
                    setOpen(false);
                  } else toast.error(res.error);
                })
              }
            >
              {isPending ? <Loader2Icon className="animate-spin" /> : isCancel ? <BanIcon /> : <Trash2Icon />}
              {isCancel ? "Cancel campaign" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
