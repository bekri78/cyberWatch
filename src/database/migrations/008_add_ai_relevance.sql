-- Phase 5 : filtrage IA (DeepSeek) des evenements bruyants.
--
-- Faux positifs confirmes en production le 2026-09-05 sur /api/v1/events
-- (?category=attack) : "Tata-owned JLR to cut 4,000 jobs", "Iranian Media
-- Report Tanker Hit Near Key Oil Hub", "Raiffeisen Bank International AG
-- Raises Stock Position...", "China's global diplomatic coercion..." --
-- tous tagges 'attack' par le filtre thematique deterministe de gdelt
-- (CYBER_ATTACK/WB_2457_CYBER_CRIME, cf. gdelt/normalize.ts) mais sans
-- rapport avec un incident cyber reel. Le GKG de GDELT n'a aucun signal
-- structure permettant de trancher ca deterministement (cf. commentaire
-- classifyEvent.ts) -- une vraie relecture du texte est necessaire.
--
-- is_relevant=true par defaut : les evenements deja promus par les sources
-- institutionnelles (certfr/cisa_kev/microsoft_msrc -- aucun faux positif de
-- ce type jamais observe dessus) restent visibles sans relecture IA. Seul
-- gdelt est reevalue (cf. src/pipeline/reviewGdeltEvents.ts) ; is_relevant
-- passe a false si DeepSeek juge le texte non pertinent, ce qui le retire du
-- catalogue public (/events, /sync, /events/:id) sans supprimer la ligne --
-- la tracabilite est conservee pour audit.
ALTER TABLE cyber_events ADD COLUMN IF NOT EXISTS is_relevant boolean NOT NULL DEFAULT true;

-- Accelere la requete "evenements gdelt pas encore relus par l'IA" (cf.
-- reviewGdeltEvents.ts) -- index partiel car ai_generated=false ne concerne
-- qu'une fraction decroissante de la table au fil du temps (chaque
-- evenement gdelt finit par etre relu une seule fois).
CREATE INDEX IF NOT EXISTS idx_cyber_events_pending_ai_review ON cyber_events (created_at) WHERE ai_generated = false;
