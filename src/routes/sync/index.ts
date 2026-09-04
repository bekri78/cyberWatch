import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify';
import { syncEvents } from '../../database/repositories/cyberEvents';
import { decodeCursor, InvalidCursorError } from '../../lib/pagination/cursor';
import { eventSchema } from '../shared/eventSchema';
import { errorSchema } from '../shared/errorSchema';

function sendInvalidCursor(reply: FastifyReply): FastifyReply {
  return reply.code(400).send({ error: 'curseur invalide', message: 'Le parametre cursor est illisible.' });
}

/**
 * GET /sync, monte sous /api/v1 (cf. app.ts).
 *
 * Suivi incremental : renvoie les evenements crees OU modifies depuis le
 * curseur donne (ordre updated_at croissant), avec un nextCursor a
 * reutiliser au prochain appel. Un consommateur qui garde son dernier
 * nextCursor ne retelecharge jamais tout le catalogue -- cf. §08 du
 * document d'architecture. `since` est fourni en confort (conversion
 * cote serveur vers un curseur), mais le curseur reste la source de
 * verite : il evite les pertes/doublons en cas d'egalite de timestamp
 * qu'un simple filtre par date ne peut pas garantir.
 */
export const syncRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get(
    '/sync',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
            cursor: { type: 'string' },
            since: { type: 'string', format: 'date-time' },
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
      const { limit, cursor, since } = request.query as {
        limit: number;
        cursor?: string;
        since?: string;
      };

      try {
        // `cursor` prime sur `since` : c'est la position exacte connue.
        // `since` (horodatage seul) est une commodite pour un premier
        // appel sans curseur sauvegarde -- moins precis en cas d'egalite
        // de timestamp, mais suffisant pour demarrer un flux.
        const resolvedCursor = cursor
          ? decodeCursor(cursor)
          : since
            ? { sortValue: new Date(since).toISOString(), id: '00000000-0000-0000-0000-000000000000' }
            : undefined;

        const page = await syncEvents(app.pool, { limit, cursor: resolvedCursor });
        return page;
      } catch (err) {
        if (err instanceof InvalidCursorError) return sendInvalidCursor(reply);
        throw err;
      }
    },
  );
};
