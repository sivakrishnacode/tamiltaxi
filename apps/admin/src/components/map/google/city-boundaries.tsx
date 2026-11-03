"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { useEffect } from "react";

/** The city limits: a rose line (apart from the zone and service-area colours) with the inside a touch lighter. */
const CITY_BOUNDARY_STYLE: google.maps.FeatureStyleOptions = {
  strokeColor: "#DB2777",
  strokeOpacity: 0.9,
  strokeWeight: 2,
  fillColor: "#FFFFFF",
  fillOpacity: 0.3,
};

/**
 * Google's own boundary of each city in [placeIds] (data-driven styling: the LOCALITY layer, which the map ID's style
 * must have switched on; without it nothing is drawn). Drawn under the hexagon layers.
 */
export function CityBoundaries({ placeIds }: { placeIds: readonly string[] }) {
  const map = useMap();
  const key = [...placeIds].sort().join(",");

  useEffect(() => {
    if (!map) return;
    const ids = new Set(key.split(",").filter(Boolean));
    const layer = map.getFeatureLayer(google.maps.FeatureType.LOCALITY);
    // The map's style (and so the layer) can arrive after the map: apply again when its capabilities change.
    const apply = () => {
      if (!layer.isAvailable) return;
      layer.style = ({ feature }) => (ids.has((feature as google.maps.PlaceFeature).placeId) ? CITY_BOUNDARY_STYLE : null);
    };
    apply();
    const listener = map.addListener("mapcapabilities_changed", apply);
    return () => {
      listener.remove();
      layer.style = null;
    };
  }, [map, key]);

  return null;
}
