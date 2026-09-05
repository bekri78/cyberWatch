import type Parser from 'rss-parser';
import type { CollectorItem } from '../types';

/**
 * Google Actualites fournit, pour chaque resultat, une balise <source
 * url="..."> dediee portant le nom du media reel (ex: "Le Monde",
 * "France Info") -- recuperee via la config customFields de rss-parser
 * (cf. index.ts, `customFields: { item: ['source'] }`). On n'utilise
 * volontairement PAS le suffixe " - Nom du media" present dans le titre
 * brut pour extraire ce nom : trop fragile face a un vrai titre qui
 * contiendrait deja un tiret (le titre est de toute facon conserve tel
 * quel, jamais reecrit -- cf. §34, "vraie donnee directement").
 *
 * Selon la version de rss-parser/xml2js, un champ custom peut arriver soit
 * comme chaine simple, soit comme objet avec le texte sous '_' -- les deux
 * formes sont gerees ici ; toute autre forme retombe sur undefined plutot
 * que de deviner.
 */
export function extractSourceName(entry: unknown): string | undefined {
  const raw = (entry as { source?: unknown } | undefined)?.source;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (raw && typeof raw === 'object') {
    const text = (raw as Record<string, unknown>)['_'];
    if (typeof text === 'string' && text.trim().length > 0) return text.trim();
  }

  return undefined;
}

/**
 * Le flux Google Actualites ne fournit ni description structuree ni corps
 * d'article distinct du titre (contrairement a CERT-FR) -- seul le nom du
 * media reel, quand il est present, sert de contexte supplementaire.
 * Jamais de pays/secteur invente ici : classifyEvent.ts ne fera pas
 * d'extraction geo pour cette source (cf. §46 -- restreint a gdelt, qui
 * seul fournit un champ structure fiable).
 */
export function buildContentExcerpt(sourceName: string | undefined): string {
  return sourceName ? `Média : ${sourceName}` : '';
}

/**
 * Convertit une entree brute du flux RSS Google Actualites (recherche
 * mots-cles FR, cf. index.ts) vers le format CollectorItem commun.
 * Fonction pure, testable sans reseau -- meme structure que
 * certfr/normalize.ts.
 */
export function normalizeEntry(entry: Parser.Item): CollectorItem {
  const title = entry.title?.trim() || '(sans titre)';
  const url = entry.link?.trim() ?? '';
  const sourceName = extractSourceName(entry);
  const guid = entry.guid?.trim();

  return {
    externalId: guid && guid.length > 0 ? guid : undefined,
    url,
    title,
    publishedAt: entry.isoDate ? new Date(entry.isoDate) : null,
    contentExcerpt: buildContentExcerpt(sourceName),
    raw: entry,
  };
}
