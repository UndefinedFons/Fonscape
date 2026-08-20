PRAGMA foreign_keys = ON;

-- This row belongs to the current installation's database. Because migrations
-- only run once per database, ordinary content deployments never reset it.
CREATE TABLE IF NOT EXISTS site_runtime (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  launched_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO site_runtime (id, launched_at)
VALUES (1, CAST(strftime('%s', 'now') AS INTEGER) * 1000);
