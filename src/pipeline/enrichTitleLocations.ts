import type { Pool } from 'pg';
import { locateTitleWithDeepseek } from '../lib/ai/deepseekClient';

// Also catches up existing qualified Google/CERT-FR articles in the map window.
// No modification to relevance, severity, or existing GDELT geography.
export async function enrichTitleLocations(pool: Pool, apiKey: string, log: { info: (obj: unknown, msg?: string) => void; error: (obj: unknown, msg?: string) => void }) {
  const { rows } = await pool.query<{ id: string; title: string }>(`
    SELECT ce.id, ce.title FROM cyber_events ce
    WHERE ce.qualification_status = 'qualified' AND ce.is_relevant = true
      AND cardinality(ce.countries) = 0 AND ce.location_checked_at IS NULL
      AND ce.location_attempts < 3
      AND (ce.location_attempted_at IS NULL OR ce.location_attempted_at < now() - interval '1 hour')
      AND COALESCE(ce.published_at, ce.created_at) >= now() - interval '30 days'
      AND EXISTS (SELECT 1 FROM raw_items ri JOIN sources s ON s.id = ri.source_id
        WHERE ri.cyber_event_id = ce.id AND s.name IN ('google_news_fr', 'certfr'))
    ORDER BY ce.location_attempted_at ASC NULLS FIRST, ce.created_at DESC LIMIT 25`);
  let located = 0;
  for (const row of rows) {
    await pool.query('UPDATE cyber_events SET location_attempted_at = now(), location_attempts = location_attempts + 1 WHERE id = $1', [row.id]);
    try {
      const locations = await locateTitleWithDeepseek(row.title, apiKey);
      await pool.query(`UPDATE cyber_events SET locations = $2::jsonb, countries = $3::text[],
        location_checked_at = now(), updated_at = now() WHERE id = $1 AND cardinality(countries) = 0`,
      [row.id, JSON.stringify(locations), [...new Set(locations.map(item => item.country))]]);
      if (locations.length) located++;
    } catch {
      // Do not log API request objects (which may contain credentials).
      log.error({ eventId: row.id }, 'Extraction du lieu echouee, nouvel essai dans une heure (3 maximum)');
    }
  }
  if (rows.length) log.info({ processed: rows.length, located }, 'Localisation des titres Google/CERT-FR terminee');
}
