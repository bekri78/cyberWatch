import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet';
import { COUNTRY_CENTROIDS } from '../countryCentroids';
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

export function WorldMap({ counts, height = 340 }: { counts: Map<string, number>; height?: number }) {
  const points = [...counts.entries()]
    .map(([country, count]) => ({ country, count, centroid: resolveCentroid(country) }))
    .filter((p): p is { country: string; count: number; centroid: [number, number] } => p.centroid !== null);

  const unresolved = counts.size - points.length;
  const maxCount = Math.max(1, ...points.map((p) => p.count));

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
        {points.map((p) => {
          const radius = 5 + (p.count / maxCount) * 14;
          return (
            <CircleMarker
              key={p.country}
              center={p.centroid}
              radius={radius}
              pathOptions={{ color: '#7170ff', fillColor: '#7170ff', fillOpacity: 0.45, weight: 1.5 }}
            >
              <Tooltip direction="top" offset={[0, -4]}>
                <span className="cw-map-tooltip">
                  <strong>{p.country}</strong> · {p.count} evenement{p.count > 1 ? 's' : ''}
                </span>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
      {points.length === 0 && (
        <div className="cw-empty" style={{ borderRadius: 0, borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}>
          <Icon name="globe" size={20} color="var(--text-quaternary)" />
          <div className="cw-empty-title">Aucun pays localise</div>
          <p className="cw-empty-desc">
            Seule la source GDELT fournit une localisation reelle des evenements pour l'instant.
          </p>
        </div>
      )}
      {unresolved > 0 && (
        <div style={{ padding: '6px 12px', fontSize: 10.5, color: 'var(--text-quaternary)' }}>
          {unresolved} pays cite{unresolved > 1 ? 's' : ''} non localise{unresolved > 1 ? 's' : ''} sur la carte.
        </div>
      )}
    </div>
  );
}
