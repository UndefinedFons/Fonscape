PRAGMA defer_foreign_keys = ON;

-- Content collections are repository-defined. Remove the original three-type
-- database enum so adding a future collection does not require another table
-- redesign. Abort rather than cascade if an unknown extension table points at
-- comments.
CREATE TABLE comment_rebuild_foreign_key_guard (
  invalid_reference INTEGER NOT NULL CHECK (invalid_reference = 0)
);

WITH normalized_schema AS (
  SELECT name,
    replace(replace(replace(replace(replace(replace(
      lower(replace(replace(replace(sql, char(9), ''), char(10), ''), char(13), '')),
      ' ', ''), char(34), ''), char(39), ''), char(96), ''), char(91), ''), char(93), '') AS sql
  FROM sqlite_schema
  WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
)
INSERT INTO comment_rebuild_foreign_key_guard (invalid_reference)
SELECT COUNT(*)
FROM normalized_schema
WHERE name COLLATE NOCASE != 'comments'
  AND instr(sql, 'referencescomments') > 0;

DROP TABLE comment_rebuild_foreign_key_guard;

CREATE TABLE comments_next_0021 (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  content_slug TEXT NOT NULL,
  parent_id TEXT REFERENCES comments_next_0021(id) ON DELETE SET NULL,
  reply_to_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden', 'deleted')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  edited_at INTEGER,
  moderated_at INTEGER,
  moderated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reply_to_comment_id TEXT REFERENCES comments_next_0021(id) ON DELETE SET NULL
);

INSERT INTO comments_next_0021 SELECT * FROM comments;
DROP TABLE comments;
ALTER TABLE comments_next_0021 RENAME TO comments;

CREATE INDEX comments_target_idx ON comments(content_type, content_slug, status, created_at);
CREATE INDEX comments_parent_idx ON comments(parent_id, created_at);
CREATE INDEX comments_user_idx ON comments(user_id, created_at DESC);
CREATE INDEX comments_reply_notification_idx ON comments(reply_to_user_id, created_at DESC);
CREATE INDEX comments_reply_target_idx ON comments(reply_to_comment_id, created_at DESC);
CREATE INDEX comments_admin_notification_idx ON comments(status, created_at DESC);

CREATE TABLE content_metrics_next_0021 (
  content_type TEXT NOT NULL,
  content_slug TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (content_type, content_slug)
);

INSERT INTO content_metrics_next_0021 SELECT * FROM content_metrics;
DROP TABLE content_metrics;
ALTER TABLE content_metrics_next_0021 RENAME TO content_metrics;
CREATE INDEX content_metrics_views_idx ON content_metrics(content_type, views DESC);

-- Keep active-comment counts in small aggregate rows. Content types are not
-- enumerated here so future repository collections inherit the same model.
CREATE TABLE IF NOT EXISTS comment_target_usage (
  content_type TEXT NOT NULL,
  content_slug TEXT NOT NULL,
  active_comments INTEGER NOT NULL DEFAULT 0 CHECK (active_comments >= 0),
  published_comments INTEGER NOT NULL DEFAULT 0 CHECK (published_comments >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (content_type, content_slug)
);

CREATE INDEX IF NOT EXISTS comment_target_usage_updated_idx
  ON comment_target_usage(updated_at DESC);

UPDATE account_usage
SET comments_created = (
  SELECT COUNT(*) FROM comments
  WHERE comments.user_id = account_usage.user_id
    AND comments.status != 'deleted'
), updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000;

INSERT INTO account_usage (user_id, comments_created, updated_at)
SELECT users.id, COUNT(comments.id), CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM users
LEFT JOIN comments
  ON comments.user_id = users.id AND comments.status != 'deleted'
GROUP BY users.id
ON CONFLICT(user_id) DO UPDATE SET
  comments_created = excluded.comments_created,
  updated_at = excluded.updated_at;

INSERT INTO storage_counters (metric, value, updated_at)
VALUES (
  'comments_created',
  (SELECT COUNT(*) FROM comments WHERE status != 'deleted'),
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
)
ON CONFLICT(metric) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;

DELETE FROM comment_target_usage;

INSERT INTO comment_target_usage
  (content_type, content_slug, active_comments, published_comments, updated_at)
SELECT content_type, content_slug,
  SUM(CASE WHEN status != 'deleted' THEN 1 ELSE 0 END),
  SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END),
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM comments
GROUP BY content_type, content_slug;

