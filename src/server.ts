import { buildApp } from './app';
import { env } from './config/env';
import { pool, pingDatabase } from './database/client';
import { runMigrations } from './database/migrate';

const app = buildApp();

async function prepareDatabase(): Promise<void> {
  const { applied, skipped } = await runMigrations(pool);
  if (applied.length > 0) {
    app.log.info({ applied }, 'Migrations PostgreSQL appliquees');
  }
  app.log.info({ appliedCount: applied.length, skippedCount: skipped.length }, 'Migrations a jour');

  await pingDatabase();
  const { rows } = await pool.query<{ count: string }>('SELECT count(*) FROM sources');
  app.log.info({ sourcesCount: rows[0]?.count }, 'PostgreSQL: connexion OK (lecture/ecriture validees)');
}

async function start(): Promise<void> {
  try {
    await prepareDatabase();
  } catch (err) {
    app.log.error({ err }, 'Echec de connexion/migration PostgreSQL au demarrage');
    process.exit(1);
  }

  try {
    await app.listen({ host: '0.0.0.0', port: env.PORT });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    app.log.info(`Signal ${signal} recu, arret en cours...`);
    await app.close();
    await pool.end();
    process.exit(0);
  });
}

start();
