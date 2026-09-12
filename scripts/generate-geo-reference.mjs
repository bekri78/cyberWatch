// Usage: node scripts/generate-geo-reference.mjs path/to/cities15000.zip
// Download: https://download.geonames.org/export/dump/cities15000.zip
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import AdmZip from 'adm-zip';
const require = createRequire(import.meta.url);
const input = process.argv[2];
if (!input) throw new Error('Supply the GeoNames cities15000.zip snapshot');
const raw = require('../frontend/node_modules/world-countries');
const countries = Object.fromEntries(raw.map(c => [c.cca2, {
  name: c.name.common, point: c.latlng,
  aliases: [...new Set([c.name.common, c.name.official, c.translations?.fra?.common,
    c.translations?.fra?.official, ...Object.values(c.demonyms?.eng ?? {}),
    ...Object.values(c.demonyms?.fra ?? {})].filter(Boolean))].sort(),
}]));
const cities = new AdmZip(input).readAsText('cities15000.txt').trim().split('\n').map(line => {
  const c = line.split('\t');
  return [c[0], c[1], c[8], Number(c[4]), Number(c[5]), [...new Set([c[1], c[2], ...c[3].split(',')])].sort()];
}).filter(c => countries[c[2]]);
writeFileSync(new URL('../src/lib/geo/countries.json', import.meta.url), JSON.stringify(countries, null, 2) + '\n');
writeFileSync(new URL('../src/lib/geo/cities.json', import.meta.url), JSON.stringify(cities) + '\n');
console.log(`Generated ${cities.length} cities and ${Object.keys(countries).length} countries`);
