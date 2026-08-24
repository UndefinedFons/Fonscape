PRAGMA defer_foreign_keys = ON;

-- Administrator bootstrap and the rate-limit key secret belong to this
-- installation, not to deployment configuration. Existing installations with
-- an administrator are marked initialized before the API begins using the new
-- bootstrap flow.
-- Some private-history upgrades reach this migration without the public
-- site-runtime migration. Recreate its v1 shape here so the security upgrade
-- remains self-contained across that valid migration fork.
CREATE TABLE IF NOT EXISTS site_runtime (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  launched_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO site_runtime (id, launched_at)
VALUES (1, CAST(strftime('%s', 'now') AS INTEGER) * 1000);

ALTER TABLE site_runtime ADD COLUMN admin_initialized_at INTEGER;
ALTER TABLE site_runtime ADD COLUMN admin_bootstrap_claim TEXT;
ALTER TABLE site_runtime ADD COLUMN rate_limit_secret TEXT;

UPDATE site_runtime
SET
  admin_initialized_at = COALESCE(
    admin_initialized_at,
    (SELECT MIN(created_at) FROM users WHERE role = 'admin')
  ),
  admin_bootstrap_claim = CASE
    WHEN EXISTS (SELECT 1 FROM users WHERE role = 'admin') THEN 'legacy-admin'
    ELSE admin_bootstrap_claim
  END
WHERE id = 1;

-- Preserve every user-facing runtime record while removing columns that have
-- been obsolete since username login and the dedicated avatar table were
-- added. Referencing tables are copied before the old users table is dropped;
-- otherwise its ON DELETE actions would erase their rows. NOT NULL and UNIQUE
-- checks make the migration abort instead of guessing if a third-party
-- database contains invalid legacy data.
CREATE TABLE users_next (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  nickname TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'banned')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  notifications_seen_at INTEGER,
  admin_comments_seen_at INTEGER
);

INSERT INTO users_next (
  id, username, password_hash, password_salt, nickname, role, status,
  created_at, updated_at, notifications_seen_at, admin_comments_seen_at
)
SELECT
  id, username, password_hash, password_salt, nickname, role, status,
  created_at, updated_at, notifications_seen_at, admin_comments_seen_at
FROM users;

