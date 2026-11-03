/** Light, low-clutter roadmap (Tamil Taxi map colours): POIs and transit off, locality names kept. */
export const TT_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#EEF0F3" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#EEF0F3" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#E2E8F0" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#64748B" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#D5E5F1" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#DDEBD8" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  // Navy-500 text with a white halo stays readable over coral hexagons.
  { elementType: "labels.text.fill", stylers: [{ color: "#64748B" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#FFFFFF" }, { weight: 3.5 }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#334155" }] },
  { featureType: "road.local", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#CBD5E1" }] },
];

/** Below zoom 14 neighbourhood names are hidden too (they collide with localities and zone labels). */
export const TT_MAP_STYLES_ZOOMED_OUT: google.maps.MapTypeStyle[] = [
  ...TT_MAP_STYLES,
  { featureType: "administrative.neighborhood", elementType: "labels", stylers: [{ visibility: "off" }] },
];

export const NEIGHBOURHOOD_MIN_ZOOM = 14;

export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? "";

/**
 * Map ID (a JavaScript vector map in the browser key's Google Cloud project). With one, the map's look comes from the
 * map style in Google Cloud (TT_MAP_STYLES imported there) and city boundaries can be drawn; without one, the maps use
 * TT_MAP_STYLES as before and show no boundary.
 */
export const GOOGLE_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID ?? "";

/** A second Map ID whose style hides Google's places (shops, hospitals…): the "Places" switch. Empty = no switch. */
export const GOOGLE_MAP_ID_NO_PLACES = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID_NO_PLACES ?? "";
