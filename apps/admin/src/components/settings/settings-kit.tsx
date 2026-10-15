"use client";

import { Loader2Icon, SaveIcon, Undo2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { validateSettings, type SettingValue, type SettingsErrors, type SettingsInput } from "@/lib/validation";

// Building blocks of the settings forms (Settings, Engage › Automations): one draft, the same fields, one save bar.

export interface FieldDef {
  readonly key: string;
  readonly label: string;
  readonly hint: string;
  readonly step?: string;
  readonly suffix?: string;
}

export type Draft = Record<string, string | boolean>;

function toDraft(s: Record<string, SettingValue>): Draft {
  return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === "boolean" ? v : String(v)]));
}

/** Converts the draft back using each key's type in the API response. */
function fromDraft(d: Draft, types: Record<string, SettingValue>): SettingsInput {
  return Object.fromEntries(
    Object.entries(d).map(([k, v]) => {
      const t = typeof types[k];
      if (t === "boolean") return [k, v === true];
      if (t === "number") return [k, String(v).trim() === "" ? Number.NaN : Number(v)];
      return [k, String(v).trim()];
    }),
  ) as SettingsInput;
}

type SaveResult = { ok: true; message: string } | { ok: false; error: string };

export interface SettingsDraft {
  readonly draft: Draft;
  readonly types: Record<string, SettingValue>;
  readonly errors: SettingsErrors;
  readonly hasErrors: boolean;
  /** Keys that differ from the last saved values. */
  readonly changed: readonly string[];
  readonly isPending: boolean;
  set(key: string, value: string | boolean): void;
  discard(): void;
  submit(e: React.FormEvent): void;
}

/** Draft over [initial] (a settings response): edits are kept until saved or discarded; only changed keys are sent. */
export function useSettingsDraft(initial: Record<string, SettingValue>, save: (patch: SettingsInput) => Promise<SaveResult>): SettingsDraft {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [saved, setSaved] = useState<Draft>(() => toDraft(initial));
  const [isPending, startTransition] = useTransition();
  const parsed = fromDraft(draft, initial);
  const errors = validateSettings(parsed);
  const hasErrors = Object.keys(errors).length > 0;
  const changed = Object.keys(draft).filter((k) => draft[k] !== saved[k]);

  return {
    draft,
    types: initial,
    errors,
    hasErrors,
    changed,
    isPending,
    set: (key, value) => setDraft((d) => ({ ...d, [key]: value })),
    discard: () => setDraft(saved),
    submit: (e) => {
      e.preventDefault();
      if (hasErrors || changed.length === 0) return;
      const patch = Object.fromEntries(changed.map((k) => [k, parsed[k]])) as SettingsInput;
      const sent = draft;
      startTransition(async () => {
        const res = await save(patch);
        if (res.ok) {
          setSaved(sent);
          toast.success(res.message);
        } else toast.error(res.error);
      });
    },
  };
}

/** One setting: an on/off row for a boolean, else an input with its unit, hint and error. */
export function SettingField({ field: f, form, className }: { field: FieldDef; form: SettingsDraft; className?: string }) {
  const error = form.errors[f.key];
  const value = form.draft[f.key];
  const type = typeof form.types[f.key];
  if (type === "boolean") {
    return (
      <label className={cn("flex items-start justify-between gap-3 rounded-lg border p-3 sm:col-span-2", className)}>
        <span>
          <span className="block text-sm font-medium text-navy-900">{f.label}</span>
          <span className="block text-xs text-muted-foreground">{f.hint}</span>
        </span>
        <Switch checked={value === true} onCheckedChange={(v) => form.set(f.key, v)} aria-label={f.label} />
      </label>
    );
  }
  const isNumber = type === "number";
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={f.key}>{f.label}</Label>
      <div className="relative">
        <Input
          id={f.key}
          type={isNumber ? "number" : f.key === "supportPhone" ? "tel" : "text"}
          inputMode={isNumber ? "decimal" : undefined}
          step={f.step}
          value={String(value ?? "")}
          onChange={(e) => form.set(f.key, e.target.value)}
          aria-invalid={!!error}
          aria-describedby={`${f.key}-hint`}
          className={f.suffix ? "pr-14" : undefined}
        />
        {f.suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">{f.suffix}</span>}
      </div>
      <p id={`${f.key}-hint`} className={error ? "text-xs text-error" : "text-xs text-muted-foreground"}>
        {error ?? f.hint}
      </p>
    </div>
  );
}

/** Bar at the end of a settings form, sticky at the bottom of the screen while there are edits: what is unsaved (and where), Discard and Save. */
export function SaveBar({ form, where, label = "Save settings", disabled, className }: { form: SettingsDraft; where?: string; label?: string; disabled?: boolean; className?: string }) {
  const count = form.changed.length;
  const status = form.hasErrors
    ? "Fix the highlighted fields to save."
    : count
      ? `${count} unsaved change${count > 1 ? "s" : ""}${where ? ` in ${where}` : ""}.`
      : "All changes saved.";
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/95 px-4 py-3 backdrop-blur",
        count ? "sticky bottom-3 z-20 border-coral-100 shadow-lg" : "shadow-sm",
        className,
      )}
    >
      <p className={cn("min-w-0 text-sm", form.hasErrors ? "text-error" : count ? "font-medium text-navy-900" : "text-muted-foreground")} aria-live="polite">
        {status}
      </p>
      <div className="flex items-center gap-2">
        {count > 0 && (
          <Button type="button" variant="ghost" onClick={form.discard} disabled={form.isPending}>
            <Undo2Icon /> Discard
          </Button>
        )}
        <Button type="submit" disabled={disabled || count === 0 || form.hasErrors || form.isPending}>
          {form.isPending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} {label}
        </Button>
      </div>
    </div>
  );
}
