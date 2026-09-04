import type Parser from 'rss-parser';
import type { CollectorItem } from '../types';

const CERTFR_ID_PATTERN = /CERTFR-\d{4}-(?:AVI|ALE|CTI)-\d+/;

/**
 * Extrait l'identifiant CERT-FR (ex: CERTFR-2026-AVI-1234, ALE, ou CTI)
 * depuis l'URL de l'entree RSS. Purement deterministe, pas d'appel IA
 * (cf. §16).
 */
export function extractExternalId(link?: string): string | undefined {
  return link?.match(CERTFR_ID_PATTERN)?.[0];
}

/**
 * Convertit une entree brute du flux RSS CERT-FR (avis, alerte ou cti) vers
 * le format CollectorItem commun. Fonction pure, testable sans reseau.
 */
export function normalizeEntry(entry: Parser.Item): CollectorItem {
  const title = entry.title?.trim() || '(sans titre)';
  const url = entry.link?.trim() ?? '';
  const excerptSource = entry.contentSnippet ?? entry.content ?? entry.summary ?? '';

  return {
    externalId: extractExternalId(url),
    url,
    title,
    publishedAt: entry.isoDate ? new Date(entry.isoDate) : null,
    contentExcerpt: excerptSource.trim().slice(0, 2000),
    raw: entry,
  };
}
