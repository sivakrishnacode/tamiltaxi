"use client";

import { Loader2Icon, PencilIcon, PlusIcon, ShuffleIcon, Trash2Icon } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { PushPreview } from "@/components/common/push-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  conversionLabel,
  KIND_PLACEHOLDERS,
  MESSAGE_BODY_MAX,
  MESSAGE_KIND_LABEL,
  MESSAGE_TITLE_MAX,
  PLACEHOLDER_HINT,
  reminderMessageError,
  samplePreview,
} from "@/lib/automations";
import { formatCount } from "@/lib/format";
import type { ReminderMessage, ReminderMessageKind } from "@/lib/types";
import { cn } from "@/lib/utils";

import { createReminderMessage, deleteReminderMessage, setReminderMessageActive, updateReminderMessage } from "../../actions";

/** [text] with each {word} as a small coral chip. */
function WithChips({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\{[a-zA-Z]+\})/g).map((part, i) =>
        /^\{[a-zA-Z]+\}$/.test(part) ? (
          <span key={i} className="mx-px rounded bg-coral-50 px-1 font-mono text-[0.85em] text-coral-700">
            {part.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** Add or edit one message: kind (when new and there is a choice), title, text, words to insert, live preview. */
function MessageDialog({
  kinds,
  message,
  open,
  onOpenChange,
}: {
  kinds: readonly ReminderMessageKind[];
  message?: ReminderMessage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [kind, setKind] = useState<ReminderMessageKind>(message?.kind ?? kinds[0]);
  const [title, setTitle] = useState(message?.title ?? "");
  const [body, setBody] = useState(message?.body ?? "");
  const lastField = useRef<"title" | "body">("title");
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [isPending, startTransition] = useTransition();
  const error = title.trim() || body.trim() ? reminderMessageError(kind, title, body) : null;
  const isValid = !!title.trim() && !!body.trim() && !error;

  /** Puts {word} at the cursor of the field used last. */
  function insert(word: string) {
    const isTitle = lastField.current === "title";
    const el = isTitle ? titleRef.current : bodyRef.current;
    const value = isTitle ? title : body;
    const at = el?.selectionStart ?? value.length;
    const next = `${value.slice(0, at)}{${word}}${value.slice(el?.selectionEnd ?? at)}`;
    (isTitle ? setTitle : setBody)(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + word.length + 2, at + word.length + 2);
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    startTransition(async () => {
      const res = message ? await updateReminderMessage(message.id, message.kind, { title, body }) : await createReminderMessage({ kind, title, body });
      if (res.ok) {
        toast.success(res.message);
        onOpenChange(false);
        if (!message) {
          setTitle("");
          setBody("");
        }
      } else toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form className="grid gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{message ? "Edit message" : "New message"}</DialogTitle>
            <DialogDescription>Each reminder picks one of its messages at random. Words in braces are filled in for each rider.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 md:grid-cols-[1fr_15rem]">
            <div className="grid content-start gap-4">
              {!message && kinds.length > 1 && (
                <div className="grid gap-2">
                  <Label>For</Label>
                  <div className="flex gap-2" role="radiogroup" aria-label="Which search">
                    {kinds.map((k) => (
                      <Button key={k} type="button" size="sm" variant={k === kind ? "default" : "outline"} role="radio" aria-checked={k === kind} onClick={() => setKind(k)}>
                        {MESSAGE_KIND_LABEL[k]}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="msg-title">Title</Label>
                <Input
                  id="msg-title"
                  ref={titleRef}
                  value={title}
                  maxLength={MESSAGE_TITLE_MAX}
                  onFocus={() => (lastField.current = "title")}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="{name}, {drop}?"
                />
                <p className="text-right text-xs text-muted-foreground tabular-nums">
                  {title.trim().length}/{MESSAGE_TITLE_MAX}
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="msg-body">Message</Label>
                <Textarea
                  id="msg-body"
                  ref={bodyRef}
                  value={body}
                  rows={3}
                  maxLength={MESSAGE_BODY_MAX}
                  onFocus={() => (lastField.current = "body")}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Drivers are nearby. Book now and get there on time."
                />
                <p className="text-right text-xs text-muted-foreground tabular-nums">
                  {body.trim().length}/{MESSAGE_BODY_MAX}
                </p>
              </div>
              <div className="grid gap-2">
                <p className="text-xs font-medium text-muted-foreground">Insert a word</p>
                <div className="flex flex-wrap gap-1.5">
                  {KIND_PLACEHOLDERS[kind].map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => insert(w)}
                      title={PLACEHOLDER_HINT[w]}
                      className="rounded-md border border-coral-100 bg-coral-50 px-2 py-0.5 font-mono text-xs text-coral-700 hover:bg-coral-100"
                    >
                      {`{${w}}`}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">A message with {"{name}"} is skipped for riders who haven&apos;t given a name.</p>
              </div>
              {error && <p className="text-sm text-error">{error}</p>}
            </div>
            <div className="grid content-start gap-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Preview</p>
              <PushPreview title={samplePreview(kind, title)} body={samplePreview(kind, body)} caption={MESSAGE_KIND_LABEL[kind]} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!isValid || isPending}>
              {isPending && <Loader2Icon className="animate-spin" />} {message ? "Save" : "Add message"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MessageRow({ message, showKind, disabled }: { message: ReminderMessage; showKind: boolean; disabled: boolean }) {
  const [isEditing, setEditing] = useState(false);
  const [isConfirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const act = (fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });

  return (
    <li className={cn("grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-[1fr_auto] sm:items-center", !message.isActive && "bg-muted/40")}>
      <div className={cn("min-w-0", !message.isActive && "opacity-60")}>
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-navy-900">
          {showKind && <Badge variant="outline">{MESSAGE_KIND_LABEL[message.kind]}</Badge>}
          <span className="min-w-0 break-words">
            <WithChips text={message.title} />
          </span>
        </p>
        <p className="mt-0.5 text-sm break-words text-navy-700">
          <WithChips text={message.body} />
        </p>
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
          {message.sent30d ? `Sent ${formatCount(message.sent30d)} · booked ${conversionLabel(message.sent30d, message.booked30d)} · 30 days` : "Not sent in the last 30 days"}
        </p>
      </div>
      <div className="flex items-center gap-1 justify-self-end">
        {isPending && <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-hidden />}
        <Switch
          checked={message.isActive}
          disabled={disabled || isPending}
          onCheckedChange={(v) => act(() => setReminderMessageActive(message.id, v))}
          aria-label={`Message "${message.title}": in rotation or off`}
        />
        <Button type="button" variant="ghost" size="icon" disabled={disabled} onClick={() => setEditing(true)} aria-label="Edit message">
          <PencilIcon />
        </Button>
        {isConfirming ? (
          <Button type="button" variant="destructive" size="sm" disabled={isPending} onClick={() => act(() => deleteReminderMessage(message.id))} onBlur={() => setConfirming(false)}>
            Delete?
          </Button>
        ) : (
          <Button type="button" variant="ghost" size="icon" disabled={disabled} onClick={() => setConfirming(true)} aria-label="Delete message">
            <Trash2Icon />
          </Button>
        )}
      </div>
      {isEditing && <MessageDialog kinds={[message.kind]} message={message} open={isEditing} onOpenChange={setEditing} />}
    </li>
  );
}

/** A reminder's messages (one picked at random per send) with Add, on / off, edit and delete. */
export function MessageList({ kinds, messages, disabled }: { kinds: readonly ReminderMessageKind[]; messages: readonly ReminderMessage[] | null; disabled: boolean }) {
  const [isAdding, setAdding] = useState(false);
  const mine = (messages ?? []).filter((m) => kinds.includes(m.kind));
  const active = mine.filter((m) => m.isActive).length;

  return (
    <div className="grid gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <ShuffleIcon className="size-3.5" aria-hidden /> Messages · {active} in rotation, one picked at random
        </p>
        {messages && (
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setAdding(true)}>
            <PlusIcon /> Add message
          </Button>
        )}
      </div>
      {!messages ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Messages arrive with the next API update; the built-in text is sent until then.</p>
      ) : mine.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">No messages: the built-in text is sent. Add one to write your own.</p>
      ) : (
        <ul className="grid gap-2">
          {mine.map((m) => (
            <MessageRow key={m.id} message={m} showKind={kinds.length > 1} disabled={disabled} />
          ))}
        </ul>
      )}
      {active === 0 && mine.length > 0 && <p className="text-xs text-warning-text">Every message is off: the built-in text is sent.</p>}
      {isAdding && <MessageDialog kinds={kinds} open={isAdding} onOpenChange={setAdding} />}
    </div>
  );
}
