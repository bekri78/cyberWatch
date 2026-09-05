import Parser from 'rss-parser';
import { withRetry } from '../../lib/http/retry';
import type { Collector, CollectorItem } from '../types';
import { normalizeEntry } from './normalize';

// Mots-cles d'incident concret (cf. migration 011 pour la motivation
// complete) : volontairement des formulations d'evenement reel
// (attaque/fuite/rancongiciel/espionnage) plutot que "cybersecurite" seul,
// qui remonterait aussi des annonces produit, conferences ou tribunes sans
// rapport avec un incident. La precision fine reste a la charge de la
// relecture IA (Phase 5, cf. reviewGdeltEvents.ts qui couvre desormais
// aussi cette source), exactement comme pour gdelt : ce filtre-ci est du
// recall, pas de la precision.
const SEARCH_TERMS = [
  'cyberattaque',
  'piratage informatique',
  'rançongiciel',
  'ransomware',
  '"fuite de données"',
  '"violation de données"',
  'cyberespionnage',
] as const;

const SEARCH_QUERY = SEARCH_TERMS.join(' OR ');

// hl=fr&gl=FR&ceid=FR:fr : locale francaise complete (langue d'interface,
// pays, edition) -- c'est ce qui priorise la presse francophone couvrant la
// France dans les resultats, la ou GDELT (theme GKG, cf. §46-§50) rate
// systematiquement ces memes incidents faute de tagging fiable sur la
// prose francaise.
const FEED_URL = `https://news.google.com/rss/search?q=${encodeURIComponent(SEARCH_QUERY)}&hl=fr&gl=FR&ceid=FR:fr`;

const parser = new Parser({
  timeout: 10_000,
  headers: {
    'User-Agent': 'CyberWatch/0.1 (+https://cyberwatch-production-7503.up.railway.app)',
  },
  // Necessaire pour recuperer la balise <source> (nom du media reel, cf.
  // normalize.ts) : rss-parser ne l'expose pas par defaut.
  customFields: {
    item: ['source'],
  },
});

/**
 * Dedoublonnage par titre normalise : Google Actualites remonte tres
 * souvent la meme depeche reprise mot pour mot par plusieurs medias
 * (syndication AFP/Reuters) sous des URL differentes -- meme logique que
 * dedupeByTitle dans collectors/gdelt/index.ts (cf. commentaire associe,
 * meme constat sur donnees reelles transpose a une autre source).
 */
export function dedupeByTitle(items: CollectorItem[]): CollectorItem[] {
  const seen = new Set<string>();
  const result: CollectorItem[] = [];
  for (const item of items) {
    const key = item.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export const googleNewsFrCollector: Collector = {
  name: 'google_news_fr',
  sourceType: 'rss',

  async collect(): Promise<CollectorItem[]> {
    let feed: Awaited<ReturnType<typeof parser.parseURL>>;

    try {
      feed = await withRetry(() => parser.parseURL(FEED_URL));
    } catch (err) {
      // Un seul flux ici (contrairement a CERT-FR) : tout echec est donc un
      // echec total de la source, meme logique de remontee que
      // certfr/gdelt (cf. §31).
      throw new Error(`Le flux Google Actualites (recherche cyber FR) a echoue -- ${(err as Error).message}`);
    }

    const items: CollectorItem[] = (feed.items ?? []).map((entry) => normalizeEntry(entry));
    return dedupeByTitle(items);
  },
};
