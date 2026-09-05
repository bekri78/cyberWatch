-- Phase 8 : scoring multi-criteres de la relecture IA (remplace la
-- decision binaire is_relevant seule, cf. echange utilisateur du
-- 2026-09-05 -- "nous devons faire les grosses refontes afin d'avoir une
-- application fiable").
--
-- 5 criteres notes 0 a 5 par DeepSeek (cf. src/lib/ai/deepseekClient.ts,
-- reviewEventWithDeepseek) : pertinence cyber, impact, interet
-- strategique, fiabilite de la source, nouveaute. score_total (0-25) et
-- review_tier en sont deduits deterministiquement cote serveur (jamais
-- calcules par le modele lui-meme, pour eviter toute incoherence entre
-- les scores et le palier annonce) :
--   total < 8   -> 'rejete'      (is_relevant=false, comportement inchange)
--   8-12        -> 'conserve'
--   13-17       -> 'veille'
--   18+         -> 'prioritaire'
--
-- Colonnes nullables : seuls les evenements des sources relues par l'IA
-- (gdelt, google_news_fr -- cf. reviewGdeltEvents.ts) sont notes. Les
-- sources institutionnelles (certfr/cisa_kev/microsoft_msrc) ne le sont
-- jamais -- NULL signifie "jamais evalue", pas "score de zero".
--
-- is_relevant (deja existant, migration 008) reste la seule colonne lue
-- par l'API publique/le catalogue -- ce changement est additif, aucune
-- migration necessaire cote route/frontend pour cette phase.
ALTER TABLE cyber_events
  ADD COLUMN IF NOT EXISTS score_pertinence_cyber smallint,
  ADD COLUMN IF NOT EXISTS score_impact smallint,
  ADD COLUMN IF NOT EXISTS score_interet_strategique smallint,
  ADD COLUMN IF NOT EXISTS score_fiabilite_source smallint,
  ADD COLUMN IF NOT EXISTS score_nouveaute smallint,
  ADD COLUMN IF NOT EXISTS score_total smallint,
  ADD COLUMN IF NOT EXISTS review_tier text,
  ADD CONSTRAINT cyber_events_scores_range CHECK (
    (score_pertinence_cyber IS NULL OR score_pertinence_cyber BETWEEN 0 AND 5) AND
    (score_impact IS NULL OR score_impact BETWEEN 0 AND 5) AND
    (score_interet_strategique IS NULL OR score_interet_strategique BETWEEN 0 AND 5) AND
    (score_fiabilite_source IS NULL OR score_fiabilite_source BETWEEN 0 AND 5) AND
    (score_nouveaute IS NULL OR score_nouveaute BETWEEN 0 AND 5) AND
    (score_total IS NULL OR score_total BETWEEN 0 AND 25)
  ),
  ADD CONSTRAINT cyber_events_review_tier_valid CHECK (
    review_tier IS NULL OR review_tier IN ('rejete', 'conserve', 'veille', 'prioritaire')
  );
