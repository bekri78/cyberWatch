/**
 * Schema JSON (Fastify/AJV) d'un cyber_event serialise pour l'API.
 * Partage entre /api/v1/events et /api/v1/sync : les deux endpoints
 * renvoient exactement la meme forme d'objet, seul le tri/filtrage change.
 */
export const eventSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    summary: { type: 'string' },
    description: { type: ['string', 'null'] },
    category: { type: 'string' },
    severity: { type: 'string' },
    confidence: { type: 'string' },
    publishedAt: { type: ['string', 'null'] },
    firstSeenAt: { type: 'string' },
    lastSeenAt: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    countries: { type: 'array', items: { type: 'string' } },
    organizations: { type: 'array', items: { type: 'string' } },
    sectors: { type: 'array', items: { type: 'string' } },
    cves: { type: 'array', items: { type: 'string' } },
    threatActors: { type: 'array', items: { type: 'string' } },
    mitreTechniques: { type: 'array', items: { type: 'string' } },
    tags: { type: 'array', items: { type: 'string' } },
    aiGenerated: { type: 'boolean' },
  },
} as const;
