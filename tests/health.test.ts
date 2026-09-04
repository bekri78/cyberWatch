import { describe, expect, it, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../src/app';

// Pool jamais interroge par /health -- un objet qui leve si on l'utilise
// suffit a garantir qu'aucun appel PostgreSQL ne se glisse dans le chemin
// de /health (cf. cahier des charges §22), sans avoir besoin d'un vrai
// DATABASE_URL juste pour construire l'app dans ce test.
const unusedPool = {
  query: () => {
    throw new Error('/health ne doit jamais interroger PostgreSQL');
  },
} as unknown as Pool;

describe('GET /api/v1/health', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('repond 200 avec le statut ok sans dependance externe', async () => {
    app = buildApp(unusedPool);

    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'cyberwatch' });
  });

  it('est aussi joignable sur l\'alias racine /health', async () => {
    app = buildApp(unusedPool);

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'cyberwatch' });
  });
});
