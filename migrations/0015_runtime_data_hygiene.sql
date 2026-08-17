PRAGMA foreign_keys = ON;

-- Avatars have lived exclusively in user_avatars since migration 0008. Clear
-- the retired columns so an account does not retain a second legacy BLOB.
UPDATE users
SET avatar = NULL, avatar_mime = NULL, avatar_updated_at = NULL
WHERE avatar IS NOT NULL OR avatar_mime IS NOT NULL OR avatar_updated_at IS NOT NULL;

-- Keep comment relationships and moderation history while making deletion of
-- the authored text irreversible in the active database.
UPDATE comments
SET body = '[已删除]'
WHERE status = 'deleted' AND body != '[已删除]';

-- Capacity counters represent currently stored, non-deleted comments. Rebuild
-- them once so installations upgraded from earlier releases start consistent.
UPDATE account_usage
SET comments_created = (
  SELECT COUNT(*)
  FROM comments
  WHERE comments.user_id = account_usage.user_id
    AND comments.status != 'deleted'
),
updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000;

INSERT INTO storage_counters (metric, value, updated_at)
VALUES
  ('member_accounts', (SELECT COUNT(*) FROM users WHERE role = 'member'), CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('comments_created', (SELECT COUNT(*) FROM comments WHERE status != 'deleted'), CAST(strftime('%s', 'now') AS INTEGER) * 1000)
ON CONFLICT(metric) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
