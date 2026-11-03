"use client";

import { APIProvider, Map, useApiLoadingStatus, useMap, type MapProps } from "@vis.gl/react-google-maps";
import { MapPinOffIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { CityBoundaries } from "./city-boundaries";
import { usePlacesShown } from "./places-pref";
import { GOOGLE_MAP_ID, GOOGLE_MAP_ID_NO_PLACES, GOOGLE_MAPS_KEY, NEIGHBOURHOOD_MIN_ZOOM, TT_MAP_STYLES, TT_MAP_STYLES_ZOOMED_OUT } from "./style";

export type MapType = "roadmap" | "hybrid";

declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

/** Google calls window.gm_authFailure for bad keys and for keys whose Maps JavaScript API isn't enabled. */
function useAuthFailure(): boolean {
  const [isFailed, setFailed] = useState(false);
  useEffect(() => {
    const previous = window.gm_authFailure;
    window.gm_authFailure = () => {
      setFailed(true);
      previous?.();
    };
    return () => {
      window.gm_authFailure = previous;
    };
  }, []);
  return isFailed;
}

/** Swaps the style at zoom 14 so neighbourhood names only appear when there's room for them. */
function ZoomStyles() {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    let isZoomedIn: boolean | null = null;
    const apply = () => {
      const next = (map.getZoom() ?? 0) >= NEIGHBOURHOOD_MIN_ZOOM;
      if (next === isZoomedIn) return;
      isZoomedIn = next;
      map.setOptions({ styles: next ? TT_MAP_STYLES : TT_MAP_STYLES_ZOOMED_OUT });
    };
    apply();
    const l = map.addListener("zoom_changed", apply);
    return () => l?.remove();
  }, [map]);
  return null;
}

function StatusOverlay() {
  const status = useApiLoadingStatus();
  const isAuthFailed = useAuthFailure();
  let message: { title: string; body: string } | null = null;
  if (!GOOGLE_MAPS_KEY) {
    message = {
      title: "Google Maps key missing",
      body: "Set NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY (apps/admin/.env.local, or GOOGLE_MAPS_BROWSER_KEY for Docker) and rebuild.",
    };
  } else if (isAuthFailed || status === "AUTH_FAILURE") {
    message = {
      title: "Google Maps refused this key",
      body: "Enable the Maps JavaScript API for this key in Google Cloud → APIs & Services → Library (and check the key's referrer restrictions).",
    };
  } else if (status === "FAILED") {
    message = { title: "Couldn't load Google Maps", body: "Check the internet connection, then reload the page." };
  }
  if (!message) return null;
  return (
    <div role="alert" className="absolute inset-0 z-20 flex items-center justify-center bg-muted p-6 text-center">
      <div className="max-w-sm space-y-2">
        <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-error-tint text-error">
          <MapPinOffIcon className="size-5" aria-hidden />
        </span>
        <p className="font-heading font-semibold text-navy-900">{message.title}</p>
        <p className="text-sm text-navy-700">{message.body}</p>
      </div>
    </div>
  );
}

/**
 * Google map with Tamil Taxi styling. Children run inside the map context (useMap); [overlay] is absolutely positioned
 * UI on top of the map (search box, toolbars). [boundaries]: Google place IDs of the cities whose limits to outline
 * (needs GOOGLE_MAP_ID; cities without a place ID are skipped).
 */
export function TtMap({
  center,
  zoom = 12,
  mapType = "roadmap",
  className,
  overlay,
  children,
  options,
  boundaries,
}: {
  center: google.maps.LatLngLiteral;
  zoom?: number;
  mapType?: MapType;
  className?: string;
  overlay?: React.ReactNode;
  children?: React.ReactNode;
  options?: Partial<MapProps>;
  boundaries?: readonly (string | null)[];
}) {
  const placeIds = (boundaries ?? []).filter((id): id is string => !!id);
  // A map ID can't change on a live map: the "Places" switch picks the other ID and the map is made again.
  const [isPlacesShown] = usePlacesShown();
  const mapId = !isPlacesShown && GOOGLE_MAP_ID_NO_PLACES ? GOOGLE_MAP_ID_NO_PLACES : GOOGLE_MAP_ID;
  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-[#EEF0F3]", className)}>
      {/* English labels. Note: Google still adds local-script names on India tiles for every language/region
          combination (tested en/IN, en, en/US, en-GB/GB), so clutter is reduced in the style instead. */}
      <APIProvider apiKey={GOOGLE_MAPS_KEY} language="en" region="IN">
        {GOOGLE_MAPS_KEY && (
          <Map
            key={mapId}
            className="h-full w-full"
            defaultCenter={center}
            defaultZoom={zoom}
            mapTypeId={mapType}
            // A map ID brings its own style from Google Cloud (and ignores `styles`).
            {...(mapId ? { mapId } : { styles: TT_MAP_STYLES_ZOOMED_OUT })}
            gestureHandling="greedy"
            clickableIcons={false}
            disableDefaultUI
            zoomControl
            {...options}
          >
            {!GOOGLE_MAP_ID && <ZoomStyles />}
            {GOOGLE_MAP_ID && placeIds.length > 0 && <CityBoundaries placeIds={placeIds} />}
            {children}
          </Map>
        )}
        {overlay}
        <StatusOverlay />
      </APIProvider>
    </div>
  );
}
