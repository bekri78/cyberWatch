import cron from 'node-cron';
import type { Pool } from 'pg';
import { reviewGdeltEvents } from '../pipeline/reviewGdeltEvents';

interface Logger {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

/**
 * Cycle periodique de relecture IA (Phase 5), independant du cycle de
 * collecte (cf. scheduler.ts) : la collecte gdelt tourne toutes les 2h,
 * mais relire un batch plus souvent vide le backlog progressivement sans
 * attendre le prochain cycle de collecte. Cadence volontairement modeste
 * (toutes les 15 min, 25 evenements/passage, cf. reviewGdeltEvents.ts) pour
 * borner le cout DeepSeek plutot que de tout relire d'un coup.
 */
export function startAiReviewScheduler(pool: Pool, apiKey: string, log: Logger): void {
  cron.schedule('*/15 * * * *', () => {
    void reviewGdeltEvents(pool, apiKey, log).catch((err) => {
      log.error({ err }, 'Passage de relecture IA (Phase 5) echoue');
    });
  });
}

/** Premier passage immediat au demarrage, sans attendre le premier tick. */
export function runInitialAiReview(pool: Pool, apiKey: string, log: Logger): void {
  void reviewGdeltEvents(pool, apiKey, log).catch((err) => {
    log.error({ err }, 'Passage initial de relecture IA (Phase 5) echoue');
  });
}
