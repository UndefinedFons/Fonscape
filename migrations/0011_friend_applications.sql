CREATE TABLE IF NOT EXISTS friend_applications (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL UNIQUE REFERENCES comments(id) ON DELETE CASCADE,
  site TEXT NOT NULL,
  url TEXT NOT NULL,
  owner TEXT NOT NULL,
  description TEXT NOT NULL,
  color TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  reviewed_by TEXT REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS friend_applications_status_idx
ON friend_applications(status, created_at DESC);
