-- Same-body comments are allowed; time-window rate limits remain the abuse
-- protection for comment creation. This index only supported the retired
-- duplicate-body lookup and is no longer needed for writes.
DROP INDEX IF EXISTS comments_duplicate_idx;
