import type { Pool } from 'pg';
import type { Collector } from '../collectors/types';
import { finishRun, startRun } from '../database/repositories/collectorRuns';
import { getSourceIdByName, saveRawItems } from '../database/repositories/rawItems';
import { promoteRawItems } from '../pipeline/promoteRawItems';

interface Logger {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

/**
 * Fait tourner un collecteur une fois : collecte -> sauvegarde -> tracabilite
 * dans collector_runs. Ne leve jamais -- une source en echec est loggee et
 * marquee 'failed', le reste du systeme continue (cf. §31).
 */
export async function runCollector(pool: Pool, collector: Collector, log: Logger): Promise<void> {
  const sourceId = await getSourceIdByName(pool, collector.name);
  const runId = await startRun(pool, sourceId);

  try {
    const items = await collector.collect();
    const { inserted, duplicates } = await saveRawItems(pool, sourceId, items);

    await finishRun(pool, runId, {
      status: 'success',
      itemsCollected: items.length,
      itemsNew: inserted,
      itemsDuplicate: duplicates,
    });

    log.info(
      { collector: collector.name, collected: items.length, inserted, duplicates },
      'Collecte terminee',
    );

    // Promotion deterministe raw_items -> cyber_events (Phase 4, pas
    // d'IA -- cf. classifyEvent). Volontairement hors du "success" de la
    // collecte : un souci de promotion ne doit jamais faire passer un
    // collector_run reussi en echec, et se rattrape au prochain passage
    // (la requete reprend tous les raw_items non promus, pas seulement
    // ceux de ce run).
    try {
      const { promoted } = await promoteRawItems(pool);
      if (promoted > 0) {
        log.info({ collector: collector.name, promoted }, 'Evenements promus (raw_items -> cyber_events)');
      }
    } catch (promotionErr) {
      log.error({ collector: collector.name, err: promotionErr }, 'Promotion cyber_events echouee');
    }
  } catch (err) {
    await finishRun(pool, runId, {
      status: 'failed',
      itemsCollected: 0,
      itemsNew: 0,
      itemsDuplicate: 0,
      errorMessage: (err as Error).message,
    });

    log.error({ collector: collector.name, err }, 'Collecte echouee');
  }
}
