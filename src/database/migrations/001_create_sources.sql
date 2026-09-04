-- Les sources OSINT connues de CyberWatch (CERT-FR, CISA KEV, ...).
CREATE TABLE IF NOT EXISTS sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,
  source_type   text NOT NULL,
  base_url      text NOT NULL,
  trust_level   smallint NOT NULL DEFAULT 3,
  created_at    timestamptz NOT NULL DEFAULT now()
);
