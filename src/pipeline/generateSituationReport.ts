import { createHash } from 'node:crypto';
import { DEEPSEEK_MODEL } from '../lib/ai/deepseekClient';
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

const REPORT_EVENT_LIMIT = 60;

// A bounded 24-hour selection; persistent admission control counts failed calls too.
export async function generateSituationReport(pool: Pool, apiKey: string, log: Logger): Promise<GenerateReportResult> {
  const until = new Date().toISOString();
  const since = new Date(Date.parse(until) - 24 * 60 * 60 * 1000).toISOString();
  const page = await listEvents(pool, { limit: REPORT_EVENT_LIMIT + 1, since, until });
  const items = page.items.slice(0, REPORT_EVENT_LIMIT);

  if (items.length === 0) {
    log.info({}, 'Aucun evenement reel disponible, compte rendu de situation non genere pour ce passage');
    return { generated: false, eventCount: 0 };
  }

  const reportInputs: ReportEventInput[] = items.map((event, index) => ({
    reference: `E${index + 1}`,
    material: event.tags[0] === 'gdelt' ? 'titre et metadonnees, aucun corps d article'
      : event.tags[0] === 'google_news_fr' ? 'titre seul, aucun corps d article'
      : event.description ? 'titre et extrait tronque' : 'titre seul',
    title: event.title,
    summary: event.tags[0] === 'google_news_fr' ? '' : event.description ?? event.summary,
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
    scoreTotal: event.scoreTotal,
    reviewTier: event.reviewTier,
  }));

  const timestamps = items.map((event) => new Date(event.publishedAt ?? event.createdAt).getTime());
  const windowStart = new Date(Math.min(...timestamps)).toISOString();
  const windowEnd = new Date(Math.max(...timestamps)).toISOString();

  const hash = createHash('sha256').update(JSON.stringify({ version: 2, model: DEEPSEEK_MODEL, reportInputs,
    links: items.map(event => event.publications), truncated: page.items.length > REPORT_EVENT_LIMIT })).digest('hex');
  const admitted = await pool.query(`UPDATE situation_report_budget SET
      attempts = CASE WHEN budget_day = (now() AT TIME ZONE 'UTC')::date THEN attempts + 1 ELSE 1 END,
      budget_day = (now() AT TIME ZONE 'UTC')::date, next_allowed_at = now() + interval '2 hours'
    WHERE id = 1 AND next_allowed_at <= now() AND last_hash IS DISTINCT FROM $1
      AND (budget_day <> (now() AT TIME ZONE 'UTC')::date OR attempts < 12)
    RETURNING id`, [hash]);
  if (!admitted.rows.length) {
    log.info({}, 'Compte rendu ignore : donnees identiques ou budget atteint');
    return { generated: false, eventCount: items.length };
  }
  const report = await requestSituationReport(reportInputs, apiKey, async usage => {
    await pool.query('UPDATE situation_report_budget SET usage = $1::jsonb WHERE id = 1', [JSON.stringify(usage)]);
    await pool.query('INSERT INTO situation_report_usage (model, usage) VALUES ($1, $2::jsonb)', [DEEPSEEK_MODEL, JSON.stringify(usage)]);
    log.info({ usage, model: DEEPSEEK_MODEL }, 'Consommation DeepSeek du compte rendu');
  });
  const sourceLinks = new Map(items.map((event, index) => [`E${index + 1}`, (event.publications ?? [])
    .map(publication => publication.url).filter(url => { try { return ['http:', 'https:'].includes(new URL(url).protocol); } catch { return false; } })]));
  report.aRetenir = report.aRetenir.slice(0, 3).map(fact => ({ ...fact,
    sources: [...new Set(fact.sources.flatMap(ref => sourceLinks.get(ref) ?? []))],
  }));
  if (report.aRetenir.some(fact => !fact.sources.length)) throw new Error('Compte rendu sans source verifiable');
  const scope = `Selection des dernieres 24 heures : ${items.length} publications analysees${page.items.length > REPORT_EVENT_LIMIT ? ', plafond de 60 atteint ; selection non exhaustive' : ''}. Titres et extraits disponibles, articles complets non consultes.`;

  await insertSituationReport(pool, {
    summary: `${scope}\n\n${report.syntheseExecutive}`,
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
    model: DEEPSEEK_MODEL,
  });

  await pool.query('UPDATE situation_report_budget SET last_hash = $1 WHERE id = 1', [hash]);

  log.info({ eventCount: items.length }, 'Compte rendu de situation (Phase 6) genere');
  return { generated: true, eventCount: items.length };
}
