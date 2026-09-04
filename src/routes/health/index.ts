import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

/**
 * GET /health (monte sous /api/v1 -> /api/v1/health, cf. app.ts)
 *
 * Doit rester extremement rapide : ne doit jamais appeler PostgreSQL,
 * DeepSeek ou une source externe (cf. cahier des charges §22).
 */
export const healthRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get(
    '/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              service: { type: 'string' },
            },
            required: ['status', 'service'],
          },
        },
      },
    },
    async () => ({ status: 'ok', service: 'cyberwatch' }),
  );
};
