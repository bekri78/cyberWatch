import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';

// Chemin relatif au repertoire de travail (racine du projet) plutot qu'a
// __dirname : fonctionne aussi bien via `tsx src/server.ts` (dev) que via
// `node dist/server.js` (prod), les .sql n'etant pas copies dans dist/.
const MIGRATIONS_DIR = join(process.cwd(), 'src', 'database', 'migrations');

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/**
 * Runner de migrations volontairement simple : une table de suivi
 * (schema_migrations) + des fichiers .sql executes une seule fois, dans
 * l'ordre alphabetique, chacun dans sa propre transaction.
 *
 * Pas de dependance a un outil de migration externe pour rester simple et
 * facilement inspectable (cf. §19 du cahier des charges : "robuste mais
 * simple").
 */
export async function runMigrations(pool: Pool): Promise<MigrationResult> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const alreadyApplied = new Set<string>(
    (await pool.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(
      (row) => row.name,
    ),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const result: MigrationResult = { applied: [], skipped: [] };

  for (const file of files) {
    if (alreadyApplied.has(file)) {
      result.skipped.push(file);
      continue;
    }

    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      result.applied.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} echouee : ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }

  return result;
}
