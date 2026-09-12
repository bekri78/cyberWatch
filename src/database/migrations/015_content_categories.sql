ALTER TABLE cyber_events ADD COLUMN category_checked_at timestamptz;
ALTER TABLE cyber_events ADD COLUMN category_attempted_at timestamptz;
ALTER TABLE cyber_events ADD COLUMN category_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE cyber_events ADD COLUMN category_reasoning text;

-- Remove the old source-based attack default while awaiting content review.
UPDATE cyber_events SET category = 'other', tags = array_append(array_remove(tags, 'attack'), 'other'), updated_at = now()
WHERE category = 'attack' AND tags && ARRAY['gdelt','google_news_fr']::text[];
