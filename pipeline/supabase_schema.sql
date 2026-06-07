-- Enable pgcrypto for digest() used in the generated column
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ai_news (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  title        TEXT        NOT NULL,
  category     TEXT        NOT NULL CHECK (category IN ('Modèle', 'Framework', 'Recherche')),
  summary      TEXT        NOT NULL,
  code_example TEXT        NOT NULL,
  source_url   TEXT        NOT NULL,
  content_hash TEXT        UNIQUE GENERATED ALWAYS AS (
                 encode(digest(title || '::' || source_url, 'sha256'), 'hex')
               ) STORED NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_news_created_at
  ON ai_news (created_at DESC);

ALTER TABLE ai_news ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read" ON ai_news
  FOR SELECT USING (true);
