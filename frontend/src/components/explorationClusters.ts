import type { MarkerClusterGroupOptions } from 'leaflet';

// Keep 36px cluster badges from splitting into overlapping groups.
export const CLUSTER_FEED_LIMIT = 20;
export const explorationClusterOptions: MarkerClusterGroupOptions = {
  maxClusterRadius: (zoom: number) => {
    if (zoom <= 3) return 60;
    if (zoom <= 5) return 50;
    return 40;
  },
  showCoverageOnHover: false,
  zoomToBoundsOnClick: false,
  spiderfyOnMaxZoom: false,
  animateAddingMarkers: false,
};
