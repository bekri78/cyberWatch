import type { Pool } from 'pg';
import { listEvents } from '../database/repositories/cyberEvents';
import { insertSituationReport } from '../database/repositories/situationReports';
import { requestSituationReport, type ReportEventInput } from '../lib/ai/deepseekClient';

interface Logger {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

export interface GenerateReportResult {
  generated: boolean;
  eventCount: number;
}

// Nombre d'evenements les plus recents pris en compte pour l'analyse --
// assez large pour couvrir plusieurs heures d'activite meme aux periodes
// creuses, mais borne pour garder un prompt DeepSeek de taille raisonnable
// (cout/latence). Reutilise listEvents (meme filtre is_relevant=true que
// le catalogue public) plutot qu'une requete dediee : l'analyse ne doit
// jamais porter sur un evenement que le catalogue lui-meme ne montrerait
// pas (cf. Phase 5).
const REPORT_EVENT_LIMIT = 60;

/**
 * Phase 6 : compte rendu de situation "analyste" redige par DeepSeek, a
 * partir des evenements REELS deja collectes et filtres (is_relevant=true)
 * -- jamais d'evenement invente, jamais de source qui n'existe pas
 * reellement dans le catalogue. window_start/window_end sont calcules a
 * partir des dates reelles des evenements effectivement utilises, pas
 * d'une fenetre fixe arbitraire.
 *
 * Transmet a DeepSeek bien plus que le seul titre (cf. Phase 6.0, jugee
 * "tres plate") : resume/description, pays, organisations, secteurs, CVE,
 * acteurs de menace et techniques MITRE deja associes reellement a chaque
 * evenement -- toute matiere premiere structuree deja en base, rien
 * d'ajoute.
 *
 * N'ecrit rien si aucun evenement n'est disponible (pas de rapport vide
 * fabrique de toutes pieces). Ne fait aucune retry interne : un echec
 * DeepSeek remonte tel quel a l'appelant (situationReportScheduler.ts),
 * qui retentera au prochain passage planifie plutot que de bloquer ou
 * d'inventer un contenu de secours -- meme philosophie que
 * reviewGdeltEvents.ts.
 */
export async function generateSituationReport(pool: Pool, apiKey: string, log: Logger): Promise<GenerateReportResult> {
  const { items } = await listEvents(pool, { limit: REPORT_EVENT_LIMIT });

  if (items.length === 0) {
    log.info({}, 'Aucun evenement reel disponible, compte rendu de situation non genere pour ce passage');
    return { generated: false, eventCount: 0 };
  }

  const reportInputs: ReportEventInput[] = items.map((event) => ({
    title: event.title,
    summary: event.description ?? event.summary,
    category: event.category,
    severity: event.severity,
    confidence: event.confidence,
    source: event.tags[0] ?? 'inconnue',
    countries: event.countries,
    organizations: event.organizations,
    sectors: event.sectors,
    cves: event.cves,
    threatActors: event.threatActors,
    mitreTechniques: event.mitreTechniques,
    publishedAt: event.publishedAt,
  }));

  const timestamps = items.map((event) => new Date(event.publishedAt ?? event.createdAt).getTime());
  const windowStart = new Date(Math.min(...timestamps)).toISOString();
  const windowEnd = new Date(Math.max(...timestamps)).toISOString();

  const report = await requestSituationReport(reportInputs, apiKey);

  await insertSituationReport(pool, {
    summary: report.syntheseExecutive,
    sections: {
      aRetenir: report.aRetenir,
      vulnerabilitesImportantes: report.vulnerabilitesImportantes,
      menacesCampagnes: report.menacesCampagnes,
      otIcs: report.otIcs,
      defenseSpatial: report.defenseSpatial,
      tendances: report.tendances,
      pointsASurveiller: report.pointsASurveiller,
    },
    eventCount: items.length,
    windowStart,
    windowEnd,
    model: 'deepseek-v4-flash',
  });

  log.info({ eventCount: items.length }, 'Compte rendu de situation (Phase 6) genere');
  return { generated: true, eventCount: items.length };
}
