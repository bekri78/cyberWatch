import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Parser from 'rss-parser';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { normalizeEntry } from '../../src/collectors/certfr/normalize';
import { normalizeGkgLine } from '../../src/collectors/gdelt/normalize';
import { getSourceIdByName, saveRawItems } from '../../src/database/repositories/rawItems';
import { getEventById, listEvents, syncEvents } from '../../src/database/repositories/cyberEvents';
import { promoteRawItems } from '../../src/pipeline/promoteRawItems';
import { classifyEvent } from '../../src/pipeline/classifyEvent';
import { buildApp } from '../../src/app';

// Exécution réelle des requêtes PostgreSQL sur les captures déjà présentes.
// Les transitions de statut sont des états de test, pas des évaluations IA inventées.
describe('P0 — qualification et provenance PostgreSQL', () => {
  const db = new PGlite();
  const query = async (sql: string, params?: unknown[]) => {
    const result = await db.query(sql, params);
    return { ...result, rowCount: result.affectedRows };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  const app = buildApp(pool);
  let gdeltId: string;
  let certId: string;
  let sourceUrl: string;

  beforeAll(async () => {
    const migrations = join(process.cwd(), 'src/database/migrations');
    for (const file of readdirSync(migrations).filter((name) => name.endsWith('.sql')).sort()) {
      if (file.startsWith('013')) continue;
      await db.exec(readFileSync(join(migrations, file), 'utf8'));
    }
    const feed = await new Parser().parseString(readFileSync(join(__dirname, '../collectors/certfr-fixtures/avis-feed-real.xml'), 'utf8'));
    const certItem = normalizeEntry(feed.items[0]!);
    sourceUrl = certItem.url;
    const gdeltItem = readFileSync(join(__dirname, '../collectors/gdelt-fixtures/gkg-sample-real.csv'), 'utf8')
      .split('\n').map((line) => normalizeGkgLine(line.trim())).find((item) => item !== null)!;
    expect(gdeltItem).toBeTruthy();
    for (const [source, item] of [['certfr', certItem], ['gdelt', gdeltItem]] as const) {
      await saveRawItems(pool, await getSourceIdByName(pool, source), [item]);
      // Rejoue la promotion historique à partir des vrais champs de la capture.
      const classified = classifyEvent({ sourceName: source, ...item });
      await db.query(`WITH inserted AS (
        INSERT INTO cyber_events(title, summary, description, published_at, category, severity, confidence, tags, countries)
        VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
      ) UPDATE raw_items SET cyber_event_id = (SELECT id FROM inserted) WHERE url = $9`,
      [item.title, item.contentExcerpt, item.publishedAt, classified.category, classified.severity,
        classified.confidence, classified.tags, classified.countries, item.url]);
    }
    await db.exec(readFileSync(join(migrations, '013_qualification.sql'), 'utf8'));
    certId = (await db.query<{ id: string }>("SELECT id FROM cyber_events WHERE tags[1] = 'certfr'")).rows[0]!.id;
    gdeltId = (await db.query<{ id: string }>("SELECT id FROM cyber_events WHERE tags[1] = 'gdelt'")).rows[0]!.id;
  }, 30000);

  afterAll(async () => { await app.close(); await db.close(); });

  it('migre les sources institutionnelles en qualifiées et les articles non relus en attente', async () => {
    const page = await listEvents(pool, { limit: 100 });
    expect(page.items.map((event) => event.id)).toEqual([certId]);
    expect(page.items[0]!.qualificationStatus).toBe('qualified');
    expect((await listEvents(pool, { limit: 20, qualification: 'pending' })).items.map((event) => event.id)).toEqual([gdeltId]);
    expect(await getEventById(pool, gdeltId)).toBeNull();
    expect((await syncEvents(pool, { limit: 100 })).items.map((event) => event.id)).toEqual([certId]);
  });

  it('expose les vrais liens et statuts jusque dans la réponse HTTP', async () => {
    const response = await app.inject('/api/v1/events');
    expect(response.statusCode).toBe(200);
    expect(response.json().items[0]).toMatchObject({
      qualificationStatus: 'qualified', publications: [{ source: 'certfr', url: sourceUrl }],
    });
    const pending = await app.inject('/api/v1/events?qualification=pending');
    expect(pending.json().items[0].id).toBe(gdeltId);
    expect((await app.inject('/api/v1/events?qualification=rejected')).statusCode).toBe(400);
  });

  it('exclut les échecs et les rejets, puis publie une qualification réussie', async () => {
    await db.query("UPDATE cyber_events SET qualification_status = 'failed' WHERE id = $1", [gdeltId]);
    expect((await listEvents(pool, { limit: 100 })).items).toHaveLength(1);
    expect((await listEvents(pool, { limit: 20, qualification: 'failed' })).items[0]!.id).toBe(gdeltId);
    await db.query("UPDATE cyber_events SET qualification_status = 'rejected', is_relevant = false WHERE id = $1", [gdeltId]);
    expect(await getEventById(pool, gdeltId)).toBeNull();
    await db.query("UPDATE cyber_events SET qualification_status = 'qualified', is_relevant = true, ai_generated = true WHERE id = $1", [gdeltId]);
    expect((await listEvents(pool, { limit: 100 })).items).toHaveLength(2);
    await db.query("UPDATE cyber_events SET qualification_status = 'pending', ai_generated = false WHERE id = $1", [gdeltId]);
  });

  it('calcule les agrégats indépendamment de la pagination et exclut les informations non qualifiées', async () => {
    // Les anciennes captures gardent leurs dates réelles. L'instant de collecte
    // des lignes de test est fourni par PostgreSQL, sans antidater les publications.
    const response = await app.inject('/api/v1/overview');
    expect(response.statusCode).toBe(200);
    const overview = response.json();
    const published = (await getEventById(pool, certId))!.publishedAt!;
    const inWindow = published >= overview.windowStart && published <= overview.windowEnd;
    expect(overview.total).toBe(inWindow ? 1 : 0);
    expect(overview.pending).toBe(1);
    expect(overview.failed).toBe(0);
    expect(overview.sources).toBe(inWindow ? 1 : 0);
    expect(new Date(overview.windowEnd).getTime() - new Date(overview.windowStart).getTime()).toBe(86400000);
  });

  it('promeut les nouvelles captures une seule fois et ne laisse aucun événement orphelin', async () => {
    const feed = await new Parser().parseString(readFileSync(join(__dirname, '../collectors/certfr-fixtures/alerte-feed-real.xml'), 'utf8'));
    const items = feed.items.map(normalizeEntry);
    await saveRawItems(pool, await getSourceIdByName(pool, 'certfr'), items);
    expect((await promoteRawItems(pool)).promoted).toBe(items.length);
    expect((await promoteRawItems(pool)).promoted).toBe(0);
    const orphan = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM cyber_events ce WHERE NOT EXISTS (SELECT 1 FROM raw_items ri WHERE ri.cyber_event_id = ce.id)');
    expect(orphan.rows[0]!.count).toBe(0);
  });

  it('P1 : masque les captures CERT-FR non localisées dans l’exploration', async () => {
    const feed = await new Parser().parseString(readFileSync(join(__dirname, '../collectors/certfr-fixtures/avis-feed-real.xml'), 'utf8'));
    await saveRawItems(pool, await getSourceIdByName(pool, 'certfr'), feed.items.map(normalizeEntry));
    await promoteRawItems(pool);
    const until = new Date(Math.max(...feed.items.map((item) => new Date(item.isoDate!).getTime()))).toISOString();
    const url = `/api/v1/exploration?period=30d&until=${encodeURIComponent(until)}&limit=2`;
    const response = await app.inject(url);
    expect(response.statusCode, response.body).toBe(200);
    const first = response.json();
    expect(first.total).toBe(0);
    expect(first.items).toHaveLength(0);
    expect(first.mapItems.length).toBeLessThanOrEqual(first.total);
    expect(new Set(first.mapItems.map((item: { id: string }) => item.id)).size).toBe(first.mapItems.length);
    expect(first.mapItems.every((item: { countries: string[] }) => item.countries.length > 0)).toBe(true);
    expect(first.timeline.reduce((sum: number, bin: { count: number }) => sum + bin.count, 0)).toBe(first.total);
    const ids = first.items.map((item: { id: string }) => item.id);
    let cursor = first.nextCursor;
    while (cursor) {
      const page = (await app.inject(`${url}&cursor=${cursor}`)).json();
      expect(page.total).toBe(first.total);
      expect(page.timeline).toEqual(first.timeline);
      expect(page.mapItems).toEqual(first.mapItems);
      ids.push(...page.items.map((item: { id: string }) => item.id));
      cursor = page.nextCursor;
    }
    expect(new Set(ids).size).toBe(first.total);
    expect(ids).not.toContain(gdeltId);
    const unknown = (await app.inject(`${url}&location=unknown`)).json();
    expect(unknown.total).toBe(first.unknown);
    expect(unknown.countries).toEqual([]);
    expect((await app.inject(`${url}&country=NoSuchCountry`)).json().total).toBe(0);
    expect((await app.inject(`${url}&q=NoSuchPublication`)).json().total).toBe(0);
    expect((await app.inject(`${url}&source=gdelt`)).json().total).toBe(0);
    const invalid = Buffer.from(JSON.stringify({ sortValue: until, id: 'invalid' })).toString('base64url');
    expect((await app.inject(`${url}&cursor=${invalid}`)).statusCode).toBe(400);
    expect((await app.inject('/api/v1/exploration?period=invalid')).statusCode).toBe(400);
  });

  it('P1 : relie les pays réellement extraits au flux après qualification', async () => {
    await db.query("UPDATE cyber_events SET qualification_status = 'qualified' WHERE id = $1", [gdeltId]);
    try {
      const event = (await getEventById(pool, gdeltId))!;
      expect(event.countries.length).toBeGreaterThan(0);
      const query = new URLSearchParams({ period: '24h', until: event.publishedAt!, source: 'gdelt' });
      const response = await app.inject(`/api/v1/exploration?${query}`);
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().countries.map((item: { country: string }) => item.country).sort()).toEqual([...new Set(event.countries)].sort());
      expect(response.json().mapItems).toEqual([{ id: gdeltId, title: event.title, countries: event.countries, severity: event.severity, category: event.category, locations: [] }]);
      query.set('country', event.countries[0]!);
      const filtered = (await app.inject(`/api/v1/exploration?${query}`)).json();
      expect(filtered.total).toBe(1);
      expect(filtered.items[0].id).toBe(gdeltId);
      expect(filtered.unknown).toBe(0);
      query.set('location', 'unknown');
      expect((await app.inject(`/api/v1/exploration?${query}`)).json().total).toBe(0);
    } finally {
      await db.query("UPDATE cyber_events SET qualification_status = 'pending' WHERE id = $1", [gdeltId]);
    }
  });
});
