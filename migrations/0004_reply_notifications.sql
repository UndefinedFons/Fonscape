ALTER TABLE users ADD COLUMN notifications_seen_at INTEGER;
ALTER TABLE users ADD COLUMN admin_comments_seen_at INTEGER;

UPDATE users SET notifications_seen_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE notifications_seen_at IS NULL;
UPDATE users SET admin_comments_seen_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE admin_comments_seen_at IS NULL;

CREATE INDEX IF NOT EXISTS comments_reply_notification_idx ON comments(reply_to_user_id, created_at DESC);
