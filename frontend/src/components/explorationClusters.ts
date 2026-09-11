import type { MarkerClusterGroupOptions } from 'leaflet';

// OMGA's event cluster settings: progressively separate nearby points and
// spiderfy coincident markers so every country remains individually clickable.
export const explorationClusterOptions: MarkerClusterGroupOptions = {
  maxClusterRadius: (zoom: number) => {
    if (zoom <= 3) return 60;
    if (zoom <= 5) return 25;
    if (zoom <= 6) return 10;
    return 5;
  },
  showCoverageOnHover: false,
  zoomToBoundsOnClick: true,
  spiderfyOnMaxZoom: true,
  spiderfyDistanceMultiplier: 2,
  animateAddingMarkers: false,
};
