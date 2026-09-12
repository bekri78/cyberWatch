import type { MarkerClusterGroupOptions } from 'leaflet';

// WorldMap event radii; nearby publications split progressively without spider legs.
export const explorationClusterOptions: MarkerClusterGroupOptions = {
  maxClusterRadius: (zoom: number) => {
    if (zoom <= 3) return 60;
    if (zoom <= 5) return 25;
    if (zoom <= 6) return 10;
    return 5;
  },
  showCoverageOnHover: false,
  zoomToBoundsOnClick: false,
  spiderfyOnMaxZoom: false,
  animateAddingMarkers: false,
};
