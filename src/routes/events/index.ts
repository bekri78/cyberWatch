import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify';
import { getEventById, listEvents } from '../../database/repositories/cyberEvents';
import { decodeCursor, InvalidCursorError } from '../../lib/pagination/cursor';
import { eventSchema } from '../shared/eventSchema';
import { errorSchema } from '../shared/errorSchema';

function sendInvalidCursor(reply: FastifyReply): FastifyReply {
  return reply.code(400).send({ error: 'curseur invalide', message: 'Le parametre cursor est illisible.' });
}

/**
 * GET /events (+ /events/:id), montes sous /api/v1 (cf. app.ts).
 *
 * "Catalogue" : parcours/filtrage des evenements consolides, du plus
 * recent au plus ancien. Pour le suivi incremental ("qu'est-ce qui a
 * change depuis mon dernier passage ?"), voir /api/v1/sync a la place.
 */
export const eventsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get(
    '/events',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            cursor: { type: 'string' },
            category: { type: 'string' },
            severity: { type: 'string' },
            tag: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              items: { type: 'array', items: eventSchema },
              nextCursor: { type: ['string', 'null'] },
            },
            required: ['items', 'nextCursor'],
          },
          400: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { limit, cursor, category, severity, tag } = request.query as {
        limit: number;
        cursor?: string;
        category?: string;
        severity?: string;
        tag?: string;
      };

      try {
        const page = await listEvents(app.pool, {
          limit,
          cursor: cursor ? decodeCursor(cursor) : undefined,
          category,
          severity,
          tag,
        });
        return page;
      } catch (err) {
        if (err instanceof InvalidCursorError) return sendInvalidCursor(reply);
        throw err;
      }
    },
  );

  app.get(
    '/events/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
        response: {
          200: eventSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const event = await getEventById(app.pool, id);

      if (!event) {
        return reply.code(404).send({ error: 'introuvable', message: `Aucun evenement avec l'id ${id}` });
      }

      return event;
    },
  );
};
