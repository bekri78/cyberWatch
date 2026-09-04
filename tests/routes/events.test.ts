import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../src/app';

// Evenement derive d'une vraie entree CERT-FR (CERTFR-2026-AVI-1111, F5),
// deja promue par classifyEvent/promoteRawItems -- cf. tests/pipeline.
const SAMPLE_EVENT_ROW = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'Multiples vulnérabilités dans les produits F5',
  summary: 'Multiples vulnérabilités dans les produits F5',
  description: 'De multiples vulnérabilités ont été découvertes dans les produits F5.',
  category: 'vulnerability',
  severity: 'medium',
  confidence: 'low',
  published_at: new Date('2026-09-03T00:00:00.000Z'),
  first_seen_at: new Date('2026-09-04T11:59:45.000Z'),
  last_seen_at: new Date('2026-09-04T11:59:45.000Z'),
  created_at: new Date('2026-09-04T11:59:45.000Z'),
  updated_at: new Date('2026-09-04T11:59:45.000Z'),
  countries: [],
  organizations: [],
  sectors: [],
  cves: [],
  threat_actors: [],
  mitre_techniques: [],
  tags: ['certfr', 'vulnerability'],
  ai_generated: false,
};

function makeFakePool() {
  const query = async (sql: string) => {
    if (sql.includes('WHERE id = $1')) {
      return { rows: [SAMPLE_EVENT_ROW] };
    }
    return { rows: [SAMPLE_EVENT_ROW] };
  };
  return { query } as unknown as Pool;
}

describe('GET /api/v1/events', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('renvoie une page avec le vrai format camelCase attendu par un consommateur', async () => {
    app = buildApp(makeFakePool());

    const response = await app.inject({ method: 'GET', url: '/api/v1/events' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: '11111111-1111-1111-1111-111111111111',
      title: 'Multiples vulnérabilités dans les produits F5',
      category: 'vulnerability',
      severity: 'medium',
      aiGenerated: false,
    });
  });

  it('rejette un curseur illisible avec un 400 explicite', async () => {
    app = buildApp(makeFakePool());

    const response = await app.inject({ method: 'GET', url: '/api/v1/events?cursor=!!!invalide!!!' });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('curseur invalide');
  });

  it('rejette une limite hors bornes (validation de schema)', async () => {
    app = buildApp(makeFakePool());

    const response = await app.inject({ method: 'GET', url: '/api/v1/events?limit=500' });

    expect(response.statusCode).toBe(400);
  });
});

describe('GET /api/v1/events/:id', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it("renvoie l'evenement quand il existe", async () => {
    app = buildApp(makeFakePool());

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/events/11111111-1111-1111-1111-111111111111',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('renvoie 404 quand aucun evenement ne correspond', async () => {
    const emptyPool = { query: async () => ({ rows: [] }) } as unknown as Pool;
    app = buildApp(emptyPool);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/events/22222222-2222-2222-2222-222222222222',
    });

    expect(response.statusCode).toBe(404);
  });
});
