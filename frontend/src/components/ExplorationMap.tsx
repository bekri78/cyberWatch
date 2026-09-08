import { useEffect, useMemo, useRef, useState } from 'react';
import Supercluster from 'supercluster';
import { Map, MapMarker, MarkerContent, useMap } from './ui/map';
import { COUNTRY_CENTROIDS } from '../countryCentroids';
import type { ExplorationResult } from '../api/types';

const ALIASES: Record<string, string> = { USA: 'United States', 'United States of America': 'United States', UK: 'United Kingdom', Turkey: 'Türkiye' };
function coordinates(country: string): [number, number] | null {
  const point = COUNTRY_CENTROIDS[country] ?? COUNTRY_CENTROIDS[ALIASES[country] ?? ''];
  return point ? [point[1], point[0]] : null;
}

function MapContent({ countries, selected, onSelect }: {
  countries: ExplorationResult['countries']; selected: string; onSelect: (country: string) => void;
}) {
  const { map } = useMap();
  const [mapError, setMapError] = useState(false);
  const [zoom, setZoom] = useState(0);
  const clusters = useMemo(() => new Supercluster<{ country: string; count: number; high: number }, { count: number; high: number }>({
    radius: 65, maxZoom: 6,
    map: ({ count, high }) => ({ count, high }),
    reduce: (total, item) => { total.count += item.count; total.high += item.high; },
  }).load(countries.flatMap((item) => {
    const point = coordinates(item.country);
    return point ? [{ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: point }, properties: item }] : [];
  })), [countries]);
  const points = useMemo(() => clusters.getClusters([-180, -90, 180, 90], Math.max(0, Math.floor(zoom))), [clusters, zoom]);
  useEffect(() => {
    if (!map) return;
    const update = () => setZoom(map.getZoom());
    update(); map.on('zoom', update);
    return () => { map.off('zoom', update); };
  }, [map]);
  const previous = useRef<string | null>(null);
  const worldZoom = () => Math.min(0.65, Math.log2(Math.max(100, map?.getContainer().clientWidth ?? 512) / 512) - 0.1);
  useEffect(() => {
    if (!map || previous.current === selected) return;
    previous.current = selected;
    const point = coordinates(selected);
    map.easeTo({ center: point ?? [12, 20], zoom: point ? 3 : worldZoom(), duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650 });
  }, [map, selected]);
  useEffect(() => {
    if (!map) return;
    const fail = () => setMapError(true);
    const success = () => setMapError(false);
    const resize = new ResizeObserver(() => { map.resize(); if (!selected) map.jumpTo({ center: [12, 20], zoom: worldZoom() }); });
    resize.observe(map.getContainer());
    map.on('error', fail); map.on('load', success);
    return () => { resize.disconnect(); map.off('error', fail); map.off('load', success); };
  }, [map, selected]);
  return <>
    {points.map((feature) => {
      const item = feature.properties;
      const clustered = 'cluster' in item && item.cluster === true;
      const country = 'country' in item ? item.country : '';
      const point = feature.geometry.coordinates;
      const size = Math.min(58, 29 + Math.log2(item.count + 1) * 5);
      const label = clustered ? `${item.point_count} pays · ${item.count} mentions de publications, zoomer` : `${country} : ${item.count} publications, filtrer le flux`;
      return <MapMarker key={clustered ? `cluster-${item.cluster_id}` : country} longitude={point[0]} latitude={point[1]}>
        <MarkerContent><button className={`ex-country-marker ${clustered ? 'ex-country-cluster' : ''} ${item.high > 0 ? 'ex-country-marker--high' : ''} ${!clustered && selected === country ? 'is-selected' : ''}`}
          style={{ width: size, height: size }} onClick={() => {
            if (clustered) map?.easeTo({ center: [point[0], point[1]], zoom: clusters.getClusterExpansionZoom(item.cluster_id), duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650 });
            else onSelect(country);
          }} aria-pressed={clustered ? undefined : selected === country}
          aria-label={label} title={label}>
          {item.count}<span className="ex-country-label">{clustered ? `${item.point_count} pays · zoomer` : country}</span>
        </button></MarkerContent>
      </MapMarker>;
    })}
    <div className="ex-map-controls" aria-label="Navigation de la carte">
      <button onClick={() => map?.zoomIn()} aria-label="Zoom avant">+</button>
      <button onClick={() => map?.zoomOut()} aria-label="Zoom arrière">−</button>
      <button onClick={() => { onSelect(''); map?.easeTo({ center: [12, 20], zoom: worldZoom(), duration: 0 }); }} aria-label="Revenir à la vue monde">◎</button>
    </div>
    {mapError && <p className="ex-map-error" role="status">Fond de carte indisponible. Les pays et publications restent accessibles dans les filtres et le flux.</p>}
  </>;
}

export default function ExplorationMap(props: { countries: ExplorationResult['countries']; selected: string; onSelect: (country: string) => void }) {
  return <div className="ex-map-canvas">
    <Map theme="dark" viewport={{ center: [12, 20], zoom: 0.65, bearing: 0, pitch: 0 }} minZoom={-2} maxZoom={7} scrollZoom={false}>
      <MapContent {...props} />
    </Map>
  </div>;
}
