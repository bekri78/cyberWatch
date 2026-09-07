import type { FastifyPluginAsync } from 'fastify';

/** Agrégats sur toute la fenêtre, jamais sur une page de résultats. */
export const overviewRoutes: FastifyPluginAsync = async (app) => {
  app.get('/overview', async () => {
    const { rows } = await app.pool.query(`
      WITH bounds AS (SELECT now() AS until, now() - interval '24 hours' AS since),
      visible AS (
        SELECT ce.* FROM cyber_events ce, bounds b
        WHERE ce.qualification_status = 'qualified' AND ce.is_relevant = true
          AND COALESCE(ce.published_at, ce.created_at) >= b.since
          AND COALESCE(ce.published_at, ce.created_at) <= b.until
      )
      SELECT b.since AS "windowStart", b.until AS "windowEnd",
        (SELECT count(*)::int FROM visible) AS total,
        (SELECT count(*)::int FROM visible WHERE severity = 'critical') AS critical,
        (SELECT count(*)::int FROM visible WHERE severity = 'high') AS high,
        (SELECT count(DISTINCT country)::int FROM visible, unnest(countries) country) AS countries,
        (SELECT count(DISTINCT ri.source_id)::int FROM raw_items ri JOIN visible v ON v.id = ri.cyber_event_id) AS sources,
        (SELECT count(*)::int FROM cyber_events WHERE qualification_status = 'pending') AS pending,
        (SELECT count(*)::int FROM cyber_events WHERE qualification_status = 'failed') AS failed,
        (SELECT min(created_at) FROM cyber_events WHERE qualification_status IN ('pending', 'failed')) AS "oldestPendingAt"
      FROM bounds b
    `);
    return rows[0];
  });
};
