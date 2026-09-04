-- Les 5 sources retenues (MITRE ATT&CK n'en fait pas partie : c'est un
-- referentiel d'enrichissement, pas une source de contenu -- cf. document
-- d'architecture, section 01, point 03).
INSERT INTO sources (name, source_type, base_url, trust_level) VALUES
  ('certfr',           'rss',  'https://www.cert.ssi.gouv.fr',                              5),
  ('cisa_kev',         'json', 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog', 5),
  ('microsoft_msrc',   'api',  'https://api.msrc.microsoft.com',                            4),
  ('bleepingcomputer', 'rss',  'https://www.bleepingcomputer.com',                          3),
  ('hackernews',       'rss',  'https://thehackernews.com',                                 3)
ON CONFLICT (name) DO NOTHING;
