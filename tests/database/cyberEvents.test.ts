import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { getEventById, listEvents, syncEvents } from '../../src/database/repositories/cyberEvents';
import { decodeCursor } from '../../src/lib/pagination/cursor';

function makeRawRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '89d4f1d4-b9d2-48d8-bc1d-8ce000920bc7',
    title: 'Multiples vulnérabilités dans les produits F5',
    summary: 'Multiples vulnérabilités dans les produits F5',
    description: 'Description complete.',
    category: 'vulnerability',
    severity: 'medium',
    confidence: 'low',
    published_at: new Date('2026-09-03T00:00:00.000Z'),
    first_seen_at: new Date('2026-09-04T11:59:45.000Z'),
    last_seen_at: new Date('2026-09-04T11:59:45.000Z'),
    created_at: new Date('2026-09-04T11:59:45.000Z'),
    updated_at: new Date('2026-09-04T11:59:45.000Z'),
    countries: [],
    organizations: [],
    sectors: [],
    cves: [],
    threat_actors: [],
    mitre_techniques: [],
    tags: ['certfr', 'vulnerability'],
    ai_generated: false,
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

describe('listEvents', () => {
  it('mappe les colonnes snake_case en camelCase avec dates ISO', async () => {
    const { pool } = makeFakePool([makeRawRow()]);
    const page = await listEvents(pool, { limit: 20 });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: '89d4f1d4-b9d2-48d8-bc1d-8ce000920bc7',
      title: 'Multiples vulnérabilités dans les produits F5',
      publishedAt: '2026-09-03T00:00:00.000Z',
      aiGenerated: false,
    });
  });

  it('nextCursor est null quand il y a moins de resultats que la limite', async () => {
    const { pool } = makeFakePool([makeRawRow()]);
    const page = await listEvents(pool, { limit: 20 });
    expect(page.nextCursor).toBeNull();
  });

  it('nextCursor est renseigne quand le nombre de resultats atteint la limite (page potentiellement pleine)', async () => {
    const rows = [makeRawRow({ id: 'a' }), makeRawRow({ id: 'b' })];
    const { pool } = makeFakePool(rows);
    const page = await listEvents(pool, { limit: 2 });

    expect(page.nextCursor).not.toBeNull();
    const decoded = decodeCursor(page.nextCursor!);
    expect(decoded.id).toBe('b'); // dernier item de la page
  });

  it('transmet limit, category, severity et le curseur decode comme parametres de requete', async () => {
    const { pool, calls } = makeFakePool([]);
    await listEvents(pool, {
      limit: 10,
      category: 'alert',
      severity: 'critical',
      cursor: { sortValue: '2026-09-01T00:00:00.000Z', id: 'xyz' },
    });

    const params = calls[0]!.params;
    expect(params).toContain('alert');
    expect(params).toContain('critical');
    expect(params).toContain('2026-09-01T00:00:00.000Z');
    expect(params).toContain('xyz');
    expect(params).toContain(10);
  });
});

describe('getEventById', () => {
  it("retourne l'evenement quand il existe", async () => {
    const { pool } = makeFakePool([makeRawRow()]);
    const event = await getEventById(pool, '89d4f1d4-b9d2-48d8-bc1d-8ce000920bc7');
    expect(event?.id).toBe('89d4f1d4-b9d2-48d8-bc1d-8ce000920bc7');
  });

  it('retourne null quand aucun evenement ne correspond', async () => {
    const { pool } = makeFakePool([]);
    const event = await getEventById(pool, 'inexistant');
    expect(event).toBeNull();
  });
});

describe('syncEvents', () => {
  it('trie par updated_at croissant (verifie via les parametres transmis au curseur)', async () => {
    const { pool, calls } = makeFakePool([]);
    await syncEvents(pool, { limit: 50, cursor: { sortValue: '2026-09-01T00:00:00.000Z', id: 'abc' } });

    expect(calls[0]!.sql).toMatch(/ORDER BY updated_at ASC, id ASC/);
    expect(calls[0]!.params).toEqual(['2026-09-01T00:00:00.000Z', 'abc', 50]);
  });

  it('sans curseur, ne filtre pas et renvoie simplement la limite', async () => {
    const { pool, calls } = makeFakePool([makeRawRow()]);
    const page = await syncEvents(pool, { limit: 50 });

    expect(calls[0]!.params).toEqual([50]);
    expect(page.items).toHaveLength(1);
  });
});
