CREATE TABLE IF NOT EXISTS content_entries (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'post' CHECK (type IN ('post', 'poem', 'music')),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  data TEXT NOT NULL,
  published_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS content_entries_status_idx ON content_entries(status, published_at DESC, updated_at DESC);