-- This timestamp was written only at session creation and never read.
ALTER TABLE sessions DROP COLUMN last_seen_at;

CREATE INDEX IF NOT EXISTS comments_duplicate_idx
  ON comments(user_id, content_type, content_slug, created_at DESC);

CREATE TRIGGER IF NOT EXISTS comments_usage_after_insert
AFTER INSERT ON comments
WHEN NEW.status != 'deleted'
BEGIN
  INSERT INTO storage_counters (metric, value, updated_at)
  VALUES ('comments_created', 1, NEW.updated_at)
  ON CONFLICT(metric) DO UPDATE SET
    value = storage_counters.value + 1,
    updated_at = excluded.updated_at;

  INSERT INTO account_usage (user_id, comments_created, updated_at)
  VALUES (NEW.user_id, 1, NEW.updated_at)
  ON CONFLICT(user_id) DO UPDATE SET
    comments_created = account_usage.comments_created + 1,
    updated_at = excluded.updated_at;

  INSERT INTO comment_target_usage
    (content_type, content_slug, active_comments, published_comments, updated_at)
  VALUES (
    NEW.content_type,
    NEW.content_slug,
    CASE WHEN NEW.status != 'deleted' THEN 1 ELSE 0 END,
    CASE WHEN NEW.status = 'published' THEN 1 ELSE 0 END,
    NEW.updated_at
  )
  ON CONFLICT(content_type, content_slug) DO UPDATE SET
    active_comments = comment_target_usage.active_comments + excluded.active_comments,
    published_comments = comment_target_usage.published_comments + excluded.published_comments,
    updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS comments_usage_after_status_change
AFTER UPDATE OF status ON comments
WHEN OLD.status != NEW.status
BEGIN
  UPDATE storage_counters
  SET value = MAX(0, value
        + CASE WHEN NEW.status != 'deleted' THEN 1 ELSE 0 END
        - CASE WHEN OLD.status != 'deleted' THEN 1 ELSE 0 END),
      updated_at = NEW.updated_at
  WHERE metric = 'comments_created';

  INSERT INTO account_usage (user_id, comments_created, updated_at)
  VALUES (
    NEW.user_id,
    CASE WHEN NEW.status != 'deleted' THEN 1 ELSE 0 END,
    NEW.updated_at
  )
  ON CONFLICT(user_id) DO UPDATE SET
    comments_created = MAX(0, account_usage.comments_created
      + CASE WHEN NEW.status != 'deleted' THEN 1 ELSE 0 END
      - CASE WHEN OLD.status != 'deleted' THEN 1 ELSE 0 END),
    updated_at = excluded.updated_at;

  INSERT INTO comment_target_usage
    (content_type, content_slug, active_comments, published_comments, updated_at)
  VALUES (
    NEW.content_type,
    NEW.content_slug,
    CASE WHEN NEW.status != 'deleted' THEN 1 ELSE 0 END,
    CASE WHEN NEW.status = 'published' THEN 1 ELSE 0 END,
    NEW.updated_at
  )
  ON CONFLICT(content_type, content_slug) DO UPDATE SET
    active_comments = MAX(0, comment_target_usage.active_comments
      + CASE WHEN NEW.status != 'deleted' THEN 1 ELSE 0 END
      - CASE WHEN OLD.status != 'deleted' THEN 1 ELSE 0 END),
    published_comments = MAX(0, comment_target_usage.published_comments
      + CASE WHEN NEW.status = 'published' THEN 1 ELSE 0 END
      - CASE WHEN OLD.status = 'published' THEN 1 ELSE 0 END),
    updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS comments_usage_after_delete
AFTER DELETE ON comments
WHEN OLD.status != 'deleted'
BEGIN
  UPDATE storage_counters
  SET value = MAX(0, value - 1),
      updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
  WHERE metric = 'comments_created';

  UPDATE account_usage
  SET comments_created = MAX(0, comments_created - 1),
      updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
  WHERE user_id = OLD.user_id;

  UPDATE comment_target_usage
  SET active_comments = MAX(0, active_comments - CASE WHEN OLD.status != 'deleted' THEN 1 ELSE 0 END),
      published_comments = MAX(0, published_comments - CASE WHEN OLD.status = 'published' THEN 1 ELSE 0 END),
      updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
  WHERE content_type = OLD.content_type AND content_slug = OLD.content_slug;
END;

PRAGMA foreign_keys = ON;
