ALTER TABLE users ADD COLUMN username TEXT COLLATE NOCASE;

UPDATE users SET username = 'user_' || substr(replace(id, '-', ''), 1, 12) WHERE username IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx ON users(username COLLATE NOCASE);
