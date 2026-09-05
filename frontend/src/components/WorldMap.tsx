import 'leaflet/dist/leaflet.css';
import { useMemo, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { CyberEvent } from '../api/types';
import { COUNTRY_CENTROIDS } from '../countryCentroids';
import { CATEGORY_LABELS, SEVERITY_COLORS, sourceFromTags } from '../domain';
import { Icon } from './Icon';

const CENTROIDS = new Map<string, [number, number]>(Object.entries(COUNTRY_CENTROIDS));

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
  centroid: [number, number];
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
 * Rendu des marqueurs a l'interieur de MapContainer (necessaire pour
 * useMap) : chaque evenement est projete en pixels a partir du vrai
 * centroide du pays cite, ecarte de ses voisins du meme pays via
 * spiralPixelOffset, puis reprojete en lat/lng -- recalcule a chaque
 * changement de zoom (project/unproject dependent du zoom, pas du
 * panoramique).
 */
function EventMarkers({ points }: { points: MapPoint[] }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const positioned = useMemo(
    () =>
      points.map((p) => {
        const basePixel = map.project(p.centroid, zoom);
        const [dx, dy] = spiralPixelOffset(p.indexInGroup);
        const latlng = map.unproject([basePixel.x + dx, basePixel.y + dy], zoom);
        return { ...p, position: [latlng.lat, latlng.lng] as [number, number] };
      }),
    [points, zoom, map],
  );

  return (
    <>
      {positioned.map(({ event, country, extraCountries, position }) => {
        const color = SEVERITY_COLORS[event.severity] ?? SEVERITY_COLORS.low;
        const source = sourceFromTags(event.tags);

        return (
          <CircleMarker
            key={event.id}
            center={position}
            radius={7}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.55, weight: 1.5 }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              <div className="cw-map-tooltip">
                <strong>{event.title}</strong>
                <div>
                  {formatDate(event.publishedAt ?? event.createdAt)} · {CATEGORY_LABELS[event.category] ?? event.category}
                </div>
                <div style={{ color: source.color }}>
                  {source.label}
                  {extraCountries > 0 && ` · ${country} (+${extraCountries} autre${extraCountries > 1 ? 's' : ''} pays)`}
                </div>
              </div>
            </Tooltip>
          </CircleMarker>
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

    const centroid = resolveCentroid(country);
    if (!centroid) {
      citedButUnresolved++;
      continue;
    }

    const indexInGroup = seenPerCountry.get(country) ?? 0;
    seenPerCountry.set(country, indexInGroup + 1);

    points.push({ event, country, extraCountries: event.countries.length - 1, centroid, indexInGroup });
  }

  return (
    <div className="cw-map-wrap">
      <MapContainer
        center={[20, 10]}
        zoom={2}
        minZoom={1}
        maxBounds={[
          [-85, -180],
          [85, 180],
        ]}
        style={{ height, width: '100%', background: 'var(--bg-deepest)' }}
        scrollWheelZoom={false}
        attributionControl={true}
      >
        {/* Tuiles sombres CARTO (Dark Matter), gratuites, sans cle API. */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          subdomains="abcd"
          maxZoom={19}
        />
        <EventMarkers points={points} />
      </MapContainer>
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
