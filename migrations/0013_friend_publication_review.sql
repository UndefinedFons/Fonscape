PRAGMA defer_foreign_keys = ON;

CREATE TABLE friend_applications_next (
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
  reviewed_by TEXT REFERENCES users(id),
  publication_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (publication_status IN ('draft', 'publishing', 'pending_review', 'published', 'failed')),
  publication_branch TEXT,
  publication_pr_number INTEGER,
  publication_url TEXT,
  publication_commit_sha TEXT,
  publication_error TEXT,
  published_at INTEGER
);

INSERT INTO friend_applications_next (
  id, comment_id, site, url, owner, description, color, message, status,
  created_at, updated_at, reviewed_at, reviewed_by, publication_status,
  publication_branch, publication_pr_number, publication_url,
  publication_commit_sha, publication_error, published_at
)
SELECT
  id, comment_id, site, url, owner, description, color, message, status,
  created_at, updated_at, reviewed_at, reviewed_by, publication_status,
  publication_branch, publication_pr_number, publication_url,
  publication_commit_sha, publication_error, published_at
FROM friend_applications;

DROP TABLE friend_applications;
ALTER TABLE friend_applications_next RENAME TO friend_applications;

CREATE INDEX IF NOT EXISTS friend_applications_status_idx
ON friend_applications(status, created_at DESC);

CREATE INDEX IF NOT EXISTS friend_applications_publication_idx
ON friend_applications(publication_status, created_at DESC);
