ALTER TABLE friend_applications ADD COLUMN publication_status TEXT NOT NULL DEFAULT 'draft'
  CHECK (publication_status IN ('draft', 'publishing', 'published', 'failed'));
ALTER TABLE friend_applications ADD COLUMN publication_branch TEXT;
ALTER TABLE friend_applications ADD COLUMN publication_pr_number INTEGER;
ALTER TABLE friend_applications ADD COLUMN publication_url TEXT;
ALTER TABLE friend_applications ADD COLUMN publication_commit_sha TEXT;
ALTER TABLE friend_applications ADD COLUMN publication_error TEXT;
ALTER TABLE friend_applications ADD COLUMN published_at INTEGER;

CREATE INDEX IF NOT EXISTS friend_applications_publication_idx
ON friend_applications(publication_status, created_at DESC);
