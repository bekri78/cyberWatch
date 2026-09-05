import cron from 'node-cron';
import type { Pool } from 'pg';
import { generateSituationReport } from '../pipeline/generateSituationReport';

interface Logger {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

/**
 * Cycle periodique du compte rendu de situation (Phase 6). Cale sur le
 * meme rythme que la collecte (toutes les 2h, cf. scheduler.ts) mais
 * decale de 15 minutes : le temps qu'au moins un passage de relecture IA
 * (Phase 5, toutes les 15 min, cf. aiReviewScheduler.ts) ait pu traiter
 * les evenements gdelt fraichement collectes avant de rediger la synthese
 * dessus -- sinon la periode couverte melangerait des evenements deja
 * filtres et d'autres pas encore relus.
 */
export function startSituationReportScheduler(pool: Pool, apiKey: string, log: Logger): void {
  cron.schedule('15 */2 * * *', () => {
    void generateSituationReport(pool, apiKey, log).catch((err) => {
      log.error({ err }, 'Generation du compte rendu de situation (Phase 6) echouee');
    });
  });
}

/** Premiere generation immediate au demarrage, sans attendre le premier tick. */
export function runInitialSituationReport(pool: Pool, apiKey: string, log: Logger): void {
  void generateSituationReport(pool, apiKey, log).catch((err) => {
    log.error({ err }, 'Generation initiale du compte rendu de situation (Phase 6) echouee');
  });
}
