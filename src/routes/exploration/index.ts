import type { FastifyPluginAsync } from 'fastify';
import { eventSchema } from '../shared/eventSchema';
import { decodeCursor, encodeCursor, InvalidCursorError } from '../../lib/pagination/cursor';
import { toApiEvent, type CyberEventRow } from '../../database/repositories/cyberEvents';

interface ExplorationQuery {
  period: '24h' | '7d' | '30d';
  until?: string;
  q?: string;
  category?: string;
  severity?: string;
  source?: string;
  country?: string;
  location: 'all' | 'cited' | 'unknown';
  cursor?: string;
  limit: number;
}

export const explorationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/exploration', {
    schema: { response: { 200: { type: 'object', additionalProperties: true, properties: {
      items: { type: 'array', items: eventSchema },
    } }, 400: { type: 'object', properties: { message: { type: 'string' } } } }, querystring: { type: 'object', additionalProperties: false, properties: {
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
      period: { type: 'string', enum: ['24h', '7d', '30d'], default: '7d' },
      until: { type: 'string', format: 'date-time' },
      q: { type: 'string', maxLength: 160 },
      category: { type: 'string', maxLength: 60 }, severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
      source: { type: 'string', maxLength: 80 }, country: { type: 'string', maxLength: 120 },
      location: { type: 'string', enum: ['all', 'cited', 'unknown'], default: 'all' }, cursor: { type: 'string', maxLength: 500 },
    } } },
  }, async (request, reply) => {
    const query = request.query as ExplorationQuery;
    const until = new Date(query.until ?? Date.now());
    const duration = { '24h': 86400000, '7d': 7 * 86400000, '30d': 30 * 86400000 }[query.period];
    const since = new Date(until.getTime() - duration);
    let cursor;
    try {
      cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
      if (cursor && (!/^\d{4}-\d{2}-\d{2}T/.test(cursor.sortValue) || !Number.isFinite(Date.parse(cursor.sortValue))
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.id))) throw new InvalidCursorError();
    }
    catch (error) {
      if (error instanceof InvalidCursorError) return reply.code(400).send({ message: 'Curseur invalide.' });
      throw error;
    }
    // Une seule requête : carte, chronologie, compteurs et page lisent le même instantané SQL.
    const { rows } = await app.pool.query<{
      total: number; unknown: number; high: number; countries: { country: string; count: number; high: number }[];
      countryOptions: string[]; timeline: { bucket: number; count: number }[]; items: CyberEventRow[];
    }>(`
      WITH base AS MATERIALIZED (
        SELECT ce.*, COALESCE(published_at, created_at) AS event_date
        FROM cyber_events ce
        WHERE qualification_status = 'qualified' AND is_relevant = true
          AND COALESCE(published_at, created_at) >= $1::timestamptz
          AND COALESCE(published_at, created_at) <= $2::timestamptz
          AND ($3::text = '' OR strpos(lower(concat_ws(' ', title, summary, description, array_to_string(cves, ' '))), lower($3)) > 0)
          AND ($4::text = '' OR category = $4)
          AND ($5::text = '' OR severity = $5)
          AND ($6::text = '' OR $6 = ANY(tags))
      ), filtered AS MATERIALIZED (
        SELECT * FROM base WHERE ($7::text = '' OR $7 = ANY(countries))
          AND ($8::text = 'all' OR ($8 = 'unknown' AND cardinality(countries) = 0)
            OR ($8 = 'cited' AND cardinality(countries) > 0))
      ), paged AS (
        SELECT * FROM filtered
        WHERE ($9::timestamptz IS NULL OR (event_date, id) < ($9::timestamptz, $10::uuid))
        ORDER BY event_date DESC, id DESC LIMIT $12
      )
      SELECT (SELECT count(*)::int FROM filtered) AS total,
        (SELECT count(*)::int FROM filtered WHERE cardinality(countries) = 0) AS unknown,
        (SELECT count(*)::int FROM filtered WHERE severity IN ('high','critical')) AS high,
        COALESCE((SELECT jsonb_agg(c ORDER BY c.count DESC, c.country) FROM (
          SELECT country, count(DISTINCT id)::int AS count,
            count(DISTINCT id) FILTER (WHERE severity IN ('high','critical'))::int AS high
          FROM filtered, unnest(countries) country GROUP BY country
        ) c), '[]'::jsonb) AS countries,
        COALESCE((SELECT jsonb_agg(country ORDER BY country) FROM (SELECT DISTINCT unnest(countries) country FROM base) c), '[]'::jsonb) AS "countryOptions",
        COALESCE((SELECT jsonb_agg(t ORDER BY bucket) FROM (
          SELECT least(23, floor(extract(epoch FROM (event_date - $1::timestamptz)) / ($11::double precision / 24)))::int AS bucket,
            count(*)::int AS count FROM filtered GROUP BY bucket
        ) t), '[]'::jsonb) AS timeline,
        COALESCE((SELECT jsonb_agg(to_jsonb(p) || jsonb_build_object('publications', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('source', s.name, 'title', ri.title, 'url', ri.url, 'publishedAt', ri.published_at) ORDER BY ri.collected_at, ri.id)
          FROM raw_items ri JOIN sources s ON s.id = ri.source_id WHERE ri.cyber_event_id = p.id
        ), '[]'::jsonb)) ORDER BY p.event_date DESC, p.id DESC) FROM paged p), '[]'::jsonb) AS items
    `, [since.toISOString(), until.toISOString(), query.q?.trim() ?? '', query.category ?? '', query.severity ?? '',
      query.source ?? '', query.country ?? '', query.location, cursor?.sortValue ?? null, cursor?.id ?? null, duration / 1000, query.limit + 1]);
    const result = rows[0]!;
    const items = result.items.slice(0, query.limit).map(toApiEvent);
    const last = items.at(-1);
    return { ...result, items, windowStart: since.toISOString(), windowEnd: until.toISOString(),
      nextCursor: result.items.length > query.limit && last ? encodeCursor({ sortValue: last.publishedAt ?? last.createdAt, id: last.id }) : null };
  });
};
