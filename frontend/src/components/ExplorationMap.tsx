import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { COUNTRY_CENTROIDS } from '../countryCentroids';
import type { ExplorationResult } from '../api/types';
import { MAP_TILE_URL } from '../api/client';
import { explorationClusterOptions } from './explorationClusters';

type Country = ExplorationResult['countries'][number];
type CountryMarker = L.Marker & { publicationCount: number; highCount: number; selected: boolean };
const ALIASES: Record<string, string> = { USA: 'United States', 'United States of America': 'United States', UK: 'United Kingdom', Turkey: 'Türkiye' };

function coordinates(country: string): L.LatLngTuple | null {
  return COUNTRY_CENTROIDS[country] ?? COUNTRY_CENTROIDS[ALIASES[country] ?? ''] ?? null;
}

function markerIcon(count: number, high: number, label: string, clustered: boolean, selected = false) {
  const size = Math.min(58, 29 + Math.log2(count + 1) * 5);
  const content = document.createElement('div');
  content.className = `ex-country-marker ${clustered ? 'ex-country-cluster' : ''} ${high > 0 ? 'ex-country-marker--high' : ''} ${selected ? 'is-selected' : ''}`;
  content.style.width = `${size}px`;
  content.style.height = `${size}px`;
  content.textContent = String(count);
  const caption = document.createElement('span');
  caption.className = 'ex-country-label';
  caption.textContent = label;
  content.append(caption);
  return L.divIcon({ html: content, className: 'ex-leaflet-marker', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

function labelMarker(marker: L.Marker, label: string, selected?: boolean) {
  const element = marker.getElement();
  if (!element) return;
  element.setAttribute('aria-label', label);
  element.title = label;
  if (selected !== undefined) element.setAttribute('aria-pressed', String(selected));
}

export default function ExplorationMap({ countries, selected, onSelect }: {
  countries: Country[]; selected: string; onSelect: (country: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const markers = useRef(new Map<string, CountryMarker>());
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    const countryMarkers = markers.current;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Same engine and cluster behaviour as OMGA (minitoring-cde).
    // Only this effect owns the map: filters and marker clicks never recreate it.
    const map = L.map(container.current, {
      center: [20, 12], zoom: 2, minZoom: 0, maxZoom: 20,
      zoomControl: false, doubleClickZoom: false, closePopupOnClick: false,
      zoomAnimation: !reducedMotion, fadeAnimation: !reducedMotion,
    });
    const tiles = L.tileLayer(MAP_TILE_URL, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 20, noWrap: true,
    });
    tiles.on('tileerror', () => setMapError(true));
    tiles.on('tileload', () => setMapError(false));
    tiles.addTo(map);
    const clusters = L.markerClusterGroup({
      ...explorationClusterOptions,
      animate: !reducedMotion,
      iconCreateFunction: (cluster) => {
        const children = cluster.getAllChildMarkers() as CountryMarker[];
        const count = children.reduce((total, marker) => total + marker.publicationCount, 0);
        const high = children.reduce((total, marker) => total + marker.highCount, 0);
        const label = `${children.length} pays · ${count} mentions de publications, zoomer ou déployer`;
        // Leaflet replaces cluster elements during zoom; apply the accessible
        // label on each add as well as after a refresh.
        cluster.options.title = label;
        cluster.options.alt = label;
        return markerIcon(count, high, `${children.length} pays · zoomer`, true);
      },
    }).addTo(map);
    mapRef.current = map;
    clusterRef.current = clusters;
    map.setZoom(Math.max(0, Math.min(2, Math.floor(Math.log2(Math.max(256, map.getSize().x) / 256)))));
    const resize = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      tiles.off();
      map.remove();
      countryMarkers.clear();
      mapRef.current = null;
      clusterRef.current = null;
    };
  }, []);

  useEffect(() => {
    const clusters = clusterRef.current;
    if (!clusters) return;
    const nextCountries = new Set(countries.map((item) => item.country));
    for (const [country, marker] of markers.current) {
      if (!nextCountries.has(country)) {
        clusters.removeLayer(marker);
        markers.current.delete(country);
      }
    }
    for (const item of countries) {
      const point = coordinates(item.country);
      if (!point) continue;
      const label = `${item.country} : ${item.count} publications, ouvrir le flux`;
      let marker = markers.current.get(item.country);
      const icon = markerIcon(item.count, item.high, item.country, false, selected === item.country);
      if (!marker) {
        marker = L.marker(point, { icon, title: label, alt: label, keyboard: true, bubblingMouseEvents: false }) as CountryMarker;
        marker.on('click', () => onSelectRef.current(item.country));
        marker.on('add', () => labelMarker(marker!, marker!.options.title ?? label, marker!.selected));
        markers.current.set(item.country, marker);
        marker.publicationCount = item.count;
        marker.highCount = item.high;
        marker.selected = selected === item.country;
        clusters.addLayer(marker);
      } else {
        marker.setIcon(icon);
      }
      marker.publicationCount = item.count;
      marker.highCount = item.high;
      marker.options.title = label;
      marker.options.alt = label;
      marker.selected = selected === item.country;
      labelMarker(marker, label, selected === item.country);
    }
    clusters.refreshClusters();
  }, [countries, selected]);

  function resetWorld() {
    const map = mapRef.current;
    if (!map) return;
    onSelectRef.current('');
    const zoom = Math.max(0, Math.min(2, Math.floor(Math.log2(Math.max(256, map.getSize().x) / 256))));
    map.setView([20, 12], zoom, { animate: false });
  }

  return <div className="ex-map-canvas">
    <div ref={container} className="ex-leaflet-map" />
    <div className="ex-map-controls" aria-label="Navigation de la carte">
      <button type="button" onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom avant">+</button>
      <button type="button" onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom arrière">−</button>
      <button type="button" onClick={resetWorld} aria-label="Revenir à la vue monde">◎</button>
    </div>
    {mapError && <p className="ex-map-error" role="status">Fond de carte indisponible. Les pays et publications restent accessibles dans les filtres et le flux.</p>}
  </div>;
}
