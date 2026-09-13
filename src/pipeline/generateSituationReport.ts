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

const REPORT_INPUT_CHAR_BUDGET = 48_000;

function normalizedTitle(title: string): string {
  return title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function priority(event: Awaited<ReturnType<typeof listEvents>>['items'][number]): number {
  const source = event.tags[0] ?? '';
  const sourceWeight: Record<string, number> = { cisa_kev: 100, certfr: 80, microsoft_msrc: 70, gdelt: 20, google_news_fr: 10 };
  const severityWeight: Record<string, number> = { critical: 40, high: 30, medium: 15, low: 0 };
  return (sourceWeight[source] ?? 0) + (severityWeight[event.severity] ?? 0) + (event.scoreTotal ?? 0);
}

// A bounded 24-hour selection; persistent admission control counts failed calls too.
export async function generateSituationReport(pool: Pool, apiKey: string, log: Logger): Promise<GenerateReportResult> {
  const until = new Date().toISOString();
  const since = new Date(Date.parse(until) - 24 * 60 * 60 * 1000).toISOString();
  const { items } = await listEvents(pool, { since, until });

  if (items.length === 0) {
    log.info({}, 'Aucun evenement reel disponible, compte rendu de situation non genere pour ce passage');
    return { generated: false, eventCount: 0 };
  }

  const seenTitles = new Set<string>();
  const uniqueItems = items
    .filter(event => {
      const key = normalizedTitle(event.title);
      if (!key || seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    })
    .sort((a, b) => priority(b) - priority(a));
  const selected: typeof items = [];
  const reportInputs: ReportEventInput[] = [];
  let inputChars = 2; // JSON array brackets; commas are counted per item below.
  for (const event of uniqueItems) {
    const input: ReportEventInput = {
    reference: `E${reportInputs.length + 1}`,
    material: event.tags[0] === 'gdelt' ? 'titre et metadonnees, aucun corps d article'
      : event.tags[0] === 'google_news_fr' ? 'titre seul, aucun corps d article'
      : event.description ? 'titre et extrait tronque' : 'titre seul',
    title: event.title,
    summary: (event.tags[0] === 'google_news_fr' ? '' : event.description ?? event.summary).slice(0, 300),
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
    };
    const size = JSON.stringify(input).length;
    if (inputChars + size + (reportInputs.length ? 1 : 0) > REPORT_INPUT_CHAR_BUDGET) continue;
    inputChars += size + (reportInputs.length ? 1 : 0);
    selected.push(event);
    reportInputs.push(input);
  }

  const timestamps = items.map((event) => new Date(event.publishedAt ?? event.createdAt).getTime());
  const windowStart = new Date(Math.min(...timestamps)).toISOString();
  const windowEnd = new Date(Math.max(...timestamps)).toISOString();

  const hash = createHash('sha256').update(JSON.stringify({ version: 2, model: DEEPSEEK_MODEL, reportInputs,
    links: selected.map(event => event.publications), corpusSize: items.length })).digest('hex');
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
  const sourceLinks = new Map(selected.map((event, index) => [`E${index + 1}`, (event.publications ?? [])
    .map(publication => publication.url).filter(url => { try { return ['http:', 'https:'].includes(new URL(url).protocol); } catch { return false; } })]));
  report.aRetenir = report.aRetenir.slice(0, 3).map(fact => ({ ...fact,
    sources: [...new Set(fact.sources.flatMap(ref => sourceLinks.get(ref) ?? []))],
  }));
  if (report.aRetenir.some(fact => !fact.sources.length)) throw new Error('Compte rendu sans source verifiable');
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
    model: DEEPSEEK_MODEL,
  });

  await pool.query('UPDATE situation_report_budget SET last_hash = $1 WHERE id = 1', [hash]);

  log.info({ eventCount: items.length }, 'Compte rendu de situation (Phase 6) genere');
  return { generated: true, eventCount: items.length };
}
