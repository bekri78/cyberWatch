import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { generateSituationReport } from '../../src/pipeline/generateSituationReport';
import { requestSituationReport } from '../../src/lib/ai/deepseekClient';

vi.mock('../../src/lib/ai/deepseekClient', () => ({ requestSituationReport: vi.fn(), DEEPSEEK_MODEL: 'deepseek-flash' }));
const request = vi.mocked(requestSituationReport);
const db = new PGlite();
const pool = { query: (sql: string, params?: unknown[]) => db.query(sql, params) } as unknown as Pool;
const log = { info: vi.fn(), error: vi.fn() };
beforeAll(async () => {
  const dir = join(process.cwd(), 'src/database/migrations');
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) await db.exec(readFileSync(join(dir, file), 'utf8'));
}, 30000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  vi.resetAllMocks();
  await db.exec("DELETE FROM situation_reports; DELETE FROM cyber_events; UPDATE situation_report_budget SET attempts = 0, budget_day = (now() AT TIME ZONE 'UTC')::date, next_allowed_at = '-infinity', last_hash = NULL");
  await db.exec(`INSERT INTO cyber_events(title, summary, category, severity, confidence, qualification_status, tags, published_at)
    VALUES ('Recent', 'Recent', 'other', 'low', 'low', 'qualified', ARRAY['google_news_fr'], now()),
    ('Old', 'Old', 'other', 'low', 'low', 'qualified', ARRAY['gdelt'], now() - interval '25 hours'),
    ('Future', 'Future', 'other', 'low', 'low', 'qualified', ARRAY['gdelt'], now() + interval '1 hour')`);
  request.mockImplementation(async (_events, _key, onUsage) => {
    await onUsage?.({ total_tokens: 123 });
    return { syntheseExecutive: 'Informations insuffisantes.', aRetenir: [], vulnerabilitesImportantes: [], menacesCampagnes: [], otIcs: [], defenseSpatial: [], tendances: [], pointsASurveiller: [], usage: { total_tokens: 123 } }; });
});
it('uses only the last 24 hours and skips unchanged data even after cooldown', async () => {
  await generateSituationReport(pool, 'test', log);
  expect(request.mock.calls[0][0]).toHaveLength(1);
  expect(request.mock.calls[0][0][0]).toMatchObject({ title: 'Recent', material: 'titre seul, aucun corps d article', summary: '', reference: 'E1' });
  await db.exec("UPDATE situation_report_budget SET next_allowed_at = '-infinity'");
  expect((await generateSituationReport(pool, 'test', log)).generated).toBe(false);
  expect(request).toHaveBeenCalledTimes(1);
  expect((await db.query('SELECT usage FROM situation_report_budget')).rows[0]).toMatchObject({ usage: { total_tokens: 123 } });
});
it('admits only one concurrent call and counts failures against the persistent budget', async () => {
  request.mockRejectedValue(new Error('API unavailable'));
  await Promise.allSettled([generateSituationReport(pool, 'test', log), generateSituationReport(pool, 'test', log)]);
  expect(request).toHaveBeenCalledTimes(1);
  expect((await db.query('SELECT attempts FROM situation_report_budget')).rows[0]).toMatchObject({ attempts: 1 });
  expect((await generateSituationReport(pool, 'test', log)).generated).toBe(false);
  await db.exec("UPDATE situation_report_budget SET attempts = 12, next_allowed_at = '-infinity'");
  expect((await generateSituationReport(pool, 'test', log)).generated).toBe(false);
  expect(request).toHaveBeenCalledTimes(1);
});
it('analyses more than 60 short publications without polluting the summary with technical coverage text', async () => {
  await db.exec(`INSERT INTO cyber_events(title, summary, category, severity, confidence, qualification_status, published_at)
    SELECT 'Article ' || n, 'Excerpt', 'other', 'low', 'low', 'qualified', now() FROM generate_series(1, 65) n`);
  await generateSituationReport(pool, 'test', log);
  expect(request.mock.calls[0][0].length).toBeGreaterThan(60);
  expect((await db.query<{ summary: string }>('SELECT summary FROM situation_reports')).rows[0].summary).toBe('Informations insuffisantes.');
});

it('deduplicates equivalent titles before the AI call', async () => {
  await db.exec(`INSERT INTO cyber_events(title, summary, description, category, severity, confidence, qualification_status, published_at)
    VALUES ('Même actualité !', 'x', repeat('x', 10000), 'other', 'low', 'low', 'qualified', now()),
           ('Meme actualite', 'x', repeat('x', 10000), 'other', 'low', 'low', 'qualified', now())`);
  await generateSituationReport(pool, 'test', log);
  const sent = request.mock.calls[0][0];
  expect(sent.filter(event => event.title.toLowerCase().includes('actualit'))).toHaveLength(1);
});

it('bounds input text rather than applying an arbitrary publication count', async () => {
  await db.exec(`INSERT INTO cyber_events(title, summary, description, category, severity, confidence, qualification_status, published_at)
    SELECT 'Long article ' || n, 'x', repeat('x', 10000), 'other', 'low', 'low', 'qualified', now()
    FROM generate_series(1, 80) n`);
  await generateSituationReport(pool, 'test', log);
  const sent = request.mock.calls[0][0];
  expect(sent.length).toBeGreaterThan(60);
  expect(JSON.stringify(sent).length).toBeLessThanOrEqual(48_000);
});
