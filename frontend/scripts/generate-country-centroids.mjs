// Genere src/countryCentroids.ts a partir des vraies donnees geographiques
// du paquet world-countries (250 pays, centroides reels) -- execute une
// seule fois a la main quand ce fichier doit etre regenere, pas au build.
// Evite d'embarquer tout le paquet (traductions, drapeaux, etc.) dans le
// bundle final pour quelques kilo-octets de coordonnees.
import { writeFileSync } from 'node:fs';
import worldCountries from 'world-countries';

const entries = worldCountries.map((c) => [c.name.common, c.latlng]);
entries.sort((a, b) => a[0].localeCompare(b[0]));

const body = entries.map(([name, latlng]) => `  ${JSON.stringify(name)}: [${latlng[0]}, ${latlng[1]}],`).join('\n');

const content = `/**
 * Centroides reels de 250 pays (nom commun anglais -> [lat, lng]), extraits
 * du paquet world-countries (donnees geographiques publiques). Genere par
 * scripts/generate-country-centroids.mjs -- ne pas editer a la main.
 */
export const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
${body}
};
`;

writeFileSync(new URL('../src/countryCentroids.ts', import.meta.url), content);
console.log(`Ecrit src/countryCentroids.ts (${entries.length} pays).`);
