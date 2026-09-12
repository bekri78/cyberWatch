import countriesData from './countries.json';
import citiesData from './cities.json';

export interface EventLocation {
  country: string; countryCode: string; place: string;
  precision: 'city' | 'country'; latitude: number; longitude: number;
  evidence: string; method: 'title_deepseek'; reference: string;
}
interface Country { name: string; point: number[]; aliases: string[] }
const countries = countriesData as Record<string, Country>;
type City = [string, string, string, number, number, string[]];
const cities = citiesData as City[];
const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const contains = (text: string, phrase: string) => ` ${normalize(text)} `.includes(` ${normalize(phrase)} `);

// Model output is a proposal, not coordinates. Reject missing evidence,
// unsupported country names, and ambiguous city matches rather than guessing.
export function resolveTitleLocations(title: string, parsed: unknown): EventLocation[] {
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { locations?: unknown }).locations)) {
    throw new Error('Invalid location response');
  }
  const proposals = (parsed as { locations: unknown[] }).locations;
  if (proposals.length > 5) throw new Error('Too many locations');
  const result: EventLocation[] = [];
  for (const proposal of proposals) {
    if (!proposal || typeof proposal !== 'object') continue;
    const p = proposal as Record<string, unknown>;
    if (p.role !== 'affected' || p.confidence !== 'high' || typeof p.evidence !== 'string'
      || !p.evidence.trim() || !title.includes(p.evidence) || typeof p.countryCode !== 'string') continue;
    const code = p.countryCode.toUpperCase();
    const country = countries[code];
    if (!country) continue;
    const base = { country: country.name, countryCode: code, evidence: p.evidence, method: 'title_deepseek' as const };
    if (p.precision === 'country') {
      if (!country.aliases.some(alias => contains(p.evidence as string, alias) || contains(p.evidence as string, `${alias}s`))) continue;
      result.push({ ...base, place: country.name, precision: 'country', latitude: country.point[0]!, longitude: country.point[1]!, reference: `world-countries:${code}` });
    } else if (p.precision === 'city' && typeof p.place === 'string' && contains(p.evidence, p.place)) {
      const place = normalize(p.place);
      const matches = cities.filter(city => city[2] === code && city[5].some(alias => normalize(alias) === place));
      if (matches.length !== 1) continue;
      const city = matches[0]!;
      result.push({ ...base, place: city[1], precision: 'city', latitude: city[3], longitude: city[4], reference: `geonames:${city[0]}` });
    }
  }
  return [...new Map(result.map(item => [item.reference, item])).values()];
}
