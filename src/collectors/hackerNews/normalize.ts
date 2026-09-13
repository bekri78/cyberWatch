import type Parser from 'rss-parser';
import type { CollectorItem } from '../types';

/**
 * Convertit une entree brute du flux RSS The Hacker News (FeedBurner) vers
 * le format CollectorItem commun. Fonction pure, testable sans reseau --
 * meme structure que certfr/normalize.ts.
 *
 * Contrairement a Google Actualites (qui redirige vers news.google.com),
 * <link> et <guid> pointent tous les deux directement vers l'article reel
 * sur thehackernews.com, sans parametre de tracking FeedBurner ni
 * redirection feedproxy -- verifie sur le flux reel (cf. echange du
 * 2026-09-13, WebFetch sur https://feeds.feedburner.com/TheHackersNews).
 * <guid isPermaLink="false"> reste utilise comme externalId plutot que
 * <link> par coherence avec les autres collecteurs RSS (cf.
 * googleNewsFr/normalize.ts) et par prudence si FeedBurner venait a
 * introduire une redirection plus tard.
 */
export function normalizeEntry(entry: Parser.Item): CollectorItem {
  const title = entry.title?.trim() || '(sans titre)';
  const url = entry.link?.trim() ?? '';
  const guid = entry.guid?.trim();
  const excerptSource = entry.contentSnippet ?? entry.content ?? entry.summary ?? '';

  return {
    externalId: guid && guid.length > 0 ? guid : undefined,
    url,
    title,
    publishedAt: entry.isoDate ? new Date(entry.isoDate) : null,
    contentExcerpt: excerptSource.trim().slice(0, 2000),
    raw: entry,
  };
}
