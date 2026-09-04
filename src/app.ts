import Fastify, { type FastifyInstance } from 'fastify';
import { healthRoutes } from './routes/health';

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.register(healthRoutes, { prefix: '/api/v1' });

  // Alias racine pour les plateformes qui sondent /health par defaut
  // (Railway : aucun chemin de healthcheck personnalise n'est configure
  // aujourd'hui sur le service, cf. document d'architecture, section 01,
  // point 05). A retirer si un healthcheckPath explicite est configure.
  app.get('/health', async () => ({ status: 'ok', service: 'cyberwatch' }));

  return app;
}
