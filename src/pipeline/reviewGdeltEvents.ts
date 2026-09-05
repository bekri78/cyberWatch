import type { Pool } from 'pg';
import { reviewEventWithDeepseek, type ReviewTier } from '../lib/ai/deepseekClient';

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

// Sources dont le filtre d'entree est un filtre de recall (theme GDELT
// large, ou recherche par mots-cles Google Actualites) plutot qu'un flux
// institutionnel dedie -- toutes deux produisent un taux de faux positifs
// documente (cf. migration 008 pour gdelt -- articles boursiers/
// geopolitiques/RH tagges 'attack' a tort ; google_news_fr par construction,
// une recherche par mots-cles remonte aussi des tribunes/annonces produit/
// conferences sans rapport avec un incident reel, cf. migration 011).
// CERT-FR/CISA KEV/MSRC restent hors scope : flux institutionnels dedies a
// la cybersecurite, aucun faux positif de ce type n'y a jamais ete
// observe -- cette restriction est une decision de perimetre, pas une
// limitation technique (le meme pipeline fonctionnerait sur n'importe
// quelle source).
const REVIEWED_SOURCES = ['gdelt', 'google_news_fr'] as const;

/**
 * Phase 5 (+ Phase 8, scoring multi-criteres, cf. migration 012) :
 * relecture IA (DeepSeek) des evenements promus depuis les sources a fort
 * taux de faux positifs (cf. REVIEWED_SOURCES ci-dessus).
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
     WHERE s.name = ANY($2::text[]) AND ce.ai_generated = false
     ORDER BY ce.created_at ASC
     LIMIT $1`,
    [BATCH_SIZE, REVIEWED_SOURCES],
  );

  let reviewed = 0;
  let markedIrrelevant = 0;
  let failed = 0;
  // Repartition par palier (cf. computeReviewTier) -- uniquement pour le
  // log de fin de passage, la Phase 8 n'a pas change la forme de
  // ReviewResult retournee (is_relevant reste la seule decision binaire
  // exposee a l'appelant/l'API, cf. migration 012).
  const tierCounts: Record<ReviewTier, number> = { rejete: 0, conserve: 0, veille: 0, prioritaire: 0 };

  for (const row of rows) {
    try {
      const review = await reviewEventWithDeepseek(
        { title: row.title, excerpt: row.description ?? row.summary },
        apiKey,
      );

      await pool.query(
        `UPDATE cyber_events
         SET ai_generated = true, is_relevant = $1, severity = $2, confidence = $3,
             score_pertinence_cyber = $4, score_impact = $5, score_interet_strategique = $6,
             score_fiabilite_source = $7, score_nouveaute = $8, score_total = $9, review_tier = $10,
             updated_at = now()
         WHERE id = $11`,
        [
          review.isRelevant,
          review.severity,
          review.confidence,
          review.scores.pertinenceCyber,
          review.scores.impact,
          review.scores.interetStrategique,
          review.scores.fiabiliteSource,
          review.scores.nouveaute,
          review.scoreTotal,
          review.tier,
          row.id,
        ],
      );

      reviewed++;
      tierCounts[review.tier]++;
      if (!review.isRelevant) markedIrrelevant++;
    } catch (err) {
      failed++;
      log.error({ eventId: row.id, err }, 'Relecture IA DeepSeek echouee pour cet evenement, retentee au prochain passage');
    }
  }

  if (reviewed > 0 || failed > 0) {
    log.info({ reviewed, markedIrrelevant, failed, tierCounts }, 'Relecture IA (Phase 5/8) terminee pour ce passage');
  }

  return { reviewed, markedIrrelevant, failed };
}
