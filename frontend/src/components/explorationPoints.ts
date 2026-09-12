import type { MapPublication } from '../api/types';
import { COUNTRY_CENTROIDS } from '../countryCentroids';

const ALIASES: Record<string, string> = { USA: 'United States', 'United States of America': 'United States', UK: 'United Kingdom', Turkey: 'Türkiye' };
function coordinates(country: string): [number, number] | undefined {
  return COUNTRY_CENTROIDS[country] ?? COUNTRY_CENTROIDS[ALIASES[country] ?? ''];
}

export function publicationPoints(items: MapPublication[], selectedCountry: string) {
  // Stable order means refreshing or loading another feed page cannot shuffle
  // publications around a shared country centroid. Count each publication once.
  const occupied = new Map<string, number>();
  const unique = [...new Map(items.map(item => [item.id, item])).values()].sort((a, b) => a.id.localeCompare(b.id));
  return unique.flatMap(item => {
    const country = selectedCountry && item.countries.includes(selectedCountry) && coordinates(selectedCountry)
      ? selectedCountry : item.countries.find(name => coordinates(name));
    if (!country) return [];
    const [lat, lng] = coordinates(country)!;
    const key = `${lat},${lng}`;
    const n = occupied.get(key) ?? 0;
    occupied.set(key, n + 1);
    // Wider display offsets keep nearby country-level records legible on zoom.
    // No spider legs; these offsets are not incident coordinates.
    const angle = n * 137.5 * Math.PI / 180;
    const radius = n === 0 ? 0 : 0.06 * Math.ceil(n / 6);
    return [{ ...item, country, point: [lat + radius * Math.cos(angle), lng + radius * Math.sin(angle)] as [number, number] }];
  });
}
