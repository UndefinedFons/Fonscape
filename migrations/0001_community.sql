PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  nickname TEXT NOT NULL,
  avatar BLOB,
  avatar_mime TEXT,
  avatar_updated_at INTEGER,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'banned')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL CHECK (content_type IN ('post', 'poem', 'music')),
  content_slug TEXT NOT NULL,
  parent_id TEXT REFERENCES comments(id) ON DELETE SET NULL,
  reply_to_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden', 'deleted')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  edited_at INTEGER,
  moderated_at INTEGER,
  moderated_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS comments_target_idx ON comments(content_type, content_slug, status, created_at);
CREATE INDEX IF NOT EXISTS comments_parent_idx ON comments(parent_id, created_at);
CREATE INDEX IF NOT EXISTS comments_user_idx ON comments(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS comment_reports (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at INTEGER NOT NULL,
  UNIQUE(comment_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS reports_status_idx ON comment_reports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  count INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_audit (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  details TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit(created_at DESC);
