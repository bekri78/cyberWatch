/**
 * Format intermediaire commun a tous les collecteurs (cf. document
 * d'architecture, section 06). Chaque source retourne ce format ; la
 * normalisation vers RawItem/PostgreSQL se fait en dehors du collecteur, qui
 * reste ignorant du reste du pipeline.
 */
export interface CollectorItem {
  externalId?: string;
  url: string;
  title: string;
  publishedAt: Date | null;
  contentExcerpt: string;
  raw: unknown;
}

export type SourceType = 'api' | 'rss' | 'atom' | 'json' | 'stix_taxii';

export interface Collector {
  readonly name: string;
  readonly sourceType: SourceType;
  /** Ne leve jamais : les erreurs sont gerees en interne (cf. section 09/31). */
  collect(): Promise<CollectorItem[]>;
}
