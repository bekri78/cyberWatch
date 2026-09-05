import { buildApp } from './app';
import { env } from './config/env';
import { pool, pingDatabase } from './database/client';
import { runMigrations } from './database/migrate';
import { runInitialAiReview, startAiReviewScheduler } from './jobs/aiReviewScheduler';
import { runInitialCollection, startScheduler } from './jobs/scheduler';
import { runInitialSituationReport, startSituationReportScheduler } from './jobs/situationReportScheduler';

const app = buildApp(pool);

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

  // La collecte tourne independamment du cycle de requetes HTTP (cf. §20) :
  // lancee en arriere-plan, elle ne retarde jamais le demarrage du serveur,
  // et une source indisponible n'empeche jamais /health de repondre.
  runInitialCollection(pool, app.log);
  startScheduler(pool, app.log);

  // Phase 5 (DeepSeek) : optionnelle tant que DEEPSEEK_API_KEY n'est pas
  // configuree (cf. config/env.ts) -- son absence ne doit jamais empecher
  // le reste du systeme de demarrer, seuls les evenements gdelt restent
  // non filtres (is_relevant=true par defaut, cf. migration 008).
  if (env.DEEPSEEK_API_KEY) {
    runInitialAiReview(pool, env.DEEPSEEK_API_KEY, app.log);
    startAiReviewScheduler(pool, env.DEEPSEEK_API_KEY, app.log);

    // Phase 6 : compte rendu de situation redige -- meme garde optionnelle
    // que Phase 5, aucun texte n'est genere sans cle DeepSeek configuree.
    runInitialSituationReport(pool, env.DEEPSEEK_API_KEY, app.log);
    startSituationReportScheduler(pool, env.DEEPSEEK_API_KEY, app.log);
  } else {
    app.log.warn(
      'DEEPSEEK_API_KEY absent : relecture IA (Phase 5) et compte rendu de situation (Phase 6) desactives',
    );
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
