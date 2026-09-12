import type { FastifyPluginAsync } from 'fastify';

// The CARTO key is injected by Railway at runtime and stays on the server.
// Only coordinates are accepted: this endpoint cannot proxy arbitrary URLs.
export const mapRoutes: FastifyPluginAsync<{ mapKey?: string }> = async (app, options) => {
  app.get<{ Params: { z: number; x: number; y: number } }>('/map/tiles/:z/:x/:y.png', {
    schema: {
      params: {
        type: 'object', required: ['z', 'x', 'y'],
        properties: {
          z: { type: 'integer', minimum: 0, maximum: 20 },
          x: { type: 'integer', minimum: 0, maximum: 1048575 },
          y: { type: 'integer', minimum: 0, maximum: 1048575 },
        },
      },
    },
  }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const { z, x, y } = request.params;
    if (x >= 2 ** z || y >= 2 ** z) {
      return reply.code(400).send({ error: 'Coordonnées de tuile invalides.' });
    }
    const key = options.mapKey?.trim();
    if (!key || key === 'YOUR_KEY') {
      return reply.code(503).send({ error: 'Fond de carte indisponible : MAP_KEY non configurée.' });
    }
    const url = new URL(`https://basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`);
    url.searchParams.set('key', key);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: 'error' });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png')) {
        await response.body?.cancel();
        return reply.code(502).send({ error: 'Fond de carte indisponible auprès de CARTO.' });
      }
      const tile = Buffer.from(await response.arrayBuffer());
      return reply.type('image/png')
        .header('Cache-Control', response.headers.get('cache-control') ?? 'public, max-age=3600')
        .send(tile);
    } catch {
      // Never log fetch errors: they may contain the upstream URL and its key.
      return reply.code(502).send({ error: 'Fond de carte temporairement indisponible.' });
    }
  });
};
