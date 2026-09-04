import type { Pool } from 'pg';
import { decodeCursor, encodeCursor, type Cursor } from '../../lib/pagination/cursor';

interface CyberEventRow {
  id: string;
  title: string;
  summary: string;
  description: string | null;
  category: string;
  severity: string;
  confidence: string;
  published_at: Date | null;
  first_seen_at: Date;
  last_seen_at: Date;
  created_at: Date;
  updated_at: Date;
  countries: string[];
  organizations: string[];
  sectors: string[];
  cves: string[];
  threat_actors: string[];
  mitre_techniques: string[];
  tags: string[];
  ai_generated: boolean;
}

export interface CyberEvent {
  id: string;
  title: string;
  summary: string;
  description: string | null;
  category: string;
  severity: string;
  confidence: string;
  publishedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  countries: string[];
  organizations: string[];
  sectors: string[];
  cves: string[];
  threatActors: string[];
  mitreTechniques: string[];
  tags: string[];
  aiGenerated: boolean;
}

function toApiEvent(row: CyberEventRow): CyberEvent {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    description: row.description,
    category: row.category,
    severity: row.severity,
    confidence: row.confidence,
    publishedAt: row.published_at ? row.published_at.toISOString() : null,
    firstSeenAt: row.first_seen_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    countries: row.countries,
    organizations: row.organizations,
    sectors: row.sectors,
    cves: row.cves,
    threatActors: row.threat_actors,
    mitreTechniques: row.mitre_techniques,
    tags: row.tags,
    aiGenerated: row.ai_generated,
  };
}

export interface ListEventsOptions {
  limit: number;
  cursor?: Cursor;
  category?: string;
  severity?: string;
}

export interface Page {
  items: CyberEvent[];
  nextCursor: string | null;
}

/**
 * Liste "catalogue" : les evenements les plus recents (published_at, a
 * defaut created_at) en premier, avec filtres optionnels. Pagination par
 * curseur (cf. lib/pagination/cursor) plutot que par offset, pour rester
 * coherent avec /sync et eviter les artefacts d'OFFSET sur une table qui
 * continue de recevoir des insertions pendant la pagination.
 */
export async function listEvents(pool: Pool, options: ListEventsOptions): Promise<Page> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.category) {
    params.push(options.category);
    conditions.push(`category = $${params.length}`);
  }
  if (options.severity) {
    params.push(options.severity);
    conditions.push(`severity = $${params.length}`);
  }
  if (options.cursor) {
    params.push(options.cursor.sortValue, options.cursor.id);
    conditions.push(
      `(COALESCE(published_at, created_at), id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`,
    );
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(options.limit);

  const { rows } = await pool.query<CyberEventRow>(
    `SELECT * FROM cyber_events
     ${where}
     ORDER BY COALESCE(published_at, created_at) DESC, id DESC
     LIMIT $${params.length}`,
    params,
  );

  const items = rows.map(toApiEvent);
  const last = rows.at(-1);
  const nextCursor =
    rows.length === options.limit && last
      ? encodeCursor({ sortValue: (last.published_at ?? last.created_at).toISOString(), id: last.id })
      : null;

  return { items, nextCursor };
}

export async function getEventById(pool: Pool, id: string): Promise<CyberEvent | null> {
  const { rows } = await pool.query<CyberEventRow>('SELECT * FROM cyber_events WHERE id = $1', [id]);
  const row = rows[0];
  return row ? toApiEvent(row) : null;
}

export interface SyncEventsOptions {
  limit: number;
  cursor?: Cursor;
}

/**
 * Flux incremental : tout ce qui a change (cree OU modifie) depuis le
 * dernier curseur connu, trie par updated_at croissant. C'est ce qui
 * permet a un futur consommateur de ne jamais retelecharger tout le
 * catalogue -- cf. §08 du document d'architecture.
 */
export async function syncEvents(pool: Pool, options: SyncEventsOptions): Promise<Page> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.cursor) {
    params.push(options.cursor.sortValue, options.cursor.id);
    conditions.push(`(updated_at, id) > ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(options.limit);

  const { rows } = await pool.query<CyberEventRow>(
    `SELECT * FROM cyber_events
     ${where}
     ORDER BY updated_at ASC, id ASC
     LIMIT $${params.length}`,
    params,
  );

  const items = rows.map(toApiEvent);
  const last = rows.at(-1);
  const nextCursor =
    rows.length === options.limit && last
      ? encodeCursor({ sortValue: last.updated_at.toISOString(), id: last.id })
      : null;

  return { items, nextCursor };
}

export { decodeCursor };
