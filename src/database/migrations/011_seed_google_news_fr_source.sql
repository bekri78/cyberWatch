-- 6eme source de veille : Google Actualites (Google News), recherche par
-- mots-cles en francais (hl=fr&gl=FR&ceid=FR:fr), cf. src/collectors/googleNewsFr.
--
-- Motivation (cf. echange utilisateur du 2026-09-05) : GDELT (source
-- 'gdelt') ne filtre les articles cyber que via des themes GKG
-- (CYBER_ATTACK / WB_2457_CYBER_CRIME) dont la detection est
-- documentee comme fortement biaisee vers la presse anglophone -- de
-- vraies fuites de donnees francaises largement couvertes par la presse
-- francophone (Le Monde, Le Figaro, France Info, etc.) n'obtiennent pas
-- systematiquement ces tags et restent donc invisibles du systeme, alors
-- meme que GDELT indexe bien des sources en francais. Une recherche
-- Google Actualites par mots-cles cyber en francais contourne ce biais de
-- tagging en ciblant directement le texte des titres.
--
-- trust_level 2 (identique a gdelt) : meme raisonnement -- agregateur
-- automatise dont la pertinence de chaque resultat (recherche par
-- mots-cles, donc necessairement plus large qu'un flux institutionnel
-- dedie) est laissee a la relecture IA (Phase 5, cf. migration suivante
-- qui etend reviewGdeltEvents.ts a cette source).
INSERT INTO sources (name, source_type, base_url, trust_level) VALUES
  ('google_news_fr', 'rss', 'https://news.google.com', 2)
ON CONFLICT (name) DO NOTHING;
