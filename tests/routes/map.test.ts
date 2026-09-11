import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../src/app';

const unusedPool = {} as Pool;
const tile = Buffer.from('89504e470d0a1a0a', 'hex');
let app: FastifyInstance | undefined;
afterEach(async () => { await app?.close(); vi.unstubAllGlobals(); });

describe('CARTO tiles through Railway', () => {
  it('serves PNG bytes and preserves cache headers without exposing MAP_KEY', async () => {
    const fetchTile = vi.fn().mockResolvedValue(new Response(tile, {
      headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' },
    }));
    vi.stubGlobal('fetch', fetchTile);
    app = buildApp(unusedPool, { mapKey: 'test key&reserved' });
    const response = await app.inject('/api/v1/map/tiles/4/8/5.png');
    expect(response.statusCode).toBe(200);
    expect(response.rawPayload).toEqual(tile);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['cache-control']).toBe('public, max-age=86400');
    const url = fetchTile.mock.calls[0][0] as URL;
    expect(url.origin).toBe('https://basemaps.cartocdn.com');
    expect(url.pathname).toBe('/rastertiles/voyager/4/8/5.png');
    expect(url.searchParams.get('key')).toBe('test key&reserved');
    expect(JSON.stringify(response.headers)).not.toContain('test key');
    expect(response.headers.location).toBeUndefined();
  });

  it.each([undefined, '', 'YOUR_KEY'])('returns 503 without calling CARTO when the key is %s', async (mapKey) => {
    const fetchTile = vi.fn();
    vi.stubGlobal('fetch', fetchTile);
    app = buildApp(unusedPool, { mapKey });
    const response = await app.inject('/api/v1/map/tiles/0/0/0.png');
    expect(response.statusCode).toBe(503);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(fetchTile).not.toHaveBeenCalled();
  });

  it.each(['/21/0/0', '/2/4/0', '/2/0/4', '/-1/0/0', '/2.5/0/0', '/2/no/0'])(
    'rejects invalid coordinates %s before requesting tiles', async (path) => {
      const fetchTile = vi.fn();
      vi.stubGlobal('fetch', fetchTile);
      app = buildApp(unusedPool, { mapKey: 'test-key' });
      expect((await app.inject(`/api/v1/map/tiles${path}.png`)).statusCode).toBe(400);
      expect(fetchTile).not.toHaveBeenCalled();
    },
  );

  it.each([403, 429, 500])('does not forward upstream error details or cache failures (%s)', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('sensitive upstream details', { status })));
    app = buildApp(unusedPool, { mapKey: 'test-key' });
    const response = await app.inject('/api/v1/map/tiles/0/0/0.png');
    expect(response.statusCode).toBe(502);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).not.toContain('sensitive');
  });

  it('handles network errors without exposing their URL or API key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('failed https://carto.test/?key=test-secret')));
    app = buildApp(unusedPool, { mapKey: 'test-secret' });
    const response = await app.inject('/api/v1/map/tiles/0/0/0.png');
    expect(response.statusCode).toBe(502);
    expect(response.body).not.toContain('test-secret');
  });

  it('rejects a successful non-image upstream response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>error</html>', {
      headers: { 'content-type': 'text/html' },
    })));
    app = buildApp(unusedPool, { mapKey: 'test-key' });
    expect((await app.inject('/api/v1/map/tiles/0/0/0.png')).statusCode).toBe(502);
  });
});
