import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { healthRoutes } from './routes/health';
import { eventsRoutes } from './routes/events';
import { syncRoutes } from './routes/sync';

/**
 * pool est injecte plutot qu'importe directement dans les routes qui en
 * ont besoin (events, sync) : ca garde /health testable sans DATABASE_URL
 * valide (cf. src/types/fastify.d.ts), et ca permet d'injecter un pool de
 * test dans les tests des autres routes sans toucher a database/client.ts.
 */
export function buildApp(pool: Pool): FastifyInstance {
  const app = Fastify({ logger: true });
  app.decorate('pool', pool);

  app.register(healthRoutes, { prefix: '/api/v1' });
  app.register(eventsRoutes, { prefix: '/api/v1' });
  app.register(syncRoutes, { prefix: '/api/v1' });

  // Alias racine pour les plateformes qui sondent /health par defaut
  // (Railway : aucun chemin de healthcheck personnalise n'est configure
  // aujourd'hui sur le service, cf. document d'architecture, section 01,
  // point 05). A retirer si un healthcheckPath explicite est configure.
  app.get('/health', async () => ({ status: 'ok', service: 'cyberwatch' }));

  return app;
}
