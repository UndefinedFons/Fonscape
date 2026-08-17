CREATE TABLE IF NOT EXISTS content_metrics (
  content_type TEXT NOT NULL CHECK (content_type IN ('post', 'poem', 'music')),
  content_slug TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (content_type, content_slug)
);

CREATE INDEX IF NOT EXISTS content_metrics_views_idx
  ON content_metrics(content_type, views DESC);

INSERT OR IGNORE INTO content_metrics (content_type, content_slug, views, updated_at)
SELECT 'post', slug, views, updated_at
FROM article_metrics;
