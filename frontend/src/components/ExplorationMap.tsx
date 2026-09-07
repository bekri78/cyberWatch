import { useEffect, useRef, useState } from 'react';
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
    {countries.map((item) => {
      const point = coordinates(item.country);
      if (!point) return null;
      const size = Math.min(58, 29 + Math.log2(item.count + 1) * 5);
      return <MapMarker key={item.country} longitude={point[0]} latitude={point[1]}>
        <MarkerContent><button className={`ex-country-marker ${item.high > 0 ? 'ex-country-marker--high' : ''} ${selected === item.country ? 'is-selected' : ''}`}
          style={{ width: size, height: size }} onClick={() => onSelect(item.country)} aria-pressed={selected === item.country}
          aria-label={`${item.country} : ${item.count} publications, filtrer le flux`} title={`${item.country} · ${item.count} publications`}>
          {item.count}<span className="ex-country-label">{item.country}</span>
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
  const unresolved = props.countries.filter((item) => !coordinates(item.country)).length;
  return <div className="ex-map-canvas">
    <Map theme="dark" viewport={{ center: [12, 20], zoom: 0.65, bearing: 0, pitch: 0 }} minZoom={-2} maxZoom={7} scrollZoom={false}>
      <MapContent {...props} />
    </Map>
    {unresolved > 0 && <p className="ex-map-unresolved">{unresolved} pays sans position cartographique ; disponibles dans le filtre Pays.</p>}
  </div>;
}
