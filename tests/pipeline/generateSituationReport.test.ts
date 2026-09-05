import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

vi.mock('../../src/lib/ai/deepseekClient', () => ({
  requestSituationReport: vi.fn(),
}));

import { requestSituationReport } from '../../src/lib/ai/deepseekClient';
import { generateSituationReport } from '../../src/pipeline/generateSituationReport';

const mockedRequest = requestSituationReport as unknown as ReturnType<typeof vi.fn>;

function makeEventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    title: 'Fuite de donnees chez un operateur telecom francais',
    summary: 'Fuite de donnees chez un operateur telecom francais',
    description: null,
    category: 'threat_intel',
    severity: 'high',
    confidence: 'high',
    published_at: new Date('2026-09-05T10:00:00.000Z'),
    first_seen_at: new Date('2026-09-05T10:00:00.000Z'),
    last_seen_at: new Date('2026-09-05T10:00:00.000Z'),
    created_at: new Date('2026-09-05T10:00:00.000Z'),
    updated_at: new Date('2026-09-05T10:00:00.000Z'),
    countries: ['France'],
    organizations: [],
    sectors: [],
    cves: [],
    threat_actors: [],
    mitre_techniques: [],
    tags: ['certfr'],
    ai_generated: false,
    ...overrides,
  };
}

function makeFakePool(eventRows: ReturnType<typeof makeEventRow>[]) {
  const inserts: unknown[][] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM cyber_events')) {
      return { rows: eventRows };
    }
    if (sql.includes('INSERT INTO situation_reports')) {
      inserts.push(params);
      return { rows: [] };
    }
    return { rows: [] };
  });
  return { pool: { query } as unknown as Pool, inserts };
}

const log = { info: vi.fn(), error: vi.fn() };

afterEach(() => {
  vi.clearAllMocks();
});

describe('generateSituationReport', () => {
  it("ne genere aucun rapport quand il n'y a aucun evenement reel disponible (pas de rapport vide fabrique)", async () => {
    const { pool, inserts } = makeFakePool([]);
    const result = await generateSituationReport(pool, 'fake-key', log);

    expect(result).toEqual({ generated: false, eventCount: 0 });
    expect(inserts).toHaveLength(0);
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('genere et insere un compte rendu a partir des evenements reels reellement collectes', async () => {
    const { pool, inserts } = makeFakePool([makeEventRow()]);
    mockedRequest.mockResolvedValueOnce({
      summary: 'Une fuite de donnees a ete signalee chez un operateur telecom francais.',
      keyPoints: ['Fuite de donnees chez un operateur telecom francais (France, severite elevee).'],
    });

    const result = await generateSituationReport(pool, 'fake-key', log);

    expect(result).toEqual({ generated: true, eventCount: 1 });
    expect(inserts).toHaveLength(1);
    const [summary, keyPointsJson, eventCount, windowStart, windowEnd, model] = inserts[0]!;
    expect(summary).toBe('Une fuite de donnees a ete signalee chez un operateur telecom francais.');
    expect(JSON.parse(keyPointsJson as string)).toEqual([
      'Fuite de donnees chez un operateur telecom francais (France, severite elevee).',
    ]);
    expect(eventCount).toBe(1);
    expect(windowStart).toBe('2026-09-05T10:00:00.000Z');
    expect(windowEnd).toBe('2026-09-05T10:00:00.000Z');
    expect(model).toBe('deepseek-v4-flash');
  });

  it('transmet a DeepSeek le titre/categorie/severite/source/pays reels de chaque evenement', async () => {
    const { pool } = makeFakePool([
      makeEventRow({
        title: 'Alerte CERT-FR SCADA',
        category: 'alert',
        severity: 'medium',
        tags: ['certfr'],
        countries: ['France'],
      }),
    ]);
    mockedRequest.mockResolvedValueOnce({ summary: 'x', keyPoints: [] });

    await generateSituationReport(pool, 'fake-key', log);

    expect(mockedRequest).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          title: 'Alerte CERT-FR SCADA',
          category: 'alert',
          severity: 'medium',
          source: 'certfr',
          countries: ['France'],
        }),
      ],
      'fake-key',
    );
  });

  it('calcule window_start/window_end a partir des dates reelles des evenements utilises (pas une fenetre fixe)', async () => {
    const { pool, inserts } = makeFakePool([
      makeEventRow({ id: 'e1', published_at: new Date('2026-09-05T08:00:00.000Z') }),
      makeEventRow({ id: 'e2', published_at: new Date('2026-09-05T14:30:00.000Z') }),
    ]);
    mockedRequest.mockResolvedValueOnce({ summary: 'x', keyPoints: [] });

    await generateSituationReport(pool, 'fake-key', log);

    const [, , , windowStart, windowEnd] = inserts[0]!;
    expect(windowStart).toBe('2026-09-05T08:00:00.000Z');
    expect(windowEnd).toBe('2026-09-05T14:30:00.000Z');
  });

  it("ne fait rien planter et remonte l'erreur si l'appel DeepSeek echoue (retente au prochain passage planifie)", async () => {
    const { pool, inserts } = makeFakePool([makeEventRow()]);
    mockedRequest.mockRejectedValueOnce(new Error('DeepSeek API a repondu 429 Too Many Requests'));

    await expect(generateSituationReport(pool, 'fake-key', log)).rejects.toThrow(/429/);
    expect(inserts).toHaveLength(0);
  });

  it('limite la requete aux evenements reels via listEvents (is_relevant=true delegue au SQL)', async () => {
    const { pool } = makeFakePool([]);
    await generateSituationReport(pool, 'fake-key', log);

    const selectCall = (pool.query as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(selectCall[0]).toMatch(/is_relevant = true/);
  });
});
