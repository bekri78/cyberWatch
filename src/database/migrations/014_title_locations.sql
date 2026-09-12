ALTER TABLE cyber_events ADD COLUMN locations jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE cyber_events ADD COLUMN location_checked_at timestamptz;
ALTER TABLE cyber_events ADD COLUMN location_attempted_at timestamptz;
ALTER TABLE cyber_events ADD COLUMN location_attempts integer NOT NULL DEFAULT 0;
CREATE INDEX cyber_events_location_pending_idx ON cyber_events(created_at)
  WHERE location_checked_at IS NULL AND location_attempts < 3;
