import type { Pool } from 'pg';

export type CollectorRunStatus = 'success' | 'partial' | 'failed';

export interface FinishRunData {
  status: CollectorRunStatus;
  itemsCollected: number;
  itemsNew: number;
  itemsDuplicate: number;
  errorMessage?: string;
}

/** Trace l'etat des collectes (cf. cahier des charges §28). */
export async function startRun(pool: Pool, sourceId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO collector_runs (source_id, status) VALUES ($1, 'running') RETURNING id`,
    [sourceId],
  );
  return rows[0]!.id;
}

export async function finishRun(pool: Pool, runId: string, data: FinishRunData): Promise<void> {
  await pool.query(
    `UPDATE collector_runs
     SET finished_at = now(), status = $2, items_collected = $3, items_new = $4,
         items_duplicate = $5, error_message = $6
     WHERE id = $1`,
    [runId, data.status, data.itemsCollected, data.itemsNew, data.itemsDuplicate, data.errorMessage ?? null],
  );
}
