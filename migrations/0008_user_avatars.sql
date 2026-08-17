PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_avatars (
  -- One row per account. Re-uploading uses an UPSERT on this primary key, so
  -- the old BLOB is replaced rather than accumulating another avatar.
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  image_data BLOB NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 307200),
  updated_at INTEGER NOT NULL
);

-- Do not infer or backfill avatar ownership from legacy BLOB columns. An avatar
-- enters this table only when the authenticated account uploads it.
