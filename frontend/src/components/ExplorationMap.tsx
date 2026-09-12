import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import type { MapPublication } from '../api/types';
import { MAP_TILE_URL } from '../api/client';
import { CLUSTER_FEED_LIMIT, explorationClusterOptions } from './explorationClusters';
import { publicationPoints } from './explorationPoints';

type PublicationMarker = L.Marker & { highCount: number; selected: boolean; publicationId: string; sourcePoint: L.LatLngTuple };

function markerIcon(count: number, high: number, label: string, clustered: boolean, selected = false) {
  const size = clustered ? 36 : 14;
  const content = document.createElement('div');
  content.className = `ex-country-marker ${clustered ? 'ex-country-cluster' : ''} ${high > 0 ? 'ex-country-marker--high' : ''} ${selected ? 'is-selected' : ''}`;
  content.style.width = `${size}px`;
  content.style.height = `${size}px`;
  content.textContent = clustered ? String(count) : '';
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

export default function ExplorationMap({ items, country, selected, onSelect, onGroupSelect, onReset }: {
  items: MapPublication[]; country: string; selected: string;
  onSelect: (id: string) => void; onGroupSelect: (ids: string[]) => void; onReset: () => void;
}) {
  const points = useMemo(() => publicationPoints(items, country), [items, country]);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const markers = useRef(new Map<string, PublicationMarker>());
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  const onGroupSelectRef = useRef(onGroupSelect);
  useEffect(() => { onGroupSelectRef.current = onGroupSelect; }, [onGroupSelect]);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    const countryMarkers = markers.current;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Same engine and cluster behaviour as OMGA (minitoring-cde).
    // Only this effect owns the map: filters and marker clicks never recreate it.
    const map = L.map(container.current, {
      center: [20, 12], zoom: 3, minZoom: 0, maxZoom: 20,
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
        const children = cluster.getAllChildMarkers() as PublicationMarker[];
        const count = cluster.getChildCount();
        const high = children.reduce((total, marker) => total + marker.highCount, 0);
        const label = `${count} publications, ${count <= CLUSTER_FEED_LIMIT ? 'ouvrir le flux' : 'zoomer'}`;
        // Leaflet replaces cluster elements during zoom; apply the accessible
        // label on each add as well as after a refresh.
        cluster.options.title = label;
        cluster.options.alt = label;
        return markerIcon(count, high, `${count} publications`, true);
      },
    }).addTo(map);
    clusters.on('clusterclick', (event: L.LeafletEvent & { layer: L.MarkerCluster }) => {
      const cluster = event.layer;
      const children = cluster.getAllChildMarkers() as PublicationMarker[];
      if (children.length <= CLUSTER_FEED_LIMIT) {
        onGroupSelectRef.current(children.map(marker => marker.publicationId));
        return;
      }
      const first = children[0].getLatLng();
      if (map.getZoom() < map.getMaxZoom() && children.some(marker => !marker.getLatLng().equals(first))) {
        cluster.zoomToBounds();
        return;
      }
      // Still allow access if this group cannot be separated any further.
      onGroupSelectRef.current(children.map(marker => marker.publicationId));
    });
    mapRef.current = map;
    clusterRef.current = clusters;
    map.setZoom(1 + Math.max(0, Math.min(2, Math.floor(Math.log2(Math.max(256, map.getSize().x) / 256)))));
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
    const nextIds = new Set(points.map((item) => item.id));
    for (const [id, marker] of markers.current) {
      if (!nextIds.has(id)) {
        clusters.removeLayer(marker);
        markers.current.delete(id);
      }
    }
    for (const item of points) {
      const point = item.point;
      const high = ['high', 'critical'].includes(item.severity) ? 1 : 0;
      const label = `${item.title} — ${item.country}, ouvrir la publication`;
      let marker = markers.current.get(item.id);
      const icon = markerIcon(1, high, item.title, false, selected === item.id);
      if (!marker) {
        marker = L.marker(point, { icon, title: label, alt: label, keyboard: true, bubblingMouseEvents: false }) as PublicationMarker;
        marker.on('click', () => onSelectRef.current(item.id));
        marker.on('add', () => labelMarker(marker!, marker!.options.title ?? label, marker!.selected));
        markers.current.set(item.id, marker);
        marker.publicationId = item.id;
        marker.highCount = high;
        marker.selected = selected === item.id;
        marker.sourcePoint = point;
        clusters.addLayer(marker);
      } else {
        if (!L.latLng(marker.sourcePoint).equals(point)) {
          clusters.removeLayer(marker);
          marker.setLatLng(point);
          marker.sourcePoint = point;
          clusters.addLayer(marker);
        }
        marker.setIcon(icon);
      }
      marker.highCount = high;
      marker.options.title = label;
      marker.options.alt = label;
      marker.selected = selected === item.id;
      labelMarker(marker, label, selected === item.id);
    }
    clusters.refreshClusters();
  }, [points, selected]);

  function resetWorld() {
    const map = mapRef.current;
    if (!map) return;
    onReset();
    const zoom = 1 + Math.max(0, Math.min(2, Math.floor(Math.log2(Math.max(256, map.getSize().x) / 256))));
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
