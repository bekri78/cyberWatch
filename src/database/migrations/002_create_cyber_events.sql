-- La table centrale : un evenement cyber consolide.
CREATE TABLE IF NOT EXISTS cyber_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title              text NOT NULL,
  summary            text NOT NULL,
  description        text,
  category           text NOT NULL,
  severity           text NOT NULL,
  confidence         text NOT NULL,
  published_at       timestamptz,
  first_seen_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at       timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  countries          text[] NOT NULL DEFAULT '{}',
  organizations      text[] NOT NULL DEFAULT '{}',
  sectors            text[] NOT NULL DEFAULT '{}',
  cves               text[] NOT NULL DEFAULT '{}',
  threat_actors      text[] NOT NULL DEFAULT '{}',
  mitre_techniques   text[] NOT NULL DEFAULT '{}',
  tags               text[] NOT NULL DEFAULT '{}',
  ai_generated       boolean NOT NULL DEFAULT false
);

-- Pagination par curseur pour /sync (cf. document d'architecture, section 08).
CREATE INDEX IF NOT EXISTS idx_cyber_events_updated_at_id ON cyber_events (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_cyber_events_cves ON cyber_events USING gin (cves);
CREATE INDEX IF NOT EXISTS idx_cyber_events_tags ON cyber_events USING gin (tags);
