import type { Pool } from 'pg';

interface SituationReportRow {
  id: string;
  summary: string;
  key_points: string[];
  event_count: number;
  window_start: Date;
  window_end: Date;
  model: string;
  generated_at: Date;
}

export interface SituationReport {
  id: string;
  summary: string;
  keyPoints: string[];
  eventCount: number;
  windowStart: string;
  windowEnd: string;
  model: string;
  generatedAt: string;
}

function toApiReport(row: SituationReportRow): SituationReport {
  return {
    id: row.id,
    summary: row.summary,
    keyPoints: row.key_points,
    eventCount: row.event_count,
    windowStart: row.window_start.toISOString(),
    windowEnd: row.window_end.toISOString(),
    model: row.model,
    generatedAt: row.generated_at.toISOString(),
  };
}

/**
 * Dernier compte rendu de situation genere (Phase 6), ou null si aucun ne
 * l'a encore ete -- DEEPSEEK_API_KEY absente, ou tout premier demarrage
 * avant le premier passage planifie (cf. jobs/situationReportScheduler.ts).
 * Jamais de texte fabrique pour combler l'absence.
 */
export async function getLatestSituationReport(pool: Pool): Promise<SituationReport | null> {
  const { rows } = await pool.query<SituationReportRow>(
    'SELECT * FROM situation_reports ORDER BY generated_at DESC LIMIT 1',
  );
  const row = rows[0];
  return row ? toApiReport(row) : null;
}

export interface InsertSituationReportInput {
  summary: string;
  keyPoints: string[];
  eventCount: number;
  windowStart: string;
  windowEnd: string;
  model: string;
}

/**
 * N'ecrase jamais un compte rendu precedent : chaque generation ajoute une
 * ligne (historique conserve pour audit, cf. migration 009) -- seule la
 * lecture publique (getLatestSituationReport) ne garde que la plus
 * recente.
 */
export async function insertSituationReport(pool: Pool, input: InsertSituationReportInput): Promise<void> {
  await pool.query(
    `INSERT INTO situation_reports (summary, key_points, event_count, window_start, window_end, model)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.summary,
      JSON.stringify(input.keyPoints),
      input.eventCount,
      input.windowStart,
      input.windowEnd,
      input.model,
    ],
  );
}
