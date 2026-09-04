-- Un item brut collecte (avant ou apres fusion dans un cyber_event).
-- Plusieurs raw_items peuvent pointer vers le meme cyber_event : c'est ce qui
-- garde la tracabilite "quelles sources parlent de cet evenement".
CREATE TABLE IF NOT EXISTS raw_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id        uuid NOT NULL REFERENCES sources(id),
  external_id      text,
  url              text NOT NULL,
  title            text NOT NULL,
  published_at     timestamptz,
  collected_at     timestamptz NOT NULL DEFAULT now(),
  content_excerpt  text,
  content_hash     text NOT NULL,
  cyber_event_id   uuid REFERENCES cyber_events(id),
  UNIQUE (source_id, url)
);

CREATE INDEX IF NOT EXISTS idx_raw_items_cyber_event_id ON raw_items (cyber_event_id);
CREATE INDEX IF NOT EXISTS idx_raw_items_content_hash ON raw_items (content_hash);
