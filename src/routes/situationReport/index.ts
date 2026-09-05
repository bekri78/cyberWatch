import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getLatestSituationReport } from '../../database/repositories/situationReports';

const aRetenirSchema = {
  type: 'object',
  properties: {
    titre: { type: 'string' },
    criticite: { type: 'string' },
    concerne: { type: 'string' },
    situation: { type: 'string' },
    evaluation: { type: 'string' },
    sources: { type: 'array', items: { type: 'string' } },
  },
} as const;

const vulnerabiliteSchema = {
  type: 'object',
  properties: {
    cve: { type: ['string', 'null'] },
    produit: { type: 'string' },
    criticite: { type: 'string' },
    exploitation: { type: 'string' },
    kev: { type: 'string' },
    epss: { type: ['string', 'null'] },
    resume: { type: 'string' },
    impact: { type: 'string' },
  },
} as const;

const menaceCampagneSchema = {
  type: 'object',
  properties: {
    titre: { type: 'string' },
    objectif: { type: ['string', 'null'] },
    secteurs: { type: ['string', 'null'] },
    details: { type: 'string' },
  },
} as const;

const secteurItemSchema = {
  type: 'object',
  properties: {
    titre: { type: 'string' },
    details: { type: 'string' },
  },
} as const;

const sectionsSchema = {
  type: 'object',
  properties: {
    aRetenir: { type: 'array', items: aRetenirSchema },
    vulnerabilitesImportantes: { type: 'array', items: vulnerabiliteSchema },
    menacesCampagnes: { type: 'array', items: menaceCampagneSchema },
    otIcs: { type: 'array', items: secteurItemSchema },
    defenseSpatial: { type: 'array', items: secteurItemSchema },
    tendances: { type: 'array', items: { type: 'string' } },
    pointsASurveiller: { type: 'array', items: { type: 'string' } },
  },
} as const;

const situationReportSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    summary: { type: 'string' },
    sections: sectionsSchema,
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
 * Renvoie le dernier compte rendu de situation "analyste" redige par
 * DeepSeek (Phase 6, cf. sections hierarchisees par criticite dans
 * database/repositories/situationReports.ts), ou report=null si aucun n'a
 * encore ete genere -- DEEPSEEK_API_KEY absente, ou tout premier
 * demarrage avant le premier passage planifie (cf.
 * jobs/situationReportScheduler.ts). Jamais de texte invente pour combler
 * l'absence.
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
