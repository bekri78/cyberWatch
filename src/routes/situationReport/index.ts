import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getLatestSituationReport } from '../../database/repositories/situationReports';

const situationReportSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    summary: { type: 'string' },
    keyPoints: { type: 'array', items: { type: 'string' } },
    eventCount: { type: 'integer' },
    windowStart: { type: 'string' },
    windowEnd: { type: 'string' },
    model: { type: 'string' },
    generatedAt: { type: 'string' },
  },
} as const;

/**
 * GET /situation-report, monte sous /api/v1 (cf. app.ts).
 *
 * Renvoie le dernier compte rendu de situation redige par DeepSeek
 * (Phase 6), ou report=null si aucun n'a encore ete genere --
 * DEEPSEEK_API_KEY absente, ou tout premier demarrage avant le premier
 * passage planifie (cf. jobs/situationReportScheduler.ts). Jamais de
 * texte invente pour combler l'absence.
 */
export const situationReportRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get(
    '/situation-report',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              report: { anyOf: [situationReportSchema, { type: 'null' }] },
            },
            required: ['report'],
          },
        },
      },
    },
    async () => {
      const report = await getLatestSituationReport(app.pool);
      return { report };
    },
  );
};
