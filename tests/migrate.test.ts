import { describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { runMigrations } from '../src/database/migrate';

/**
 * Pool PostgreSQL simule en memoire : pas besoin d'une vraie base pour
 * verifier la logique du runner (ordre, idempotence, rollback).
 */
function createFakePool(alreadyApplied: string[] = []) {
  const state = {
    migrations: new Set(alreadyApplied),
    queries: [] as string[],
  };

  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      state.queries.push(sql);
      if (sql.startsWith('INSERT INTO schema_migrations')) {
        state.migrations.add((params as string[])[0]!);
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  } as unknown as PoolClient;

  const pool = {
    query: vi.fn(async (sql: string) => {
      state.queries.push(sql);
      if (sql.trim().startsWith('SELECT name FROM schema_migrations')) {
        return { rows: [...state.migrations].map((name) => ({ name })) };
      }
      return { rows: [] };
    }),
    connect: vi.fn(async () => client),
  } as unknown as Pool;

  return { pool, client, state };
}

describe('runMigrations', () => {
  it('applique les fichiers .sql dans l\'ordre alphabetique', async () => {
    const { pool, client } = createFakePool();

    const result = await runMigrations(pool);

    expect(result.applied).toEqual([
      '001_create_sources.sql',
      '002_create_cyber_events.sql',
      '003_create_raw_items.sql',
      '004_create_collector_runs.sql',
      '005_seed_sources.sql',
      '006_align_timestamp_precision.sql',
      '007_seed_gdelt_source.sql',
    ]);
    expect(result.skipped).toEqual([]);
    // BEGIN + SQL + INSERT INTO schema_migrations + COMMIT, par migration
    expect((client.query as any).mock.calls.length).toBe(7 * 4);
  });

  it('ignore les migrations deja appliquees (idempotence)', async () => {
    const { pool, client } = createFakePool([
      '001_create_sources.sql',
      '002_create_cyber_events.sql',
    ]);

    const result = await runMigrations(pool);

    expect(result.skipped).toEqual(['001_create_sources.sql', '002_create_cyber_events.sql']);
    expect(result.applied).toEqual([
      '003_create_raw_items.sql',
      '004_create_collector_runs.sql',
      '005_seed_sources.sql',
      '006_align_timestamp_precision.sql',
      '007_seed_gdelt_source.sql',
    ]);
    expect((client.query as any).mock.calls.length).toBe(5 * 4);
  });

  it('ne pose aucune migration en double si tout est deja applique', async () => {
    const { pool } = createFakePool([
      '001_create_sources.sql',
      '002_create_cyber_events.sql',
      '003_create_raw_items.sql',
      '004_create_collector_runs.sql',
      '005_seed_sources.sql',
      '006_align_timestamp_precision.sql',
      '007_seed_gdelt_source.sql',
    ]);

    const result = await runMigrations(pool);

    expect(result.applied).toEqual([]);
    expect(result.skipped.length).toBe(7);
  });

  it('fait un rollback et propage l\'erreur si une migration echoue', async () => {
    const { pool, client } = createFakePool();
    (client.query as any).mockImplementation(async (sql: string) => {
      if (sql.includes('CREATE TABLE IF NOT EXISTS cyber_events')) {
        throw new Error('colonne invalide');
      }
      return { rows: [] };
    });

    await expect(runMigrations(pool)).rejects.toThrow(/002_create_cyber_events.sql echouee/);

    const calls = (client.query as any).mock.calls.map((c: unknown[]) => c[0]);
    expect(calls).toContain('ROLLBACK');
  });
});
