-- Le statut de traitement est distinct de la pertinence et de la sévérité.
ALTER TABLE cyber_events
  ADD COLUMN qualification_status text NOT NULL DEFAULT 'pending'
    CHECK (qualification_status IN ('pending', 'qualified', 'rejected', 'failed')),
  ADD COLUMN review_attempted_at timestamptz,
  ADD COLUMN review_reasoning text;

UPDATE cyber_events ce SET qualification_status = CASE
  WHEN NOT is_relevant THEN 'rejected'
  WHEN ai_generated THEN 'qualified'
  WHEN EXISTS (
    SELECT 1 FROM raw_items ri JOIN sources s ON s.id = ri.source_id
    WHERE ri.cyber_event_id = ce.id
      AND s.name IN ('certfr', 'cisa_kev', 'microsoft_msrc')
  ) THEN 'qualified'
  ELSE 'pending'
END, updated_at = now();

CREATE INDEX idx_cyber_events_qualification_date
  ON cyber_events (qualification_status, (COALESCE(published_at, created_at)), id);

-- Les rapports historiques n'ont pas été calculés avec le nouveau filtre.
ALTER TABLE situation_reports ADD COLUMN qualified_inputs boolean NOT NULL DEFAULT false;
