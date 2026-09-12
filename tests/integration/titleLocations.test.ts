import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { enrichTitleLocations } from '../../src/pipeline/enrichTitleLocations';
import { buildApp } from '../../src/app';
const { locate } = vi.hoisted(() => ({ locate: vi.fn() }));
vi.mock('../../src/lib/ai/deepseekClient', () => ({ locateTitleWithDeepseek: locate }));
const db = new PGlite();
const query = async (sql: string, params?: unknown[]) => db.query(sql, params);
const pool = { query } as unknown as Pool;
const app = buildApp(pool);
const log = { info: vi.fn(), error: vi.fn() };
const place = { country: 'France', countryCode: 'FR', place: 'Lyon', precision: 'city', latitude: 45.74906, longitude: 4.84789, evidence: 'Lyon', method: 'title_deepseek', reference: 'geonames:2996944' };

beforeAll(async () => {
  const dir = join(process.cwd(), 'src/database/migrations');
  for (const name of readdirSync(dir).filter(name => name.endsWith('.sql')).sort()) await db.exec(readFileSync(join(dir, name), 'utf8'));
  for (const [source, title] of [['google_news_fr', 'Incident Lyon 1'], ['google_news_fr', 'Incident Lyon 2'], ['certfr', 'Incident Lyon 3'], ['certfr', 'Faille Windows'], ['certfr', 'Timeout'], ['gdelt', 'Sans pays GDELT'], ['microsoft_msrc', 'France MSRC']]) {
    await query(`WITH inserted AS (INSERT INTO cyber_events(title, summary, category, severity, confidence, tags, qualification_status, is_relevant)
      VALUES ($1, $1, 'attack', 'low', 'low', ARRAY[$2]::text[], 'qualified', true) RETURNING id)
      INSERT INTO raw_items(source_id, url, title, content_hash, cyber_event_id)
      SELECT s.id, 'https://example.test/' || $1, $1, $1, inserted.id FROM sources s, inserted WHERE s.name = $2`, [title, source]);
  }
  await query("UPDATE cyber_events SET countries = ARRAY['France'] WHERE title = 'France MSRC'");
}, 30000);
afterAll(async () => { await app.close(); await db.close(); });

it('enriches existing titles, keeps failures retryable, and exposes only located allowed sources with coherent pagination', async () => {
  locate.mockImplementation(async (title: string) => {
    if (title === 'Timeout') throw new Error('timeout');
    return title.includes('Lyon') ? [place] : [];
  });
  await enrichTitleLocations(pool, 'test-key', log);
  expect(locate).toHaveBeenCalledTimes(5);
  await enrichTitleLocations(pool, 'test-key', log);
  expect(locate).toHaveBeenCalledTimes(5); // no repeat for no-match or immediate retry
  const failed = (await query("SELECT location_attempts, location_checked_at, qualification_status FROM cyber_events WHERE title = 'Timeout'")).rows[0];
  expect(failed).toMatchObject({ location_attempts: 1, location_checked_at: null, qualification_status: 'qualified' });
  const response = await app.inject('/api/v1/exploration?period=30d&limit=2');
  expect(response.statusCode, response.body).toBe(200);
  const first = response.json();
  expect(first.total).toBe(3);
  expect(first.unknown).toBe(0);
  expect(first.items).toHaveLength(2);
  expect(first.mapItems).toHaveLength(3);
  expect(first.mapItems[0].locations).toEqual([place]);
  expect(first.items[0].locations).toEqual([place]);
  const second = (await app.inject(`/api/v1/exploration?period=30d&limit=2&cursor=${first.nextCursor}`)).json();
  expect(second.items).toHaveLength(1);
  expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(3);
  expect(second.mapItems).toEqual(first.mapItems);
  expect((await app.inject('/api/v1/exploration?source=microsoft_msrc')).json().total).toBe(0);
  expect((await app.inject('/api/v1/exploration?location=unknown')).json().total).toBe(0);
  // Events remain stored even when excluded from the exploration view.
  expect((await query('SELECT count(*)::int AS count FROM cyber_events')).rows[0]).toEqual({ count: 7 });
}, 30000);
