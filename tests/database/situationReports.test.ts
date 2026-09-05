import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { getLatestSituationReport, insertSituationReport } from '../../src/database/repositories/situationReports';

function makeRawRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1f4b1d4-b9d2-48d8-bc1d-8ce000920bc7',
    summary: 'Une fuite de donnees a ete signalee chez un operateur telecom francais.',
    key_points: ['Fuite de donnees chez un operateur telecom francais (France, severite elevee).'],
    event_count: 12,
    window_start: new Date('2026-09-05T08:00:00.000Z'),
    window_end: new Date('2026-09-05T14:30:00.000Z'),
    model: 'deepseek-v4-flash',
    generated_at: new Date('2026-09-05T14:45:00.000Z'),
    ...overrides,
  };
}

function makeFakePool(rowsToReturn: ReturnType<typeof makeRawRow>[]) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return { rows: rowsToReturn };
  });
  return { pool: { query } as unknown as Pool, calls };
}

describe('getLatestSituationReport', () => {
  it('mappe les colonnes snake_case en camelCase avec dates ISO', async () => {
    const { pool } = makeFakePool([makeRawRow()]);
    const report = await getLatestSituationReport(pool);

    expect(report).toMatchObject({
      id: 'a1f4b1d4-b9d2-48d8-bc1d-8ce000920bc7',
      summary: 'Une fuite de donnees a ete signalee chez un operateur telecom francais.',
      keyPoints: ['Fuite de donnees chez un operateur telecom francais (France, severite elevee).'],
      eventCount: 12,
      windowStart: '2026-09-05T08:00:00.000Z',
      windowEnd: '2026-09-05T14:30:00.000Z',
      model: 'deepseek-v4-flash',
      generatedAt: '2026-09-05T14:45:00.000Z',
    });
  });

  it("renvoie null quand aucun compte rendu n'a encore ete genere", async () => {
    const { pool } = makeFakePool([]);
    const report = await getLatestSituationReport(pool);
    expect(report).toBeNull();
  });

  it('trie par generated_at decroissant, limite a 1', async () => {
    const { pool, calls } = makeFakePool([makeRawRow()]);
    await getLatestSituationReport(pool);

    expect(calls[0]!.sql).toMatch(/ORDER BY generated_at DESC/);
    expect(calls[0]!.sql).toMatch(/LIMIT 1/);
  });
});

describe('insertSituationReport', () => {
  it('serialise key_points en JSON pour la colonne jsonb', async () => {
    const { pool, calls } = makeFakePool([]);

    await insertSituationReport(pool, {
      summary: 'x',
      keyPoints: ['point 1', 'point 2'],
      eventCount: 5,
      windowStart: '2026-09-05T08:00:00.000Z',
      windowEnd: '2026-09-05T10:00:00.000Z',
      model: 'deepseek-v4-flash',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toMatch(/INSERT INTO situation_reports/);
    const [summary, keyPointsJson, eventCount, windowStart, windowEnd, model] = calls[0]!.params;
    expect(summary).toBe('x');
    expect(JSON.parse(keyPointsJson as string)).toEqual(['point 1', 'point 2']);
    expect(eventCount).toBe(5);
    expect(windowStart).toBe('2026-09-05T08:00:00.000Z');
    expect(windowEnd).toBe('2026-09-05T10:00:00.000Z');
    expect(model).toBe('deepseek-v4-flash');
  });
});
