CREATE TABLE IF NOT EXISTS article_metrics (
  slug TEXT PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS article_metrics_views_idx ON article_metrics(views DESC);
