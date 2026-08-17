PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS account_usage (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  comments_created INTEGER NOT NULL DEFAULT 0 CHECK (comments_created >= 0),
  updated_at INTEGER NOT NULL
);

INSERT INTO account_usage (user_id, comments_created, updated_at)
SELECT u.id, COUNT(c.id), CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM users u
LEFT JOIN comments c ON c.user_id = u.id
GROUP BY u.id
ON CONFLICT(user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS storage_counters (
  metric TEXT PRIMARY KEY,
  value INTEGER NOT NULL CHECK (value >= 0),
  updated_at INTEGER NOT NULL
);

INSERT INTO storage_counters (metric, value, updated_at)
VALUES
  ('member_accounts', (SELECT COUNT(*) FROM users WHERE role = 'member'), CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('comments_created', (SELECT COUNT(*) FROM comments), CAST(strftime('%s', 'now') AS INTEGER) * 1000)
ON CONFLICT(metric) DO NOTHING;

CREATE INDEX IF NOT EXISTS rate_limits_updated_idx
ON rate_limits(updated_at);

CREATE INDEX IF NOT EXISTS comments_admin_notification_idx
ON comments(status, created_at DESC);
