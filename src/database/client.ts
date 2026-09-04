import { Pool } from 'pg';
import { env } from '../config/env';

/**
 * DATABASE_URL fourni par Railway via une reference (${{Postgres.DATABASE_URL}})
 * pointe vers le reseau prive de Railway (ex: postgres.railway.internal) :
 * pas de TLS necessaire dans ce cas, pas plus qu'en developpement local.
 * Si un jour la base est jointe via une adresse publique (managee, hors
 * reseau prive Railway), on active TLS sans verifier le certificat --
 * comportement standard pour ce type de fournisseur (Railway, Heroku, ...).
 */
const isLocalDatabase = /localhost|127\.0\.0\.1/.test(env.DATABASE_URL);
const isRailwayPrivateNetwork = env.DATABASE_URL.includes('.railway.internal');
const useSsl = !isLocalDatabase && !isRailwayPrivateNetwork;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

export async function pingDatabase(): Promise<void> {
  await pool.query('SELECT 1');
}
