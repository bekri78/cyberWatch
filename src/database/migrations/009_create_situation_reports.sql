-- Phase 6 : compte rendu de situation redige par IA (DeepSeek), a partir
-- des evenements REELS deja collectes et filtres (is_relevant=true, cf.
-- pipeline/generateSituationReport.ts). Le texte n'est jamais fabrique a
-- partir de rien : window_start/window_end/event_count refletent
-- exactement les evenements reellement utilises pour cette generation.
--
-- Historique conserve (pas d'UPDATE en place) : chaque generation ajoute
-- une ligne, /api/v1/situation-report ne renvoie que la plus recente
-- (ORDER BY generated_at DESC LIMIT 1) -- l'historique reste disponible
-- pour audit sans complexifier la lecture publique.
CREATE TABLE IF NOT EXISTS situation_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  summary       text NOT NULL,
  key_points    jsonb NOT NULL,
  event_count   integer NOT NULL,
  window_start  timestamptz NOT NULL,
  window_end    timestamptz NOT NULL,
  model         text NOT NULL,
  generated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_situation_reports_generated_at ON situation_reports (generated_at DESC);
