-- Persistent budget, including failed attempts and process restarts.
CREATE TABLE situation_report_budget (
  id integer PRIMARY KEY CHECK (id = 1),
  budget_day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  attempts integer NOT NULL DEFAULT 0,
  next_allowed_at timestamptz NOT NULL DEFAULT '-infinity',
  last_hash text,
  usage jsonb NOT NULL DEFAULT '{}'::jsonb
);
INSERT INTO situation_report_budget(id) VALUES (1);

-- Usage returned by the provider, even if the generated JSON is rejected.
CREATE TABLE situation_report_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  model text NOT NULL,
  usage jsonb NOT NULL
);
