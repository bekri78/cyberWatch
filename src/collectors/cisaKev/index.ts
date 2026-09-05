import { withRetry } from '../../lib/http/retry';
import type { Collector, CollectorItem } from '../types';
import type { CisaKevCatalog } from './normalize';
import { normalizeVulnerability } from './normalize';

// Catalogue complet en un seul fichier JSON (pas de pagination, contrairement
// aux flux RSS CERT-FR) -- cf. structure reelle verifiee dans
// tests/collectors/cisa-kev-fixtures/known-exploited-vulnerabilities-real.json.
const CATALOG_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';

const USER_AGENT = 'CyberWatch/0.1 (+https://cyberwatch-production-7503.up.railway.app)';

export const cisaKevCollector: Collector = {
  name: 'cisa_kev',
  sourceType: 'json',

  async collect(): Promise<CollectorItem[]> {
    // Source unique (pas de multi-flux comme CERT-FR) : un echec ici est
    // forcement un echec total de la source, donc on laisse l'erreur remonter
    // telle quelle -- runCollector la marquera correctement en 'failed'.
    const catalog = await withRetry(async () => {
      const response = await fetch(CATALOG_URL, {
        headers: { 'User-Agent': USER_AGENT },
      });

      if (!response.ok) {
        throw new Error(`CISA KEV a repondu ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as CisaKevCatalog;
    });

    return catalog.vulnerabilities.map((vuln) => normalizeVulnerability(vuln));
  },
};
