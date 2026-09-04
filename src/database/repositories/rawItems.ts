import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { CollectorItem } from '../../collectors/types';

export interface SaveResult {
  inserted: number;
  duplicates: number;
}

export async function getSourceIdByName(pool: Pool, name: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM sources WHERE name = $1', [
    name,
  ]);
  const row = rows[0];
  if (!row) {
    throw new Error(`Source inconnue en base : "${name}" (verifier le seed 005_seed_sources.sql)`);
  }
  return row.id;
}

/**
 * Empreinte de contenu utilisee pour la deduplication (cf. section 15 du
 * document d'architecture). Basee sur url+titre pour l'instant -- suffisant
 * tant qu'on ne compare pas encore entre sources differentes (Phase 6+).
 */
function computeContentHash(item: CollectorItem): string {
  return createHash('sha256').update(`${item.url}|${item.title}`).digest('hex');
}

/**
 * Insere les items dans raw_items. La contrainte UNIQUE(source_id, url) fait
 * la deduplication deterministe de niveau 1 (meme source, meme URL) --
 * ON CONFLICT DO NOTHING plutot qu'une verification manuelle prealable :
 * plus simple, et sans condition de course.
 */
export async function saveRawItems(
  pool: Pool,
  sourceId: string,
  items: CollectorItem[],
): Promise<SaveResult> {
  let inserted = 0;
  let duplicates = 0;

  for (const item of items) {
    if (!item.url) continue; // entree sans URL exploitable : ignoree

    const { rowCount } = await pool.query(
      `INSERT INTO raw_items (source_id, external_id, url, title, published_at, content_excerpt, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (source_id, url) DO NOTHING`,
      [
        sourceId,
        item.externalId ?? null,
        item.url,
        item.title,
        item.publishedAt,
        item.contentExcerpt,
        computeContentHash(item),
      ],
    );

    if (rowCount && rowCount > 0) {
      inserted++;
    } else {
      duplicates++;
    }
  }

  return { inserted, duplicates };
}
