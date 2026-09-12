import type { Pool } from 'pg';
import { categorizeWithDeepseek } from '../lib/ai/deepseekClient';

export async function enrichCategories(pool: Pool, apiKey: string, log: { info: (obj: unknown, msg?: string) => void; error: (obj: unknown, msg?: string) => void }) {
  // Claim atomically so overlapping deployments cannot classify the same batch.
  const { rows } = await pool.query<{ id: string; title: string; description: string | null; summary: string }>(`
    WITH pending AS (
      SELECT id FROM cyber_events
      WHERE qualification_status = 'qualified' AND is_relevant = true
        AND tags && ARRAY['gdelt','google_news_fr','certfr']::text[]
        AND category_checked_at IS NULL AND category_attempts < 3
        AND (category_attempted_at IS NULL OR category_attempted_at < now() - interval '1 hour')
        AND COALESCE(published_at, created_at) >= now() - interval '30 days'
      ORDER BY (cardinality(countries) > 0) DESC, created_at DESC LIMIT 25 FOR UPDATE SKIP LOCKED
    ) UPDATE cyber_events ce SET category_attempted_at = now(), category_attempts = category_attempts + 1
      FROM pending WHERE ce.id = pending.id RETURNING ce.id, ce.title, ce.description, ce.summary`);
  let classified = 0;
  for (const row of rows) {
    try {
      const result = await categorizeWithDeepseek(row.title, row.description ?? row.summary, apiKey);
      await pool.query(`UPDATE cyber_events SET tags = array_append(array_remove(tags, category), $2),
        category = $2, category_reasoning = $3, category_checked_at = now(), updated_at = now() WHERE id = $1`,
      [row.id, result.category, result.reasoning]);
      classified++;
    } catch {
      log.error({ eventId: row.id }, 'Classification du sujet echouee (3 tentatives maximum)');
    }
  }
  if (rows.length) log.info({ processed: rows.length, classified }, 'Classification des sujets terminee');
}
