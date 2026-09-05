-- 4eme source de veille : GDELT 2.0/2.1 GKG (Global Knowledge Graph),
-- filtre deterministe sur les themes CYBER_ATTACK / WB_2457_CYBER_CRIME
-- (cf. src/collectors/gdelt). Structure verifiee sur un vrai fichier
-- telecharge par l'utilisateur le 2026-09-05.
--
-- trust_level 2 (plus bas que toutes les autres sources) : contrairement a
-- CERT-FR/CISA/MSRC (bulletins officiels dedies), GDELT est un agregateur
-- automatise mondial dont le bruit est documente (co-occurrence de themes
-- sans lien reel, duplication par sites clones, source_type 'csv' -- cf.
-- §37-§41 de la discussion). La confiance reelle de chaque evenement
-- dependra de la relecture IA (Phase 5), pas encore branchee sur cette
-- source.
INSERT INTO sources (name, source_type, base_url, trust_level) VALUES
  ('gdelt', 'csv', 'http://data.gdeltproject.org/gdeltv2', 2)
ON CONFLICT (name) DO NOTHING;
