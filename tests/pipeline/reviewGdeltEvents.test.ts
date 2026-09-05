import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

vi.mock('../../src/lib/ai/deepseekClient', () => ({
  reviewEventWithDeepseek: vi.fn(),
}));

import { reviewEventWithDeepseek } from '../../src/lib/ai/deepseekClient';
import { reviewGdeltEvents } from '../../src/pipeline/reviewGdeltEvents';

const mockedReview = reviewEventWithDeepseek as unknown as ReturnType<typeof vi.fn>;

function makePendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    title: 'Tata-owned JLR to cut 4,000 jobs',
    summary: 'Tata-owned JLR to cut 4,000 jobs',
    description: 'Themes GDELT: CYBER_ATTACK',
    ...overrides,
  };
}

// Reponse reviewEventWithDeepseek complete (Phase 8, cf. migration 012) --
// evite de repeter les 5 scores + scoreTotal/tier dans chaque mock.
function makeReview(overrides: Record<string, unknown> = {}) {
  return {
    scores: { pertinenceCyber: 0, impact: 0, interetStrategique: 0, fiabiliteSource: 0, nouveaute: 0 },
    scoreTotal: 0,
    tier: 'rejete',
    isRelevant: false,
    severity: 'low',
    confidence: 'low',
    reasoning: 'x',
    ...overrides,
  };
}

function makeFakePool(pendingRows: ReturnType<typeof makePendingRow>[]) {
  const updateCalls: unknown[][] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('WHERE s.name = ANY($2::text[])')) {
      return { rows: pendingRows };
    }
    if (sql.includes('UPDATE cyber_events')) {
      updateCalls.push(params);
      return { rows: [] };
    }
    return { rows: [] };
  });
  return { pool: { query } as unknown as Pool, updateCalls };
}

const log = { info: vi.fn(), error: vi.fn() };

afterEach(() => {
  vi.clearAllMocks();
});

describe('reviewGdeltEvents', () => {
  it("ne fait rien quand il n'y a aucun evenement gdelt en attente de relecture", async () => {
    const { pool, updateCalls } = makeFakePool([]);
    const result = await reviewGdeltEvents(pool, 'fake-key', log);

    expect(result).toEqual({ reviewed: 0, markedIrrelevant: 0, failed: 0 });
    expect(updateCalls).toHaveLength(0);
  });

  it('marque is_relevant=false et ai_generated=true pour un vrai faux positif confirme (Tata/JLR), scores/tier ecrits en base', async () => {
    const { pool, updateCalls } = makeFakePool([makePendingRow()]);
    mockedReview.mockResolvedValueOnce(
      makeReview({
        scores: { pertinenceCyber: 0, impact: 0, interetStrategique: 0, fiabiliteSource: 3, nouveaute: 0 },
        scoreTotal: 3,
        tier: 'rejete',
        isRelevant: false,
        confidence: 'high',
        reasoning: "Suppressions d'emplois, aucun incident cyber.",
      }),
    );

    const result = await reviewGdeltEvents(pool, 'fake-key', log);

    expect(result).toEqual({ reviewed: 1, markedIrrelevant: 1, failed: 0 });
    expect(updateCalls).toHaveLength(1);
    const [isRelevant, severity, confidence, scorePertinence, scoreImpact, scoreInteret, scoreFiabilite, scoreNouveaute, scoreTotal, tier, eventId] =
      updateCalls[0]!;
    expect(isRelevant).toBe(false);
    expect(severity).toBe('low');
    expect(confidence).toBe('high');
    expect(scorePertinence).toBe(0);
    expect(scoreImpact).toBe(0);
    expect(scoreInteret).toBe(0);
    expect(scoreFiabilite).toBe(3);
    expect(scoreNouveaute).toBe(0);
    expect(scoreTotal).toBe(3);
    expect(tier).toBe('rejete');
    expect(eventId).toBe('event-1');
  });

  it('marque is_relevant=true pour un vrai vrai-positif (fraude cryptomonnaie), palier "veille"', async () => {
    const { pool, updateCalls } = makeFakePool([
      makePendingRow({
        id: 'event-2',
        title: 'ED arrests two in ₹40-crore HashPe cryptocurrency fraud',
        description: 'Pays: India — Organisations: cyber crime police',
      }),
    ]);
    mockedReview.mockResolvedValueOnce(
      makeReview({
        scores: { pertinenceCyber: 4, impact: 3, interetStrategique: 2, fiabiliteSource: 4, nouveaute: 2 },
        scoreTotal: 15,
        tier: 'veille',
        isRelevant: true,
        severity: 'medium',
        confidence: 'high',
        reasoning: 'Fraude cryptomonnaie confirmee.',
      }),
    );

    const result = await reviewGdeltEvents(pool, 'fake-key', log);

    expect(result).toEqual({ reviewed: 1, markedIrrelevant: 0, failed: 0 });
    const [isRelevant, , , , , , , , scoreTotal, tier] = updateCalls[0]!;
    expect(isRelevant).toBe(true);
    expect(scoreTotal).toBe(15);
    expect(tier).toBe('veille');
  });

  it("laisse l'evenement non relu (ai_generated toujours false) si l'appel DeepSeek echoue, sans faire planter le passage", async () => {
    const { pool, updateCalls } = makeFakePool([
      makePendingRow({ id: 'event-3' }),
      makePendingRow({ id: 'event-4' }),
    ]);
    mockedReview.mockRejectedValueOnce(new Error('DeepSeek API a repondu 429 Too Many Requests'));
    mockedReview.mockResolvedValueOnce(makeReview({ isRelevant: true, tier: 'conserve', scoreTotal: 10, reasoning: 'ok' }));

    const result = await reviewGdeltEvents(pool, 'fake-key', log);

    expect(result).toEqual({ reviewed: 1, markedIrrelevant: 0, failed: 1 });
    // seul le 2eme evenement (succes) genere un UPDATE -- le 1er (echec)
    // reste tel quel, retente au prochain passage planifie.
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]![10]).toBe('event-4'); // eventId est desormais le 11e parametre (cf. migration 012)
    expect(log.error).toHaveBeenCalledOnce();
  });

  it('utilise le titre + description (fallback: summary si description absente) comme extrait envoye a DeepSeek', async () => {
    const { pool } = makeFakePool([makePendingRow({ description: null, summary: 'Resume de secours' })]);
    mockedReview.mockResolvedValueOnce(makeReview({ isRelevant: true, tier: 'conserve', scoreTotal: 10 }));

    await reviewGdeltEvents(pool, 'fake-key', log);

    expect(mockedReview).toHaveBeenCalledWith(
      { title: 'Tata-owned JLR to cut 4,000 jobs', excerpt: 'Resume de secours' },
      'fake-key',
    );
  });

  it('ne relit que les evenements gdelt/google_news_fr non encore relus (filtre delegue a la requete SQL)', async () => {
    const { pool } = makeFakePool([]);
    await reviewGdeltEvents(pool, 'fake-key', log);

    const selectCall = (pool.query as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(selectCall[0]).toMatch(/s\.name = ANY\(\$2::text\[\]\)/);
    expect(selectCall[0]).toMatch(/ce\.ai_generated = false/);
    expect(selectCall[1][1]).toEqual(['gdelt', 'google_news_fr']);
  });
});
