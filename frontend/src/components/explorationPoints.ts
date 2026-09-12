import type { MapPublication } from '../api/types';
import { COUNTRY_CENTROIDS } from '../countryCentroids';

const ALIASES: Record<string, string> = { USA: 'United States', 'United States of America': 'United States', UK: 'United Kingdom', Turkey: 'Türkiye' };
function coordinates(country: string): [number, number] | undefined {
  return COUNTRY_CENTROIDS[country] ?? COUNTRY_CENTROIDS[ALIASES[country] ?? ''];
}

export function publicationPoints(items: MapPublication[], selectedCountry: string) {
  // Stable order means refreshing or loading another feed page cannot shuffle
  // publications around a shared country centroid. Count each publication once.
  const unique = [...new Map(items.map(item => [item.id, item])).values()].sort((a, b) => a.id.localeCompare(b.id));
  return unique.flatMap(item => {
    const country = selectedCountry && item.countries.includes(selectedCountry) && coordinates(selectedCountry)
      ? selectedCountry : item.countries.find(name => coordinates(name));
    if (!country) return [];
    const [lat, lng] = coordinates(country)!;
    return [{ ...item, country, point: [lat, lng] as [number, number] }];
  });
}
