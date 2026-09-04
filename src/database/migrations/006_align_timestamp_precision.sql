-- Bug reel decouvert en verifiant /sync avec de vraies donnees (cf. Phase 4) :
-- Postgres stocke les timestamptz a la microseconde pres, mais le curseur
-- passe par un JS Date (precision milliseconde, cf. toISOString()). En
-- reconstruisant le timestamp depuis le curseur, on perdait les
-- microsecondes -- ce qui faisait parfois "> cursor" rester vrai pour la
-- ligne meme deja renvoyee (ex: stocke ...995234, cursor ...995000 ->
-- 995234 > 995000), donc doublon en page suivante.
--
-- Fix : aligner la precision des colonnes sur celle de JS (milliseconde),
-- pour que le round-trip DB -> JS Date -> ISO string -> DB soit exact et
-- sans perte, quelle que soit la donnee (existante ou future).
ALTER TABLE cyber_events
  ALTER COLUMN published_at TYPE timestamptz(3),
  ALTER COLUMN first_seen_at TYPE timestamptz(3),
  ALTER COLUMN last_seen_at TYPE timestamptz(3),
  ALTER COLUMN created_at TYPE timestamptz(3),
  ALTER COLUMN updated_at TYPE timestamptz(3);
