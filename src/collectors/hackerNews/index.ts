import Parser from 'rss-parser';
import { withRetry } from '../../lib/http/retry';
import type { Collector, CollectorItem } from '../types';
import { normalizeEntry } from './normalize';

// Flux officiel FeedBurner de The Hacker News (media generaliste cyber,
// deja seede en base -- cf. migration 005_seed_sources.sql, trust_level 3,
// meme niveau que bleepingcomputer). Un seul flux, contrairement a CERT-FR
// (4 flux thematiques) : The Hacker News ne publie pas de flux separes par
// categorie.
const FEED_URL = 'https://feeds.feedburner.com/TheHackersNews';

const parser = new Parser({
  timeout: 10_000,
  headers: {
    'User-Agent': 'CyberWatch/0.1 (+https://cyberwatch-production-7503.up.railway.app)',
  },
});

export const hackerNewsCollector: Collector = {
  name: 'hackernews',
  sourceType: 'rss',

  async collect(): Promise<CollectorItem[]> {
    let feed: Awaited<ReturnType<typeof parser.parseURL>>;

    try {
      feed = await withRetry(() => parser.parseURL(FEED_URL));
    } catch (err) {
      // Un seul flux ici (comme google_news_fr) : tout echec est donc un
      // echec total de la source, meme logique de remontee que
      // certfr/gdelt (cf. §31).
      throw new Error(`Le flux The Hacker News a echoue -- ${(err as Error).message}`);
    }

    return (feed.items ?? []).map((entry) => normalizeEntry(entry));
  },
};
