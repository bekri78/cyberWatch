import type { MarkerClusterGroupOptions } from 'leaflet';

// OMGA's NEWS layer, including the zoom-8 cutoff and overlap expansion.
export const explorationClusterOptions: MarkerClusterGroupOptions = {
  maxClusterRadius: (zoom: number) => {
    if (zoom <= 3) return 80;
    if (zoom <= 4) return 50;
    if (zoom <= 5) return 30;
    if (zoom <= 6) return 15;
    if (zoom <= 7) return 5;
    return 1;
  },
  disableClusteringAtZoom: 8,
  showCoverageOnHover: false,
  zoomToBoundsOnClick: true,
  spiderfyOnMaxZoom: true,
  spiderfyDistanceMultiplier: 3.5,
  animateAddingMarkers: false,
};
