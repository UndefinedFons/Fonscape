CREATE TABLE IF NOT EXISTS comment_notification_reads (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, comment_id)
);

CREATE INDEX IF NOT EXISTS comment_notification_reads_comment_idx
  ON comment_notification_reads(comment_id);
