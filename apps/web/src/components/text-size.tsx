"use client";

import { useSyncExternalStore } from "react";

/**
 * A−  A  A+ in the top bar, as on Tamil Nadu Government sites (cumta.tn.gov.in): scales the whole page through the
 * root font size (globals.css, html[data-text-size]). The choice is remembered on this device; textSizeScript applies
 * it before the page paints.
 */
const sizes = [
  { value: "normal", label: "A", name: "Normal text" },
  { value: "large", label: "A+", name: "Larger text" },
  { value: "larger", label: "A++", name: "Largest text" },
] as const;

type Size = (typeof sizes)[number]["value"];

const key = "tt-text-size";
const listeners = new Set<() => void>();

function current(): Size {
  return (document.documentElement.dataset.textSize as Size | undefined) ?? "normal";
}

function setSize(size: Size) {
  if (size === "normal") delete document.documentElement.dataset.textSize;
  else document.documentElement.dataset.textSize = size;
  try {
    localStorage.setItem(key, size);
  } catch {
    // Private windows and blocked storage: the size still applies to this page.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Inline in <head>: applies the saved size before the first paint, so the page doesn't jump. */
export const textSizeScript =
  `try{var s=localStorage.getItem("${key}");if(s==="large"||s==="larger")document.documentElement.dataset.textSize=s}catch(e){}`;

export function TextSize() {
  const active = useSyncExternalStore(subscribe, current, () => "normal" as Size);
  return (
    <div role="group" aria-label="Text size" className="flex items-center gap-1">
      <span className="mr-1 hidden sm:inline">Text size</span>
      {sizes.map((s) => (
        <button
          key={s.value}
          type="button"
          onClick={() => setSize(s.value)}
          aria-pressed={active === s.value}
          aria-label={s.name}
          className="min-w-7 rounded-md px-1.5 py-0.5 font-semibold text-white/70 hover:bg-white/10 hover:text-white aria-pressed:bg-white aria-pressed:text-navy-950"
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
