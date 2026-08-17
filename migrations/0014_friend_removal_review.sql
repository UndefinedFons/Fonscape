ALTER TABLE friend_applications ADD COLUMN removal_status TEXT NOT NULL DEFAULT 'none'
  CHECK (removal_status IN ('none', 'publishing', 'pending_review', 'failed'));
ALTER TABLE friend_applications ADD COLUMN removal_branch TEXT;
ALTER TABLE friend_applications ADD COLUMN removal_pr_number INTEGER;
ALTER TABLE friend_applications ADD COLUMN removal_url TEXT;
ALTER TABLE friend_applications ADD COLUMN removal_commit_sha TEXT;
ALTER TABLE friend_applications ADD COLUMN removal_error TEXT;
ALTER TABLE friend_applications ADD COLUMN removal_requested_at INTEGER;

CREATE INDEX IF NOT EXISTS friend_applications_removal_idx
ON friend_applications(removal_status, updated_at DESC);
