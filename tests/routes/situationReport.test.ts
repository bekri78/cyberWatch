import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../src/app';

const SAMPLE_REPORT_ROW = {
  id: 'a1f4b1d4-b9d2-48d8-bc1d-8ce000920bc7',
  summary: 'Une fuite de donnees a ete signalee chez un operateur telecom francais.',
  key_points: ['Fuite de donnees chez un operateur telecom francais (France, severite elevee).'],
  event_count: 12,
  window_start: new Date('2026-09-05T08:00:00.000Z'),
  window_end: new Date('2026-09-05T14:30:00.000Z'),
  model: 'deepseek-v4-flash',
  generated_at: new Date('2026-09-05T14:45:00.000Z'),
};

function makeFakePool(rows: unknown[]) {
  const query = async () => ({ rows });
  return { query } as unknown as Pool;
}

describe('GET /api/v1/situation-report', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('renvoie le dernier compte rendu au format camelCase', async () => {
    app = buildApp(makeFakePool([SAMPLE_REPORT_ROW]));

    const response = await app.inject({ method: 'GET', url: '/api/v1/situation-report' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.report).toMatchObject({
      id: 'a1f4b1d4-b9d2-48d8-bc1d-8ce000920bc7',
      summary: 'Une fuite de donnees a ete signalee chez un operateur telecom francais.',
      keyPoints: ['Fuite de donnees chez un operateur telecom francais (France, severite elevee).'],
      eventCount: 12,
      model: 'deepseek-v4-flash',
    });
  });

  it("renvoie report=null quand aucun compte rendu n'a encore ete genere", async () => {
    app = buildApp(makeFakePool([]));

    const response = await app.inject({ method: 'GET', url: '/api/v1/situation-report' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ report: null });
  });
});
