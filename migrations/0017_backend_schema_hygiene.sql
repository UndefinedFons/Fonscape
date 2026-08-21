PRAGMA defer_foreign_keys = ON;

-- Published content has always been sourced from Git. Abort instead of
-- discarding data if an installation ever wrote to the retired D1 table.
CREATE TABLE backend_hygiene_content_guard (
  entry_count INTEGER NOT NULL CHECK (entry_count = 0)
);

INSERT INTO backend_hygiene_content_guard (entry_count)
SELECT COUNT(*) FROM content_entries;

DROP TABLE backend_hygiene_content_guard;
DROP TABLE content_entries;

-- Migration 0009 copied article counters into the shared content table. Merge
-- once more so installations upgraded from an older runtime cannot lose a
-- higher counter, then remove the retired duplicate table.
INSERT INTO content_metrics (content_type, content_slug, views, updated_at)
SELECT 'post', slug, views, updated_at
FROM article_metrics
WHERE 1
ON CONFLICT(content_type, content_slug) DO UPDATE SET
  views = MAX(content_metrics.views, excluded.views),
  updated_at = MAX(content_metrics.updated_at, excluded.updated_at);

DROP TABLE article_metrics;

-- The API has stored at most 100 KiB per avatar since the limit was tightened.
-- Copying into the stricter table deliberately aborts the migration if a
-- third-party installation still has a larger legacy row; no avatar is
-- silently discarded.
CREATE TABLE user_avatars_next (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  image_data BLOB NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 102400),
  updated_at INTEGER NOT NULL
);

INSERT INTO user_avatars_next (user_id, image_data, mime_type, byte_size, updated_at)
SELECT user_id, image_data, mime_type, byte_size, updated_at
FROM user_avatars;

DROP TABLE user_avatars;
ALTER TABLE user_avatars_next RENAME TO user_avatars;
