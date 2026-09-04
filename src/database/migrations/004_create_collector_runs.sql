-- Etat des collectes : un enregistrement par passage d'un collecteur.
-- Sert a surveiller la sante du pipeline (cf. cahier des charges, section 28).
CREATE TABLE IF NOT EXISTS collector_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id        uuid NOT NULL REFERENCES sources(id),
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  status           text NOT NULL,
  items_collected  integer NOT NULL DEFAULT 0,
  items_new        integer NOT NULL DEFAULT 0,
  items_duplicate  integer NOT NULL DEFAULT 0,
  ai_calls         integer NOT NULL DEFAULT 0,
  error_message    text
);

CREATE INDEX IF NOT EXISTS idx_collector_runs_source_id ON collector_runs (source_id);
