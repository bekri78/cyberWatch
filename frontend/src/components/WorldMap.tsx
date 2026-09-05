import { useEffect, useMemo, useState } from 'react';
import type { CyberEvent } from '../api/types';
import { COUNTRY_CENTROIDS } from '../countryCentroids';
import { CATEGORY_LABELS, SEVERITY_COLORS, sourceFromTags } from '../domain';
import { Icon } from './Icon';
import { Map as MapLibreMap, MapMarker, MarkerContent, MarkerTooltip, useMap } from './ui/map';

// world-countries donne [lat, lng] ; MapLibre attend [lng, lat] partout
// (viewport, marqueurs, project/unproject) -- on convertit une seule fois
// ici plutot que de jongler avec l'ordre dans tout le composant.
const CENTROIDS = new Map<string, [number, number]>(
  Object.entries(COUNTRY_CENTROIDS).map(([name, [lat, lng]]) => [name, [lng, lat]]),
);

/**
 * GDELT ecrit parfois un nom legerement different de world-countries (ex:
 * "Russia" vs "Russian Federation"). Alias reels bases sur les noms courants
 * effectivement observes dans le flux GDELT -- pas une liste exhaustive,
 * complete au fil des cas reels rencontres plutot que devinee a l'avance.
 */
const ALIASES: Record<string, string> = {
  Russia: 'Russia',
  'South Korea': 'South Korea',
  'North Korea': 'North Korea',
  USA: 'United States',
  'United States of America': 'United States',
  UK: 'United Kingdom',
};

function resolveCentroid(country: string): [number, number] | null {
  return CENTROIDS.get(country) ?? CENTROIDS.get(ALIASES[country] ?? '') ?? null;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'date inconnue';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface MapPoint {
  event: CyberEvent;
  country: string;
  extraCountries: number;
  lngLat: [number, number];
  indexInGroup: number;
}

const GOLDEN_ANGLE = 2.399963; // radians (~137.5deg) -- repartition en spirale sans alignement visuel

/**
 * Ecart en PIXELS (pas en degres) autour du centroide, pour un point donne
 * de la spirale -- garantit une separation visuelle constante quel que
 * soit le niveau de zoom, contrairement a un ecart en degres qui devient
 * invisible en vue "monde" et disproportionne en vue rapprochee.
 */
function spiralPixelOffset(index: number): [number, number] {
  if (index === 0) return [0, 0];
  const radius = 10 + index * 6;
  const angle = index * GOLDEN_ANGLE;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

/**
 * Rendu des marqueurs a l'interieur de <Map> (necessaire pour useMap) :
 * chaque evenement est projete en pixels a partir du vrai centroide du
 * pays cite, ecarte de ses voisins du meme pays via spiralPixelOffset,
 * puis reprojete en lng/lat -- recalcule a chaque changement de zoom
 * (map.project/unproject utilisent la projection courante de la carte).
 */
function EventMarkers({ points }: { points: MapPoint[] }) {
  const { map } = useMap();
  const [zoom, setZoom] = useState(() => map?.getZoom() ?? 2);

  useEffect(() => {
    if (!map) return;
    const handleZoom = () => setZoom(map.getZoom());
    map.on('zoom', handleZoom);
    return () => {
      map.off('zoom', handleZoom);
    };
  }, [map]);

  const positioned = useMemo(() => {
    if (!map) return [];
    return points.map((p) => {
      const basePixel = map.project(p.lngLat);
      const [dx, dy] = spiralPixelOffset(p.indexInGroup);
      const lngLat = map.unproject([basePixel.x + dx, basePixel.y + dy]);
      return { ...p, position: [lngLat.lng, lngLat.lat] as [number, number] };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, zoom, map]);

  return (
    <>
      {positioned.map(({ event, country, extraCountries, position }) => {
        const color = SEVERITY_COLORS[event.severity] ?? SEVERITY_COLORS.low;
        const source = sourceFromTags(event.tags);

        return (
          <MapMarker key={event.id} longitude={position[0]} latitude={position[1]}>
            <MarkerContent>
              <div
                className="h-3.5 w-3.5 rounded-full border border-white/70 shadow-md"
                style={{ backgroundColor: color }}
              />
            </MarkerContent>
            <MarkerTooltip>
              <div className="flex max-w-60 flex-col gap-0.5">
                <strong className="text-[12.5px] leading-snug">{event.title}</strong>
                <span>
                  {formatDate(event.publishedAt ?? event.createdAt)} · {CATEGORY_LABELS[event.category] ?? event.category}
                </span>
                <span style={{ color: source.color }}>
                  {source.label}
                  {extraCountries > 0 && ` · ${country} (+${extraCountries} autre${extraCountries > 1 ? 's' : ''} pays)`}
                </span>
              </div>
            </MarkerTooltip>
          </MapMarker>
        );
      })}
    </>
  );
}

export function WorldMap({ events, height = 340 }: { events: CyberEvent[]; height?: number }) {
  const seenPerCountry = new Map<string, number>();

  const points: MapPoint[] = [];
  let citedButUnresolved = 0;

  for (const event of events) {
    const country = event.countries[0];
    if (!country) continue;

    const lngLat = resolveCentroid(country);
    if (!lngLat) {
      citedButUnresolved++;
      continue;
    }

    const indexInGroup = seenPerCountry.get(country) ?? 0;
    seenPerCountry.set(country, indexInGroup + 1);

    points.push({ event, country, extraCountries: event.countries.length - 1, lngLat, indexInGroup });
  }

  return (
    <div className="cw-map-wrap">
      <div style={{ height, width: '100%' }}>
        <MapLibreMap
          theme="dark"
          viewport={{ center: [10, 20], zoom: 2, bearing: 0, pitch: 0 }}
          minZoom={1}
          // Pas de maxBounds : declenche un crash reel et reproductible dans
          // MapLibre GL (calcMatrices lit un tableau null pendant le resize
          // initial, quelle que soit la forme du tableau passee -- constate
          // en test, pas une hypothese). renderWorldCopies=false (defaut du
          // composant Map de mapcn) empeche deja la duplication horizontale
          // du monde ; on perd seulement le blocage strict du pan vertical
          // au-dela des poles, un compromis mineur face a un plantage.
          scrollZoom={false}
          className="bg-deepest"
        >
          <EventMarkers points={points} />
        </MapLibreMap>
      </div>
      {points.length === 0 && (
        <div className="cw-empty" style={{ borderRadius: 0, borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}>
          <Icon name="globe" size={20} color="var(--text-quaternary)" />
          <div className="cw-empty-title">Aucun evenement localise</div>
          <p className="cw-empty-desc">
            Seule la source GDELT fournit une localisation reelle des evenements pour l'instant.
          </p>
        </div>
      )}
      <div style={{ padding: '6px 12px', fontSize: 10.5, color: 'var(--text-quaternary)' }}>
        Position centree sur le pays cite (aucune coordonnee precise par evenement) -- plusieurs evenements du
        meme pays sont ecartes en spirale pour rester individuellement survolables, quel que soit le zoom.
        {citedButUnresolved > 0 &&
          ` ${citedButUnresolved} evenement${citedButUnresolved > 1 ? 's' : ''} cite${citedButUnresolved > 1 ? 's' : ''} non localise${citedButUnresolved > 1 ? 's' : ''}.`}
      </div>
    </div>
  );
}
