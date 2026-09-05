import { XMLParser } from 'fast-xml-parser';
import { withRetry } from '../../lib/http/retry';
import type { Collector, CollectorItem } from '../types';
import type { MsrcVulnerability } from './normalize';
import { normalizeVulnerability } from './normalize';

const USER_AGENT = 'CyberWatch/0.1 (+https://cyberwatch-production-7503.up.railway.app)';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * L'identifiant d'un bulletin CVRF MSRC est "{Annee}-{MoisAbrege}" (ex:
 * "2026-Feb", "2026-Sep") -- format verifie via le vrai index
 * https://api.msrc.microsoft.com/cvrf/v3.0/updates. On le calcule
 * directement plutot que d'appeler cet index a chaque collecte : plus
 * simple, une requete HTTP en moins, et le format est stable (verifie
 * jusqu'a "1999-Sep").
 *
 * On cible le mois courant + le mois precedent : un bulletin MSRC est publie
 * le 2e mardi du mois (Patch Tuesday), donc en debut de mois le bulletin du
 * mois courant peut ne pas encore exister (404 traite comme "pas encore
 * publie", pas comme un echec -- cf. collect()) ; le mois precedent, lui,
 * est toujours disponible et peut recevoir des mises a jour tardives.
 */
export function getCandidateBulletinIds(now: Date): string[] {
  const current = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

  const formatId = (date: Date): string => {
    const year = date.getUTCFullYear();
    const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    return `${year}-${month}`;
  };

  return [formatId(previous), formatId(current)];
}

async function fetchBulletin(id: string): Promise<CollectorItem[] | 'not_published_yet'> {
  const response = await fetch(`https://api.msrc.microsoft.com/cvrf/v3.0/cvrf/${id}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml' },
  });

  if (response.status === 404) {
    // Bulletin du mois courant pas encore publie (avant le Patch Tuesday) --
    // ce n'est pas un echec de la source, juste "rien a collecter pour
    // l'instant".
    return 'not_published_yet';
  }

  if (!response.ok) {
    throw new Error(`MSRC a repondu ${response.status} ${response.statusText} pour ${id}`);
  }

  const xml = await response.text();
  const doc = parser.parse(xml);
  const vulnerabilities = toArray<MsrcVulnerability>(doc['cvrf:cvrfdoc']?.['vuln:Vulnerability']);

  const items: CollectorItem[] = [];
  for (const vuln of vulnerabilities) {
    const item = normalizeVulnerability(vuln);
    if (item) items.push(item);
  }
  return items;
}

export const msrcCollector: Collector = {
  name: 'microsoft_msrc',
  sourceType: 'api',

  async collect(): Promise<CollectorItem[]> {
    const ids = getCandidateBulletinIds(new Date());
    const items: CollectorItem[] = [];
    const errors: string[] = [];
    let anySucceeded = false;

    for (const id of ids) {
      try {
        const result = await withRetry(() => fetchBulletin(id));
        if (result !== 'not_published_yet') {
          items.push(...result);
        }
        anySucceeded = true;
      } catch (err) {
        errors.push(`${id}: ${(err as Error).message}`);
      }
    }

    if (!anySucceeded) {
      // Aucun des deux bulletins cibles n'a pu etre recupere (pas de simple
      // 404 "pas encore publie") : echec total de la source, cf. §9/§31
      // (meme logique que le "tous les flux ont echoue" de CERT-FR).
      throw new Error(`Tous les bulletins MSRC cibles ont echoue -- ${errors.join(' | ')}`);
    }

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.error(`[microsoft_msrc] echec partiel : ${errors.join(' | ')}`);
    }

    return items;
  },
};
