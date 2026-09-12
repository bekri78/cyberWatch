import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import type { CyberEvent, MapPublication } from '../api/types';
import { MAP_TILE_URL } from '../api/client';
import { CLUSTER_FEED_LIMIT, explorationClusterOptions } from './explorationClusters';
import { CATEGORY_LABELS, categoryColor, sourceFromTags } from '../domain';
import { publicationUrl } from '../qualification';
import { publicationPoints } from './explorationPoints';

type PublicationMarker = L.Marker & { category: string; selected: boolean; publicationId: string; sourcePoint: L.LatLngTuple };

function markerIcon(count: number, colors: string[], label: string, clustered: boolean, selected = false) {
  const size = clustered ? 36 : 14;
  const content = document.createElement('div');
  content.className = `ex-country-marker ${clustered ? 'ex-country-cluster' : ''}  ${selected ? 'is-selected' : ''}`;
  content.setAttribute('aria-label', label);
  const distinct = [...new Set(colors)];
  const color = distinct[0] ?? categoryColor('other');
  content.style.borderColor = distinct.length === 1 ? color : '#cbd5e1';
  let offset = 0;
  const segments = distinct.map(c => {
    const start = offset;
    offset += colors.filter(value => value === c).length * 100 / colors.length;
    return `${c}99 ${start}% ${offset}%`;
  });
  content.style.background = distinct.length <= 1 ? `${color}55` : `conic-gradient(${segments.join(',')})`;
  content.style.width = `${size}px`;
  content.style.height = `${size}px`;
  content.textContent = clustered ? String(count) : '';
  const caption = document.createElement('span');
  caption.className = 'ex-country-label';
  caption.textContent = label;
  caption.hidden = selected;
  content.append(caption);
  return L.divIcon({ html: content, className: 'ex-leaflet-marker', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

function labelMarker(marker: L.Marker, label: string, selected?: boolean) {
  const element = marker.getElement();
  if (!element) return;
  element.setAttribute('aria-label', label);
  element.removeAttribute('title');
  if (selected !== undefined) element.setAttribute('aria-pressed', String(selected));
}

export default function ExplorationMap({ items, country, selected, onSelect, onGroupSelect, onReset, popupEvent, onPopupClose }: {
  popupEvent?: CyberEvent | null; onPopupClose?: () => void;
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
  const onPopupCloseRef = useRef(onPopupClose);
  useEffect(() => { onPopupCloseRef.current = onPopupClose; }, [onPopupClose]);
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
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a> · <a href="https://www.geonames.org/">GeoNames</a>',
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
        const colors = children.map(marker => categoryColor(marker.category)).sort();
        const label = `${count} publications, ${count <= CLUSTER_FEED_LIMIT ? 'ouvrir le flux' : 'zoomer'}`;
        // Leaflet replaces cluster elements during zoom; apply the accessible
        // label on each add as well as after a refresh.
        cluster.options.title = '';
        cluster.options.alt = label;
        return markerIcon(count, colors, `${count} publications`, true);
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
      const category = item.category ?? 'other';
      const label = `${item.title} — ${item.country}, ouvrir la publication`;
      let marker = markers.current.get(item.id);
      const icon = markerIcon(1, [categoryColor(category)], `${CATEGORY_LABELS[category] ?? CATEGORY_LABELS.other} · ${item.title}`, false, selected === item.id);
      if (!marker) {
        marker = L.marker(point, { icon, alt: label, keyboard: true, bubblingMouseEvents: false }) as PublicationMarker;
        marker.on('click', () => {
          const caption = marker!.getElement()?.querySelector<HTMLElement>('.ex-country-label');
          if (caption) caption.hidden = true;
          onSelectRef.current(item.id);
        });
        marker.on('add', () => labelMarker(marker!, marker!.options.alt ?? label, marker!.selected));
        markers.current.set(item.id, marker);
        marker.publicationId = item.id;
        marker.category = category;
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
      marker.category = category;
      marker.options.title = '';
      marker.options.alt = label;
      marker.selected = selected === item.id;
      labelMarker(marker, label, selected === item.id);
    }
    clusters.refreshClusters();
  }, [points, selected]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !popupEvent) return;
    const content = document.createElement('article');
    content.className = 'ex-publication-preview';
    content.setAttribute('aria-label', 'Aperçu de la publication');
    const meta = document.createElement('div');
    meta.className = 'ex-publication-meta';
    const category = document.createElement('span');
    category.style.color = categoryColor(popupEvent.category);
    category.style.borderColor = categoryColor(popupEvent.category);
    category.style.background = `${categoryColor(popupEvent.category)}22`;
    category.textContent = CATEGORY_LABELS[popupEvent.category] ?? popupEvent.category;
    const date = document.createElement('time');
    const published = popupEvent.publishedAt ?? popupEvent.createdAt;
    date.dateTime = published;
    date.textContent = new Date(published).toLocaleDateString('fr-FR');
    meta.append(category, date);
    const primary = popupEvent.publications?.find(item => publicationUrl(item.url));
    const href = primary && publicationUrl(primary.url);
    const heading = document.createElement('h3');
    if (href) {
      const link = document.createElement('a');
      link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = popupEvent.title;
      link.title = 'Ouvrir la publication dans un nouvel onglet';
      heading.append(link);
    } else heading.textContent = popupEvent.title;
    const source = document.createElement('div');
    source.className = 'ex-publication-source';
    source.textContent = href ? new URL(href).hostname.replace(/^www\./, '') : sourceFromTags(popupEvent.tags).label;
    content.append(meta, heading, source);
    const location = popupEvent.locations?.[0];
    if (location) {
      const geo = document.createElement('p');
      geo.className = 'ex-publication-source';
      geo.textContent = `${location.place} (${location.precision === 'city' ? 'ville' : 'pays'}) — extrait du titre : « ${location.evidence} »`;
      content.append(geo);
    }
    const marker = markers.current.get(popupEvent.id);
    const anchor = marker ? marker.getLatLng() : map.getCenter();
    const popup = L.popup({ maxWidth: 420, minWidth: 240, autoPan: false, className: 'ex-publication-popup' })
      .setLatLng(anchor).setContent(content).openOn(map);
    const close = () => onPopupCloseRef.current?.();
    popup.on('remove', close);
    return () => { popup.off('remove', close); map.closePopup(popup); };
  }, [popupEvent]);

  function resetWorld() {
    const map = mapRef.current;
    if (!map) return;
    onReset();
    const zoom = 1 + Math.max(0, Math.min(2, Math.floor(Math.log2(Math.max(256, map.getSize().x) / 256))));
    map.setView([20, 12], zoom, { animate: false });
  }

  return <div className={`ex-map-canvas ${popupEvent ? 'ex-map-popup-open' : ''}`}>
    <div ref={container} className="ex-leaflet-map" />
    <div className="ex-map-controls" aria-label="Navigation de la carte">
      <button type="button" onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom avant">+</button>
      <button type="button" onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom arrière">−</button>
      <button type="button" onClick={resetWorld} aria-label="Revenir à la vue monde">◎</button>
    </div>
    {mapError && <p className="ex-map-error" role="status">Fond de carte indisponible. Les pays et publications restent accessibles dans les filtres et le flux.</p>}
  </div>;
}
