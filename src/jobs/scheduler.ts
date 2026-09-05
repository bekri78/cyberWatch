import cron from 'node-cron';
import type { Pool } from 'pg';
import { certfrCollector } from '../collectors/certfr';
import { cisaKevCollector } from '../collectors/cisaKev';
import { msrcCollector } from '../collectors/msrc';
import { runCollector } from './runCollector';

interface Logger {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

const COLLECTORS = [certfrCollector, cisaKevCollector, msrcCollector];

/**
 * Cycle periodique de collecte, independant des appels API clients
 * (cf. document d'architecture, section 02/20). Chaque collecteur est isole :
 * l'echec de l'un n'empeche jamais les autres de tourner.
 */
export function startScheduler(pool: Pool, log: Logger): void {
  // Toutes les 2 heures (rythme reduit volontairement pendant la phase de
  // test -- a resserrer une fois le systeme stabilise en production).
  cron.schedule('0 */2 * * *', () => {
    for (const collector of COLLECTORS) {
      void runCollector(pool, collector, log);
    }
  });
}

/** Premiere collecte immediate au demarrage, sans attendre le premier tick. */
export function runInitialCollection(pool: Pool, log: Logger): void {
  for (const collector of COLLECTORS) {
    void runCollector(pool, collector, log);
  }
}
