import type { Pool } from 'pg';
import { classifyEvent } from './classifyEvent';

interface UnpromotedRawItemRow {
  id: string;
  source_name: string;
  url: string;
  title: string;
  published_at: Date | null;
  content_excerpt: string | null;
}

export interface PromotionResult {
  promoted: number;
}

const SUMMARY_MAX_LENGTH = 300;

function buildSummary(title: string, excerpt: string | null): string {
  const base = excerpt?.trim() || title;
  return base.length > SUMMARY_MAX_LENGTH ? `${base.slice(0, SUMMARY_MAX_LENGTH - 3)}...` : base;
}

/**
 * Promeut les raw_items pas encore rattaches a un cyber_event vers la table
 * consolidee, avec une classification purement deterministe (cf.
 * classifyEvent -- pas d'appel IA ici, cf. Phase 3/4 vs Phase 5).
 *
 * Un raw_item = un cyber_event pour l'instant (une seule source active,
 * cf. Phase 3). La fusion multi-sources (meme evenement rapporte par
 * plusieurs sources) est laissee a une phase ulterieure -- le schema
 * (raw_items.cyber_event_id nullable, plusieurs raw_items possibles par
 * cyber_event) le permet deja sans migration.
 *
 * INSERT + UPDATE regroupes dans une seule requete (CTE) : soit les deux
 * reussissent, soit aucun -- jamais de cyber_event orphelin sans raw_item
 * qui pointe dessus.
 */
export async function promoteRawItems(pool: Pool): Promise<PromotionResult> {
  const { rows } = await pool.query<UnpromotedRawItemRow>(
    `SELECT ri.id, s.name AS source_name, ri.url, ri.title, ri.published_at, ri.content_excerpt
     FROM raw_items ri
     JOIN sources s ON s.id = ri.source_id
     WHERE ri.cyber_event_id IS NULL
     ORDER BY ri.collected_at ASC`,
  );

  let promoted = 0;

  for (const row of rows) {
    const classification = classifyEvent({
      sourceName: row.source_name,
      url: row.url,
      title: row.title,
      contentExcerpt: row.content_excerpt,
    });

    const summary = buildSummary(row.title, row.content_excerpt);

    await pool.query(
      `WITH new_event AS (
         INSERT INTO cyber_events
           (title, summary, description, category, severity, confidence, published_at, cves, tags, countries, ai_generated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false)
         RETURNING id
       )
       UPDATE raw_items SET cyber_event_id = (SELECT id FROM new_event) WHERE id = $11`,
      [
        row.title,
        summary,
        row.content_excerpt,
        classification.category,
        classification.severity,
        classification.confidence,
        row.published_at,
        classification.cves,
        classification.tags,
        classification.countries,
        row.id,
      ],
    );

    promoted++;
  }

  return { promoted };
}
