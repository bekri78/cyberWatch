import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../src/app';
import { encodeCursor } from '../../src/lib/pagination/cursor';

const SAMPLE_EVENT_ROW = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'Vulnérabilité dans Cisco Catalyst SD-WAN',
  summary: 'Vulnérabilité dans Cisco Catalyst SD-WAN',
  description: null,
  category: 'alert',
  severity: 'critical',
  confidence: 'low',
  published_at: new Date('2026-02-25T00:00:00.000Z'),
  first_seen_at: new Date('2026-09-04T11:59:45.000Z'),
  last_seen_at: new Date('2026-09-04T11:59:45.000Z'),
  created_at: new Date('2026-09-04T11:59:45.000Z'),
  updated_at: new Date('2026-09-04T12:00:00.000Z'),
  countries: [],
  organizations: [],
  sectors: [],
  cves: ['CVE-2026-20127'],
  threat_actors: [],
  mitre_techniques: [],
  tags: ['certfr', 'alert'],
  ai_generated: false,
};

describe('GET /api/v1/sync', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('renvoie les evenements modifies avec un nextCursor exploitable', async () => {
    const pool = {
      query: async (_sql: string, params: unknown[] = []) => {
        const limit = params.at(-1) as number;
        // Simule une page pleine pour verifier que nextCursor est calcule.
        return { rows: Array(limit).fill(SAMPLE_EVENT_ROW) };
      },
    } as unknown as Pool;
    app = buildApp(pool);

    const response = await app.inject({ method: 'GET', url: '/api/v1/sync?limit=1' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items).toHaveLength(1);
    expect(body.nextCursor).toEqual(expect.any(String));
  });

  it('accepte un cursor precedemment renvoye par /sync sans erreur', async () => {
    const cursor = encodeCursor({ sortValue: '2026-09-04T12:00:00.000Z', id: SAMPLE_EVENT_ROW.id });
    const pool = { query: async () => ({ rows: [] }) } as unknown as Pool;
    app = buildApp(pool);

    const response = await app.inject({ method: 'GET', url: `/api/v1/sync?cursor=${cursor}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [], nextCursor: null });
  });

  it('rejette un curseur illisible avec un 400', async () => {
    const pool = { query: async () => ({ rows: [] }) } as unknown as Pool;
    app = buildApp(pool);

    const response = await app.inject({ method: 'GET', url: '/api/v1/sync?cursor=pas-un-curseur-valide' });

    expect(response.statusCode).toBe(400);
  });
});
