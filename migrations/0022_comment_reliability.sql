-- Keep the idempotency claim, rate-limit charging, and comment insert in one
-- transaction so a lost-response retry cannot charge the same mutation twice.
ALTER TABLE rate_limits ADD COLUMN comment_mutation_token TEXT;

CREATE TABLE IF NOT EXISTS comment_mutations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL,
  claim_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS comment_mutations_updated_idx
  ON comment_mutations(updated_at DESC);

-- A published reply is visible only while its top-level parent is published.
-- Reconcile the existing aggregate before replacing the status triggers so a
-- deleted or hidden parent cannot leave an unreachable reply in the count.
UPDATE comment_target_usage
SET published_comments = (
  SELECT COUNT(*)
  FROM comments visible
  WHERE visible.content_type = comment_target_usage.content_type
    AND visible.content_slug = comment_target_usage.content_slug
    AND visible.status = 'published'
    AND (visible.parent_id IS NULL OR EXISTS (
      SELECT 1 FROM comments parent
      WHERE parent.id = visible.parent_id AND parent.status = 'published'
    ))
), updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000;

DROP TRIGGER IF EXISTS comments_usage_after_insert;
DROP TRIGGER IF EXISTS comments_usage_after_status_change;
DROP TRIGGER IF EXISTS comments_usage_after_delete;

CREATE TRIGGER comments_usage_after_insert
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
    1,
    CASE WHEN NEW.status = 'published' AND (NEW.parent_id IS NULL OR EXISTS (
      SELECT 1 FROM comments parent
      WHERE parent.id = NEW.parent_id AND parent.status = 'published'
    )) THEN 1 ELSE 0 END,
    NEW.updated_at
  )
  ON CONFLICT(content_type, content_slug) DO UPDATE SET
    active_comments = comment_target_usage.active_comments + excluded.active_comments,
    published_comments = comment_target_usage.published_comments + excluded.published_comments,
    updated_at = excluded.updated_at;
END;

CREATE TRIGGER comments_usage_after_status_change
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
    CASE WHEN NEW.status = 'published' AND (NEW.parent_id IS NULL OR EXISTS (
      SELECT 1 FROM comments parent
      WHERE parent.id = NEW.parent_id AND parent.status = 'published'
    )) THEN 1 ELSE 0 END,
    NEW.updated_at
  )
  ON CONFLICT(content_type, content_slug) DO UPDATE SET
    active_comments = MAX(0, comment_target_usage.active_comments
      + CASE WHEN NEW.status != 'deleted' THEN 1 ELSE 0 END
      - CASE WHEN OLD.status != 'deleted' THEN 1 ELSE 0 END),
    published_comments = (
      SELECT COUNT(*) FROM comments visible
      WHERE visible.content_type = NEW.content_type
        AND visible.content_slug = NEW.content_slug
        AND visible.status = 'published'
        AND (visible.parent_id IS NULL OR EXISTS (
          SELECT 1 FROM comments parent
          WHERE parent.id = visible.parent_id AND parent.status = 'published'
        ))
    ),
    updated_at = excluded.updated_at;
END;

CREATE TRIGGER comments_usage_after_delete
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
  SET active_comments = MAX(0, active_comments - 1),
      published_comments = (
        SELECT COUNT(*) FROM comments visible
        WHERE visible.content_type = OLD.content_type
          AND visible.content_slug = OLD.content_slug
          AND visible.status = 'published'
          AND (visible.parent_id IS NULL OR EXISTS (
            SELECT 1 FROM comments parent
            WHERE parent.id = visible.parent_id AND parent.status = 'published'
          ))
      ),
      updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
  WHERE content_type = OLD.content_type AND content_slug = OLD.content_slug;
END;
