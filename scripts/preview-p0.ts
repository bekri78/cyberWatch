/** Aperçu local sur captures réelles, base en mémoire, aucun appel IA/collecteur. */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Parser from 'rss-parser';
import type { Pool } from 'pg';
import { buildApp } from '../src/app';
import { normalizeEntry } from '../src/collectors/certfr/normalize';
import { normalizeGkgLine } from '../src/collectors/gdelt/normalize';
import { getSourceIdByName, saveRawItems } from '../src/database/repositories/rawItems';
import { promoteRawItems } from '../src/pipeline/promoteRawItems';

async function main() {
  const db = new PGlite();
  const query = async (sql: string, params?: unknown[]) => {
    const result = await db.query(sql, params);
    return { ...result, rowCount: result.affectedRows };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  const migrations = join(process.cwd(), 'src/database/migrations');
  for (const name of readdirSync(migrations).filter((name) => name.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(migrations, name), 'utf8'));
  }
  const feed = await new Parser().parseString(readFileSync('tests/collectors/certfr-fixtures/avis-feed-real.xml', 'utf8'));
  await saveRawItems(pool, await getSourceIdByName(pool, 'certfr'), feed.items.map(normalizeEntry));
  const gdeltItems = readFileSync('tests/collectors/gdelt-fixtures/gkg-sample-real.csv', 'utf8')
    .split('\n').map((line) => normalizeGkgLine(line.trim())).filter((item) => item !== null);
  await saveRawItems(pool, await getSourceIdByName(pool, 'gdelt'), gdeltItems);
  await promoteRawItems(pool);
  // Option de vérification visuelle : copie exacte du rapport public, en mémoire uniquement.
  if (process.argv.includes('--public-report')) {
    const response = await fetch('https://cyberwatch-production-7503.up.railway.app/api/v1/situation-report');
    if (!response.ok) throw new Error(`Rapport public : HTTP ${response.status}`);
    const payload = await response.json() as { report: import('../src/database/repositories/situationReports').SituationReport | null };
    const report = payload.report;
    if (report) await db.query(`INSERT INTO situation_reports
      (summary, sections, event_count, window_start, window_end, model, generated_at, qualified_inputs, key_points)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'[]'::jsonb)`, [report.summary, JSON.stringify(report.sections), report.eventCount,
      report.windowStart, report.windowEnd, report.model, report.generatedAt, report.qualifiedInputs ?? false]);
  }
  const app = buildApp(pool);
  await app.listen({ host: '127.0.0.1', port: 3100 });
  console.log('Aperçu local : captures historiques en mémoire.' + (process.argv.includes('--public-report') ? ' Rapport public copié en lecture seule.' : ' Aucun appel à la production.'));
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => { void app.close().then(() => db.close()).then(() => process.exit(0)); });
  }
}
void main().catch((error) => { console.error(error); process.exit(1); });
