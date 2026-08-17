PRAGMA foreign_keys = OFF;

CREATE TABLE content_entries_next (
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

INSERT INTO content_entries_next SELECT id, type, slug, title, status, data, published_at, created_at, updated_at, author_id FROM content_entries;
DROP TABLE content_entries;
ALTER TABLE content_entries_next RENAME TO content_entries;
CREATE INDEX content_entries_status_idx ON content_entries(status, published_at DESC, updated_at DESC);

PRAGMA foreign_keys = ON;
