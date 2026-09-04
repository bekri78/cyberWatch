import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { promoteRawItems } from '../../src/pipeline/promoteRawItems';

function makeUnpromotedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'raw-item-1',
    source_name: 'certfr',
    url: 'https://www.cert.ssi.gouv.fr/alerte/CERTFR-2026-ALE-002/',
    title: 'Vulnérabilité dans Cisco Catalyst SD-WAN (25 février 2026)',
    published_at: new Date('2026-02-25T00:00:00.000Z'),
    content_excerpt:
      "Une vulnérabilité a été découverte dans Cisco Catalyst SD-WAN. Elle permet à un attaquant de provoquer un contournement de la politique de sécurité. Cisco indique que la vulnérabilité CVE-2026-20127 est activement exploitée.",
    ...overrides,
  };
}

function makeFakePool(unpromotedRows: ReturnType<typeof makeUnpromotedRow>[]) {
  const insertCalls: unknown[][] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('WHERE ri.cyber_event_id IS NULL')) {
      return { rows: unpromotedRows };
    }
    if (sql.includes('WITH new_event AS')) {
      insertCalls.push(params);
      return { rows: [] };
    }
    return { rows: [] };
  });
  return { pool: { query } as unknown as Pool, insertCalls };
}

describe('promoteRawItems', () => {
  it("ne fait rien quand il n'y a aucun raw_item non promu", async () => {
    const { pool } = makeFakePool([]);
    const result = await promoteRawItems(pool);
    expect(result).toEqual({ promoted: 0 });
  });

  it('promeut un raw_item reel avec la classification deterministe attendue', async () => {
    const { pool, insertCalls } = makeFakePool([makeUnpromotedRow()]);
    const result = await promoteRawItems(pool);

    expect(result).toEqual({ promoted: 1 });
    expect(insertCalls).toHaveLength(1);

    const [title, summary, description, category, severity, confidence, publishedAt, cves, tags, rawItemId] =
      insertCalls[0]!;

    expect(title).toBe('Vulnérabilité dans Cisco Catalyst SD-WAN (25 février 2026)');
    expect(category).toBe('alert');
    expect(severity).toBe('critical'); // exploitation active reelle mentionnee dans le texte
    expect(confidence).toBe('low');
    expect(cves).toEqual(['CVE-2026-20127']);
    expect(tags).toEqual(['certfr', 'alert']);
    expect(rawItemId).toBe('raw-item-1');
    expect(summary).toContain('Cisco Catalyst SD-WAN');
    expect(description).toContain('activement exploitée');
    expect(publishedAt).toEqual(new Date('2026-02-25T00:00:00.000Z'));
  });

  it('promeut plusieurs raw_items en une seule passe', async () => {
    const { pool, insertCalls } = makeFakePool([
      makeUnpromotedRow({ id: 'raw-1' }),
      makeUnpromotedRow({ id: 'raw-2', url: 'https://www.cert.ssi.gouv.fr/avis/CERTFR-2026-AVI-1103/' }),
    ]);

    const result = await promoteRawItems(pool);

    expect(result).toEqual({ promoted: 2 });
    expect(insertCalls).toHaveLength(2);
  });

  it('tronque le resume a 300 caracteres pour un extrait tres long', async () => {
    const longExcerpt = 'a'.repeat(500);
    const { pool, insertCalls } = makeFakePool([makeUnpromotedRow({ content_excerpt: longExcerpt })]);

    await promoteRawItems(pool);

    const summary = insertCalls[0]![1] as string;
    expect(summary.length).toBe(300);
    expect(summary.endsWith('...')).toBe(true);
  });

  it("utilise le titre comme resume si l'extrait est absent", async () => {
    const { pool, insertCalls } = makeFakePool([makeUnpromotedRow({ content_excerpt: null })]);

    await promoteRawItems(pool);

    const [title, summary] = insertCalls[0]!;
    expect(summary).toBe(title);
  });
});
