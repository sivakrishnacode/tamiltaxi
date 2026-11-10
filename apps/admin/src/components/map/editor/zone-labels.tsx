"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { useEffect, useRef } from "react";

export interface ZoneLabel {
  readonly id: string;
  /** Short text shown on the map (zone name). */
  readonly text: string;
  /** Full description on hover (name · kind · multiplier). */
  readonly title: string;
  /** Small badge after the name, e.g. "1.2×" for surge zones. */
  readonly badge?: string;
  readonly lat: number;
  readonly lng: number;
  readonly color: string;
  /** Higher wins when labels would overlap (active and larger zones first). */
  readonly priority: number;
}

interface Rect {
  readonly l: number;
  readonly t: number;
  readonly r: number;
  readonly b: number;
}

const overlaps = (a: Rect, b: Rect) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

/**
 * Zone names as small pills in one OverlayView: hidden below [minZoom], and a label whose box would overlap an
 * already placed (higher-priority) label is skipped, so names never pile up on each other. With [onSelect] a label is a
 * button (click or Enter) that reports its zone id; the map ignores those clicks (no pan, no painting).
 */
export function ZoneLabels({ labels, minZoom = 13, onSelect }: { labels: readonly ZoneLabel[]; minZoom?: number; onSelect?: (id: string) => void }) {
  const map = useMap();
  const select = useRef(onSelect);
  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);
  const isClickable = !!onSelect;
  useEffect(() => {
    if (!map) return;
    const sorted = [...labels].sort((a, b) => b.priority - a.priority);
    const overlay = new google.maps.OverlayView();
    const container = document.createElement("div");
    container.style.position = "absolute";
    const els = sorted.map((l) => {
      const el = document.createElement("div");
      el.title = l.title;
      el.setAttribute("role", isClickable ? "button" : "note");
      el.style.cssText =
        "position:absolute;transform:translate(-50%,-50%);display:none;align-items:center;gap:4px;white-space:nowrap;" +
        "padding:2px 7px;border-radius:9999px;background:rgba(255,255,255,.92);box-shadow:0 1px 3px rgba(30,41,59,.25);" +
        `font:600 11px/16px Inter,system-ui,sans-serif;color:#1E293B;cursor:${isClickable ? "pointer" : "default"}`;
      if (isClickable) {
        el.tabIndex = 0;
        el.setAttribute("aria-label", `Show ${l.text} in the list`);
        google.maps.OverlayView.preventMapHitsAndGesturesFrom(el);
        el.addEventListener("click", () => select.current?.(l.id));
        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            select.current?.(l.id);
          }
        });
      }
      const dot = document.createElement("span");
      dot.style.cssText = `width:7px;height:7px;border-radius:9999px;background:${l.color};flex:none`;
      el.append(dot, document.createTextNode(l.text));
      if (l.badge) {
        const badge = document.createElement("span");
        badge.textContent = l.badge;
        badge.style.cssText = "color:#A8330E;font-weight:700";
        el.append(badge);
      }
      container.append(el);
      return el;
    });
    overlay.onAdd = () => overlay.getPanes()?.overlayMouseTarget.append(container);
    overlay.onRemove = () => container.remove();
    overlay.draw = () => {
      const proj = overlay.getProjection();
      const zoom = map.getZoom() ?? 0;
      if (!proj) return;
      const placed: Rect[] = [];
      sorted.forEach((l, i) => {
        const el = els[i];
        if (zoom < minZoom) {
          el.style.display = "none";
          return;
        }
        const p = proj.fromLatLngToDivPixel(new google.maps.LatLng(l.lat, l.lng));
        if (!p) return;
        el.style.left = `${p.x}px`;
        el.style.top = `${p.y}px`;
        el.style.display = "flex";
        const w = el.offsetWidth + 6;
        const h = el.offsetHeight + 4;
        const rect = { l: p.x - w / 2, t: p.y - h / 2, r: p.x + w / 2, b: p.y + h / 2 };
        if (placed.some((r) => overlaps(r, rect))) el.style.display = "none";
        else placed.push(rect);
      });
    };
    overlay.setMap(map);
    return () => overlay.setMap(null);
  }, [map, labels, minZoom, isClickable]);
  return null;
}
