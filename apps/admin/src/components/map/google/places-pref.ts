"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Whether the admin maps show Google's places (shops, hospitals, temples…): one choice per browser, every map. */
const KEY = "tt-map-places";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true; // storage blocked: places stay on
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function usePlacesShown(): [boolean, (shown: boolean) => void] {
  const shown = useSyncExternalStore(subscribe, read, () => true);
  const set = useCallback((next: boolean) => {
    try {
      localStorage.setItem(KEY, next ? "on" : "off");
    } catch {
      // not remembered; nothing else to do
    }
    for (const l of listeners) l();
  }, []);
  return [shown, set];
}
