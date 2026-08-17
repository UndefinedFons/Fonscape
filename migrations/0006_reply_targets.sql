ALTER TABLE comments ADD COLUMN reply_to_comment_id TEXT REFERENCES comments(id) ON DELETE SET NULL;

UPDATE comments
SET reply_to_comment_id = parent_id
WHERE reply_to_comment_id IS NULL AND parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS comments_reply_target_idx
ON comments(reply_to_comment_id, created_at DESC);
