import Parser from 'rss-parser';
import { withRetry } from '../../lib/http/retry';
import type { Collector, CollectorItem } from '../types';
import { normalizeEntry } from './normalize';

// Avis + alertes + cti : les trois flux CERT-FR retenus (cf. document
// d'architecture, section 09). cti apporte un contenu reellement distinct
// (rapports de menace / campagnes d'attaquants nommes), contrairement a
// ioc (annonces sans les indicateurs bruts, redondant avec cti), dur
// (guides generiques, tres faible volume) et actualite (resume
// hebdomadaire de ce qui est deja collecte) -- volontairement laisses de
// cote.
const FEED_URLS = [
  'https://cert.ssi.gouv.fr/avis/feed/',
  'https://cert.ssi.gouv.fr/alerte/feed/',
  'https://cert.ssi.gouv.fr/cti/feed/',
] as const;

const parser = new Parser({
  timeout: 10_000,
  headers: {
    'User-Agent': 'CyberWatch/0.1 (+https://cyberwatch-production-7503.up.railway.app)',
  },
});

export const certfrCollector: Collector = {
  name: 'certfr',
  sourceType: 'rss',

  async collect(): Promise<CollectorItem[]> {
    const items: CollectorItem[] = [];
    const errors: string[] = [];

    for (const feedUrl of FEED_URLS) {
      try {
        const feed = await withRetry(() => parser.parseURL(feedUrl));
        for (const entry of feed.items ?? []) {
          items.push(normalizeEntry(entry));
        }
      } catch (err) {
        // Un flux en panne ne doit jamais bloquer l'autre (cf. §9/§31) --
        // mais on garde trace de l'erreur pour distinguer plus bas un echec
        // partiel (au moins un flux a marche) d'un echec total.
        errors.push(`${feedUrl}: ${(err as Error).message}`);
      }
    }

    if (errors.length === FEED_URLS.length) {
      // Aucun flux n'a repondu : ce n'est pas un succes a 0 resultat, c'est
      // un echec de la source entiere -- doit remonter comme tel dans
      // collector_runs plutot que d'etre masque en "success, 0 items".
      throw new Error(`Tous les flux CERT-FR ont echoue -- ${errors.join(' | ')}`);
    }

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.error(`[certfr] echec partiel : ${errors.join(' | ')}`);
    }

    return items;
  },
};