CREATE TABLE sessions_next (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users_next(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

INSERT INTO sessions_next SELECT * FROM sessions;

CREATE TABLE comments_next (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL CHECK (content_type IN ('post', 'poem', 'music')),
  content_slug TEXT NOT NULL,
  parent_id TEXT REFERENCES comments_next(id) ON DELETE SET NULL,
  reply_to_user_id TEXT REFERENCES users_next(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL REFERENCES users_next(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden', 'deleted')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  edited_at INTEGER,
  moderated_at INTEGER,
  moderated_by TEXT REFERENCES users_next(id) ON DELETE SET NULL,
  reply_to_comment_id TEXT REFERENCES comments_next(id) ON DELETE SET NULL
);

INSERT INTO comments_next SELECT * FROM comments;

CREATE TABLE comment_reports_next (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL REFERENCES comments_next(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users_next(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at INTEGER NOT NULL,
  UNIQUE(comment_id, reporter_id)
);

INSERT INTO comment_reports_next SELECT * FROM comment_reports;

CREATE TABLE admin_audit_next (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES users_next(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  details TEXT,
  created_at INTEGER NOT NULL
);

INSERT INTO admin_audit_next SELECT * FROM admin_audit;

CREATE TABLE account_usage_next (
  user_id TEXT PRIMARY KEY REFERENCES users_next(id) ON DELETE CASCADE,
  comments_created INTEGER NOT NULL DEFAULT 0 CHECK (comments_created >= 0),
  updated_at INTEGER NOT NULL
);

INSERT INTO account_usage_next SELECT * FROM account_usage;

CREATE TABLE user_avatars_next (
  user_id TEXT PRIMARY KEY REFERENCES users_next(id) ON DELETE CASCADE,
  image_data BLOB NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 102400),
  updated_at INTEGER NOT NULL
);

INSERT INTO user_avatars_next SELECT * FROM user_avatars;

-- Friend applications are now repository-reviewed comments. Keep any earlier
-- workflow records under an explicit legacy name so upgrades never discard
-- application history silently.
CREATE TABLE legacy_friend_applications_v1_next (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL UNIQUE REFERENCES comments_next(id) ON DELETE CASCADE,
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
  reviewed_by TEXT REFERENCES users_next(id),
  publication_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (publication_status IN ('draft', 'publishing', 'pending_review', 'published', 'failed')),
  publication_branch TEXT,
  publication_pr_number INTEGER,
  publication_url TEXT,
  publication_commit_sha TEXT,
  publication_error TEXT,
  published_at INTEGER,
  removal_status TEXT NOT NULL DEFAULT 'none'
    CHECK (removal_status IN ('none', 'publishing', 'pending_review', 'failed')),
  removal_branch TEXT,
  removal_pr_number INTEGER,
  removal_url TEXT,
  removal_commit_sha TEXT,
  removal_error TEXT,
  removal_requested_at INTEGER
);

INSERT INTO legacy_friend_applications_v1_next SELECT * FROM friend_applications;

-- Rebuilding the known runtime tables is safe only when no extension table
-- still points at one of the old parents. Dropping a parent with an
-- ON DELETE CASCADE/SET NULL foreign key would otherwise mutate an unknown
-- table while this migration appears to succeed. Abort before any DROP so
-- the migration transaction can roll back all of the *_next preparation.
CREATE TABLE runtime_security_foreign_key_guard (
  invalid_reference INTEGER NOT NULL CHECK (invalid_reference = 0)
);

-- D1 does not authorize the table-valued pragma form of foreign_key_list.
-- Normalize each CREATE TABLE declaration instead, so the guard remains
-- portable across D1 and libSQL while accepting normal whitespace/quoting.
-- A textual match is deliberately conservative: an ambiguous extension
-- declaration aborts before any parent table can be dropped.
WITH schema_sql AS (
  SELECT child.name,
    lower(
      replace(replace(replace(child.sql, char(9), ''), char(10), ''), char(13), '')
    ) AS sql
  FROM sqlite_schema AS child
  WHERE child.type = 'table'
    AND child.name NOT LIKE 'sqlite_%'
), normalized_schema AS (
  SELECT name,
    replace(replace(replace(replace(replace(replace(sql,
      ' ', ''), char(34), ''), char(39), ''), char(96), ''), char(91), ''), char(93), '') AS sql
  FROM schema_sql
), reference_targets(token) AS (
  VALUES
    ('referencesusers'),
    ('referencessessions'),
    ('referencescomments'),
    ('referencescomment_reports'),
    ('referencesadmin_audit'),
    ('referencesaccount_usage'),
    ('referencesuser_avatars'),
    ('referencesfriend_applications')
), unknown_references AS (
  SELECT normalized_schema.name
  FROM normalized_schema
  JOIN reference_targets
    ON instr(normalized_schema.sql, reference_targets.token) > 0
  WHERE normalized_schema.name COLLATE NOCASE NOT IN (
    'sessions', 'comments', 'comment_reports', 'admin_audit',
    'account_usage', 'user_avatars', 'friend_applications'
  )
    AND (
      substr(
        normalized_schema.sql,
        instr(normalized_schema.sql, reference_targets.token)
          + length(reference_targets.token),
        1
      ) NOT GLOB '[a-z0-9_$]'
      OR substr(
        normalized_schema.sql,
        instr(normalized_schema.sql, reference_targets.token)
          + length(reference_targets.token),
        10
      ) GLOB 'on*'
      OR substr(
        normalized_schema.sql,
        instr(normalized_schema.sql, reference_targets.token)
          + length(reference_targets.token),
        10
      ) GLOB 'match*'
      OR substr(
        normalized_schema.sql,
        instr(normalized_schema.sql, reference_targets.token)
          + length(reference_targets.token),
        10
      ) GLOB 'not*'
      OR substr(
        normalized_schema.sql,
        instr(normalized_schema.sql, reference_targets.token)
          + length(reference_targets.token),
        10
      ) GLOB 'deferrable*'
    )
)
INSERT INTO runtime_security_foreign_key_guard (invalid_reference)
SELECT COUNT(*) FROM unknown_references;

DROP TABLE runtime_security_foreign_key_guard;

DROP TABLE friend_applications;
DROP TABLE comment_reports;
DROP TABLE admin_audit;
DROP TABLE sessions;
DROP TABLE account_usage;
DROP TABLE user_avatars;
DROP TABLE comments;
DROP TABLE users;

ALTER TABLE users_next RENAME TO users;
ALTER TABLE sessions_next RENAME TO sessions;
ALTER TABLE comments_next RENAME TO comments;
ALTER TABLE comment_reports_next RENAME TO comment_reports;
ALTER TABLE admin_audit_next RENAME TO admin_audit;
ALTER TABLE account_usage_next RENAME TO account_usage;
ALTER TABLE user_avatars_next RENAME TO user_avatars;
ALTER TABLE legacy_friend_applications_v1_next RENAME TO legacy_friend_applications_v1;

CREATE UNIQUE INDEX users_username_unique_idx ON users(username COLLATE NOCASE);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE INDEX comments_target_idx ON comments(content_type, content_slug, status, created_at);
CREATE INDEX comments_parent_idx ON comments(parent_id, created_at);
CREATE INDEX comments_user_idx ON comments(user_id, created_at DESC);
CREATE INDEX comments_reply_notification_idx ON comments(reply_to_user_id, created_at DESC);
CREATE INDEX comments_reply_target_idx ON comments(reply_to_comment_id, created_at DESC);
CREATE INDEX comments_admin_notification_idx ON comments(status, created_at DESC);
CREATE INDEX reports_status_idx ON comment_reports(status, created_at DESC);
CREATE INDEX admin_audit_created_idx ON admin_audit(created_at DESC);
CREATE INDEX legacy_friend_applications_status_idx
  ON legacy_friend_applications_v1(status, created_at DESC);
CREATE INDEX legacy_friend_applications_publication_idx
  ON legacy_friend_applications_v1(publication_status, created_at DESC);
CREATE INDEX legacy_friend_applications_removal_idx
  ON legacy_friend_applications_v1(removal_status, updated_at DESC);

-- A site-wide 100 MiB fuse complements the existing 100 KiB per-avatar check.
-- The guard refuses an upgrade whose existing data already exceeds the fuse.
CREATE TABLE avatar_capacity_guard (
  stored_bytes INTEGER NOT NULL CHECK (stored_bytes <= 104857600)
);

INSERT INTO avatar_capacity_guard (stored_bytes)
SELECT COALESCE(SUM(byte_size), 0) FROM user_avatars;

DROP TABLE avatar_capacity_guard;

INSERT INTO storage_counters (metric, value, updated_at)
VALUES (
  'avatar_bytes',
  (SELECT COALESCE(SUM(byte_size), 0) FROM user_avatars),
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
)
ON CONFLICT(metric) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;

CREATE TRIGGER user_avatars_capacity_before_insert
BEFORE INSERT ON user_avatars
WHEN (
  SELECT COALESCE(
    value
      - COALESCE((SELECT byte_size FROM user_avatars WHERE user_id = NEW.user_id), 0)
      + NEW.byte_size,
    104857601
  )
  FROM storage_counters
  WHERE metric = 'avatar_bytes'
) > 104857600 OR NOT EXISTS (
  SELECT 1 FROM storage_counters WHERE metric = 'avatar_bytes'
)
BEGIN
  SELECT RAISE(ABORT, 'avatar_capacity_reached');
END;

CREATE TRIGGER user_avatars_capacity_after_insert
AFTER INSERT ON user_avatars
BEGIN
  UPDATE storage_counters
  SET value = value + NEW.byte_size,
      updated_at = NEW.updated_at
  WHERE metric = 'avatar_bytes';
END;

CREATE TRIGGER user_avatars_capacity_before_update
BEFORE UPDATE OF image_data, byte_size ON user_avatars
WHEN (
  SELECT COALESCE(value - OLD.byte_size + NEW.byte_size, 104857601)
  FROM storage_counters
  WHERE metric = 'avatar_bytes'
) > 104857600 OR NOT EXISTS (
  SELECT 1 FROM storage_counters WHERE metric = 'avatar_bytes'
)
BEGIN
  SELECT RAISE(ABORT, 'avatar_capacity_reached');
END;

CREATE TRIGGER user_avatars_capacity_after_update
AFTER UPDATE OF image_data, byte_size ON user_avatars
BEGIN
  UPDATE storage_counters
  SET value = MAX(0, value - OLD.byte_size + NEW.byte_size),
      updated_at = NEW.updated_at
  WHERE metric = 'avatar_bytes';
END;

CREATE TRIGGER user_avatars_capacity_after_delete
AFTER DELETE ON user_avatars
BEGIN
  UPDATE storage_counters
  SET value = MAX(0, value - OLD.byte_size),
      updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
  WHERE metric = 'avatar_bytes';
END;

PRAGMA foreign_keys = ON;
