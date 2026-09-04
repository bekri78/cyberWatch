import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { getSourceIdByName, saveRawItems } from '../../src/database/repositories/rawItems';
import type { CollectorItem } from '../../src/collectors/types';

function createFakePool(existingUrls: Set<string> = new Set()) {
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.startsWith('SELECT id FROM sources')) {
      return { rows: [{ id: 'source-123' }] };
    }
    if (sql.startsWith('INSERT INTO raw_items')) {
      const url = (params as unknown[])[2] as string;
      if (existingUrls.has(url)) {
        return { rowCount: 0, rows: [] }; // ON CONFLICT DO NOTHING -> rien insere
      }
      existingUrls.add(url);
      return { rowCount: 1, rows: [] };
    }
    return { rows: [] };
  });

  return { query } as unknown as Pool;
}

function makeItem(overrides: Partial<CollectorItem> = {}): CollectorItem {
  return {
    externalId: 'CERTFR-2026-AVI-0001',
    url: 'https://cert.ssi.gouv.fr/avis/CERTFR-2026-AVI-0001/',
    title: 'Titre de test',
    publishedAt: new Date('2026-09-01T00:00:00.000Z'),
    contentExcerpt: 'Extrait de test',
    raw: {},
    ...overrides,
  };
}

describe('getSourceIdByName', () => {
  it('retourne l\'id de la source trouvee', async () => {
    const pool = createFakePool();
    await expect(getSourceIdByName(pool, 'certfr')).resolves.toBe('source-123');
  });

  it('leve une erreur explicite si la source est introuvable', async () => {
    const pool = { query: vi.fn(async () => ({ rows: [] })) } as unknown as Pool;
    await expect(getSourceIdByName(pool, 'inconnue')).rejects.toThrow(/Source inconnue/);
  });
});

describe('saveRawItems', () => {
  it('insere les nouveaux items et compte les doublons', async () => {
    const pool = createFakePool(new Set(['https://cert.ssi.gouv.fr/avis/CERTFR-2026-AVI-0000/']));

    const items = [
      makeItem({ url: 'https://cert.ssi.gouv.fr/avis/CERTFR-2026-AVI-0000/' }), // deja present
      makeItem({ url: 'https://cert.ssi.gouv.fr/avis/CERTFR-2026-AVI-0001/' }), // nouveau
      makeItem({ url: 'https://cert.ssi.gouv.fr/avis/CERTFR-2026-AVI-0002/' }), // nouveau
    ];

    const result = await saveRawItems(pool, 'source-123', items);

    expect(result).toEqual({ inserted: 2, duplicates: 1 });
  });

  it('ignore les items sans URL exploitable', async () => {
    const pool = createFakePool();
    const items = [makeItem({ url: '' })];

    const result = await saveRawItems(pool, 'source-123', items);

    expect(result).toEqual({ inserted: 0, duplicates: 0 });
  });

  it('retourne un resultat vide pour une liste vide', async () => {
    const pool = createFakePool();
    const result = await saveRawItems(pool, 'source-123', []);
    expect(result).toEqual({ inserted: 0, duplicates: 0 });
  });
});
