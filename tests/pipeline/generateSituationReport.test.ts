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
    description: 'Des donnees clients ont ete exposees suite a une intrusion.',
    category: 'threat_intel',
    severity: 'high',
    confidence: 'high',
    published_at: new Date('2026-09-05T10:00:00.000Z'),
    first_seen_at: new Date('2026-09-05T10:00:00.000Z'),
    last_seen_at: new Date('2026-09-05T10:00:00.000Z'),
    created_at: new Date('2026-09-05T10:00:00.000Z'),
    updated_at: new Date('2026-09-05T10:00:00.000Z'),
    countries: ['France'],
    organizations: ['Orange'],
    sectors: ['Telecommunications'],
    cves: [],
    threat_actors: [],
    mitre_techniques: [],
    tags: ['certfr'],
    ai_generated: false,
    // Phase 8 (cf. migration 012) : null par defaut (source institutionnelle
    // certfr, jamais notee) -- cf. le test dedie ci-dessous pour un
    // evenement gdelt/google_news_fr reellement note.
    score_total: null,
    review_tier: null,
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

function emptyDeepseekReport(overrides: Record<string, unknown> = {}) {
  return {
    syntheseExecutive: 'x',
    aRetenir: [],
    vulnerabilitesImportantes: [],
    menacesCampagnes: [],
    otIcs: [],
    defenseSpatial: [],
    tendances: [],
    pointsASurveiller: [],
    ...overrides,
  };
}

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

  it('genere et insere un compte rendu structure a partir des evenements reels reellement collectes', async () => {
    const { pool, inserts } = makeFakePool([makeEventRow()]);
    mockedRequest.mockResolvedValueOnce(
      emptyDeepseekReport({
        syntheseExecutive: 'Une fuite de donnees a ete signalee chez un operateur telecom francais.',
        aRetenir: [
          {
            titre: 'Fuite de donnees chez un operateur telecom francais',
            criticite: 'ELEVEE',
            concerne: 'Orange',
            situation: 'x',
            evaluation: 'x',
            sources: ['certfr'],
          },
        ],
      }),
    );

    const result = await generateSituationReport(pool, 'fake-key', log);

    expect(result).toEqual({ generated: true, eventCount: 1 });
    expect(inserts).toHaveLength(1);
    const [summary, keyPointsJson, sectionsJson, eventCount, windowStart, windowEnd, model] = inserts[0]!;
    expect(summary).toBe('Une fuite de donnees a ete signalee chez un operateur telecom francais.');
    expect(JSON.parse(keyPointsJson as string)).toEqual([]);
    const sections = JSON.parse(sectionsJson as string);
    expect(sections.aRetenir).toEqual([
      {
        titre: 'Fuite de donnees chez un operateur telecom francais',
        criticite: 'ELEVEE',
        concerne: 'Orange',
        situation: 'x',
        evaluation: 'x',
        sources: ['certfr'],
      },
    ]);
    expect(eventCount).toBe(1);
    expect(windowStart).toBe('2026-09-05T10:00:00.000Z');
    expect(windowEnd).toBe('2026-09-05T10:00:00.000Z');
    expect(model).toBe('deepseek-v4-flash');
  });

  it('transmet a DeepSeek le titre/resume/categorie/severite/source/pays/organisations/secteurs reels de chaque evenement', async () => {
    const { pool } = makeFakePool([
      makeEventRow({
        title: 'Alerte CERT-FR SCADA',
        description: 'Une vulnerabilite affecte un automate industriel.',
        category: 'alert',
        severity: 'medium',
        tags: ['certfr'],
        countries: ['France'],
        organizations: ['Schneider Electric'],
        sectors: ['Energie'],
      }),
    ]);
    mockedRequest.mockResolvedValueOnce(emptyDeepseekReport());

    await generateSituationReport(pool, 'fake-key', log);

    expect(mockedRequest).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          title: 'Alerte CERT-FR SCADA',
          summary: 'Une vulnerabilite affecte un automate industriel.',
          category: 'alert',
          severity: 'medium',
          source: 'certfr',
          countries: ['France'],
          organizations: ['Schneider Electric'],
          sectors: ['Energie'],
        }),
      ],
      'fake-key',
    );
  });

  it('transmet scoreTotal/reviewTier (Phase 8) a DeepSeek pour un evenement gdelt/google_news_fr reellement note, null pour une source institutionnelle', async () => {
    const { pool } = makeFakePool([
      makeEventRow({ id: 'e1', tags: ['certfr'] }),
      makeEventRow({
        id: 'e2',
        title: 'Fraude bancaire en ligne signalee',
        tags: ['gdelt'],
        score_total: 15,
        review_tier: 'veille',
      }),
    ]);
    mockedRequest.mockResolvedValueOnce(emptyDeepseekReport());

    await generateSituationReport(pool, 'fake-key', log);

    expect(mockedRequest).toHaveBeenCalledWith(
      [
        expect.objectContaining({ title: 'Fuite de donnees chez un operateur telecom francais', scoreTotal: null, reviewTier: null }),
        expect.objectContaining({ title: 'Fraude bancaire en ligne signalee', scoreTotal: 15, reviewTier: 'veille' }),
      ],
      'fake-key',
    );
  });

  it('utilise summary en repli quand description est absente', async () => {
    const { pool } = makeFakePool([makeEventRow({ description: null, summary: 'Resume de secours' })]);
    mockedRequest.mockResolvedValueOnce(emptyDeepseekReport());

    await generateSituationReport(pool, 'fake-key', log);

    expect(mockedRequest).toHaveBeenCalledWith(
      [expect.objectContaining({ summary: 'Resume de secours' })],
      'fake-key',
    );
  });

  it('calcule window_start/window_end a partir des dates reelles des evenements utilises (pas une fenetre fixe)', async () => {
    const { pool, inserts } = makeFakePool([
      makeEventRow({ id: 'e1', published_at: new Date('2026-09-05T08:00:00.000Z') }),
      makeEventRow({ id: 'e2', published_at: new Date('2026-09-05T14:30:00.000Z') }),
    ]);
    mockedRequest.mockResolvedValueOnce(emptyDeepseekReport());

    await generateSituationReport(pool, 'fake-key', log);

    const [, , , , windowStart, windowEnd] = inserts[0]!;
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
