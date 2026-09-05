import type { Pool } from 'pg';
import { reviewEventWithDeepseek } from '../lib/ai/deepseekClient';

interface Logger {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

interface PendingEventRow {
  id: string;
  title: string;
  summary: string;
  description: string | null;
}

export interface ReviewResult {
  reviewed: number;
  markedIrrelevant: number;
  failed: number;
}

// Nombre d'evenements relus par passage : borne le cout/latence d'un
// passage planifie (cf. aiReviewScheduler.ts, toutes les 15 min) plutot
// que de vider tout le backlog d'un coup a chaque tick.
const BATCH_SIZE = 25;

/**
 * Phase 5 : relecture IA (DeepSeek) des evenements promus depuis gdelt.
 *
 * Restreint volontairement a gdelt : c'est la seule source dont le filtre
 * thematique produit un taux de faux positifs confirme en production (cf.
 * migration 008 -- articles boursiers/geopolitiques/RH tagges 'attack' a
 * tort). CERT-FR/CISA KEV/MSRC sont des flux institutionnels dedies a la
 * cybersecurite : aucun faux positif de ce type n'y a jamais ete observe,
 * donc pas de cout IA inutile dessus pour l'instant -- cette restriction
 * est une decision de perimetre, pas une limitation technique (le meme
 * pipeline fonctionnerait sur n'importe quelle source).
 *
 * Ne fait jamais planter l'appelant : un evenement dont l'appel DeepSeek
 * echoue (timeout, quota, reponse malformee) est simplement laisse
 * ai_generated=false et sera retente au prochain passage planifie -- meme
 * philosophie de resilience que runCollector.ts (cf. §31).
 */
export async function reviewGdeltEvents(pool: Pool, apiKey: string, log: Logger): Promise<ReviewResult> {
  const { rows } = await pool.query<PendingEventRow>(
    `SELECT ce.id, ce.title, ce.summary, ce.description
     FROM cyber_events ce
     JOIN raw_items ri ON ri.cyber_event_id = ce.id
     JOIN sources s ON s.id = ri.source_id
     WHERE s.name = 'gdelt' AND ce.ai_generated = false
     ORDER BY ce.created_at ASC
     LIMIT $1`,
    [BATCH_SIZE],
  );

  let reviewed = 0;
  let markedIrrelevant = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const review = await reviewEventWithDeepseek(
        { title: row.title, excerpt: row.description ?? row.summary },
        apiKey,
      );

      await pool.query(
        `UPDATE cyber_events
         SET ai_generated = true, is_relevant = $1, severity = $2, confidence = $3, updated_at = now()
         WHERE id = $4`,
        [review.isRelevant, review.severity, review.confidence, row.id],
      );

      reviewed++;
      if (!review.isRelevant) markedIrrelevant++;
    } catch (err) {
      failed++;
      log.error({ eventId: row.id, err }, 'Relecture IA DeepSeek echouee pour cet evenement, retentee au prochain passage');
    }
  }

  if (reviewed > 0 || failed > 0) {
    log.info({ reviewed, markedIrrelevant, failed }, 'Relecture IA (Phase 5) terminee pour ce passage');
  }

  return { reviewed, markedIrrelevant, failed };
}
