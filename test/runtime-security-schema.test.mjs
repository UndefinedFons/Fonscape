import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import { migrateTurso, readMigrations } from "../scripts/migrate-turso.mjs";

test("runtime security migration preserves legacy records and enforces avatar capacity", async () => {
  const client = createClient({ url: ":memory:" });
  const migrations = await readMigrations();
  const securityIndex = migrations.findIndex((migration) => migration.name.endsWith("_runtime_security.sql"));
  assert.notEqual(securityIndex, -1);
  const cleanupIndex = migrations.findIndex((migration) => migration.name.endsWith("_remove_legacy_friend_applications.sql"));
  assert.notEqual(cleanupIndex, -1);

  try {
    await migrateTurso({ client, apply: true, migrations: migrations.slice(0, securityIndex) });
    const now = Date.now();
    await client.batch([
      {
        sql: `INSERT INTO users
          (id, email, username, password_hash, password_salt, nickname, role, status, created_at, updated_at)
          VALUES (?, ?, ?, 'hash', 'salt', ?, 'admin', 'active', ?, ?)`,
        args: ["admin-1", "admin@example.invalid", "siteadmin", "管理员", now, now],
      },
      {
        sql: `INSERT INTO users
          (id, email, username, password_hash, password_salt, nickname, role, status, created_at, updated_at)
          VALUES (?, ?, ?, 'hash', 'salt', ?, 'member', 'active', ?, ?)`,
        args: ["member-1", "member@example.invalid", "reader01", "读者", now + 1, now + 1],
      },
      {
        sql: `INSERT INTO comments
          (id, content_type, content_slug, user_id, body, status, created_at, updated_at)
          VALUES ('comment-1', 'post', 'site-friends', 'member-1', 'legacy application', 'published', ?, ?)`,
        args: [now, now],
      },
      {
        sql: `INSERT INTO friend_applications
          (id, comment_id, site, url, owner, description, color, message, status, created_at, updated_at)
          VALUES ('application-1', 'comment-1', 'Example', 'https://example.com', 'Reader', 'Legacy', '#123456', '', 'pending', ?, ?)`,
        args: [now, now],
      },
      {
        sql: "INSERT INTO sessions (id_hash, user_id, expires_at, created_at, last_seen_at) VALUES ('session-1', 'admin-1', ?, ?, ?)",
        args: [now + 60_000, now, now],
      },
      {
        sql: "INSERT INTO comment_reports (id, comment_id, reporter_id, reason, status, created_at) VALUES ('report-1', 'comment-1', 'admin-1', 'check', 'open', ?)",
        args: [now],
      },
      {
        sql: "INSERT INTO admin_audit (id, admin_user_id, action, target_type, target_id, created_at) VALUES ('audit-1', 'admin-1', 'review', 'comment', 'comment-1', ?)",
        args: [now],
      },
      {
        sql: "INSERT INTO account_usage (user_id, comments_created, updated_at) VALUES ('admin-1', 0, ?), ('member-1', 1, ?)",
        args: [now, now],
      },
      {
        sql: "INSERT INTO user_avatars (user_id, image_data, mime_type, byte_size, updated_at) VALUES ('member-1', ?, 'image/webp', 12, ?)",
        args: [new Uint8Array(12), now],
      },
    ], "write");

    await migrateTurso({ client, apply: true, migrations: [migrations[securityIndex]] });

    const tables = (await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).rows.map((row) => row.name);
    assert.equal(tables.includes("friend_applications"), false);
    assert.equal(tables.includes("legacy_friend_applications_v1"), true);
    assert.deepEqual((await client.execute("SELECT id, comment_id FROM legacy_friend_applications_v1")).rows, [{ id: "application-1", comment_id: "comment-1" }]);

    await migrateTurso({ client, apply: true, migrations: [migrations[cleanupIndex]] });
    const cleanedTables = (await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).rows.map((row) => row.name);
    assert.equal(cleanedTables.includes("legacy_friend_applications_v1"), false);

    const userColumns = (await client.execute("PRAGMA table_info(users)")).rows.map((row) => row.name);
    assert.equal(userColumns.includes("email"), false);
    assert.equal(userColumns.includes("avatar"), false);
    assert.deepEqual((await client.execute("SELECT id, username, nickname, role FROM users ORDER BY id")).rows, [
      { id: "admin-1", username: "siteadmin", nickname: "管理员", role: "admin" },
      { id: "member-1", username: "reader01", nickname: "读者", role: "member" },
    ]);
    assert.deepEqual((await client.execute("SELECT id_hash, user_id FROM sessions")).rows, [{ id_hash: "session-1", user_id: "admin-1" }]);
    assert.deepEqual((await client.execute("SELECT id, user_id, body FROM comments")).rows, [{ id: "comment-1", user_id: "member-1", body: "legacy application" }]);
    assert.deepEqual((await client.execute("SELECT id, reporter_id FROM comment_reports")).rows, [{ id: "report-1", reporter_id: "admin-1" }]);
    assert.deepEqual((await client.execute("SELECT id, admin_user_id FROM admin_audit")).rows, [{ id: "audit-1", admin_user_id: "admin-1" }]);
    assert.deepEqual((await client.execute("SELECT user_id, comments_created FROM account_usage ORDER BY user_id")).rows, [
      { user_id: "admin-1", comments_created: 0 },
      { user_id: "member-1", comments_created: 1 },
    ]);
    assert.equal((await client.execute("SELECT value FROM storage_counters WHERE metric = 'avatar_bytes'")).rows[0].value, 12);
    assert.equal((await client.execute("SELECT admin_initialized_at FROM site_runtime WHERE id = 1")).rows[0].admin_initialized_at, now);
    assert.deepEqual((await client.execute("PRAGMA foreign_key_check")).rows, []);

    await client.execute("UPDATE storage_counters SET value = 104857550 WHERE metric = 'avatar_bytes'");
    await assert.rejects(client.execute({
      sql: "UPDATE user_avatars SET image_data = ?, byte_size = 100, updated_at = ? WHERE user_id = 'member-1'",
      args: [new Uint8Array(100), now],
    }), /avatar_capacity_reached/u);
    await client.execute("UPDATE storage_counters SET value = 104857600 WHERE metric = 'avatar_bytes'");
    await client.execute({
      sql: `INSERT INTO user_avatars (user_id, image_data, mime_type, byte_size, updated_at)
        VALUES ('member-1', ?, 'image/webp', 8, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          image_data = excluded.image_data,
          mime_type = excluded.mime_type,
          byte_size = excluded.byte_size,
          updated_at = excluded.updated_at`,
      args: [new Uint8Array(8), now + 1],
    });
    assert.equal((await client.execute("SELECT value FROM storage_counters WHERE metric = 'avatar_bytes'")).rows[0].value, 104857596);
    assert.equal((await client.execute("SELECT byte_size FROM user_avatars WHERE user_id = 'member-1'")).rows[0].byte_size, 8);
    await client.execute("UPDATE storage_counters SET value = 8 WHERE metric = 'avatar_bytes'");
    await client.execute({
      sql: "UPDATE user_avatars SET image_data = ?, byte_size = 20, updated_at = ? WHERE user_id = 'member-1'",
      args: [new Uint8Array(20), now + 2],
    });
    assert.equal((await client.execute("SELECT value FROM storage_counters WHERE metric = 'avatar_bytes'")).rows[0].value, 20);
    await client.execute("DELETE FROM user_avatars WHERE user_id = 'member-1'");
    assert.equal((await client.execute("SELECT value FROM storage_counters WHERE metric = 'avatar_bytes'")).rows[0].value, 0);
  } finally {
    await client.close();
  }
});

test("runtime security migration bootstraps site runtime for a fork without its public migration", async () => {
  const client = createClient({ url: ":memory:" });
  const migrations = await readMigrations();
  const securityIndex = migrations.findIndex((migration) => migration.name.endsWith("_runtime_security.sql"));
  assert.notEqual(securityIndex, -1);

  try {
    const forkedHistory = migrations
      .slice(0, securityIndex)
      .filter((migration) => !migration.name.endsWith("_site_runtime.sql"));
    await migrateTurso({ client, apply: true, migrations: forkedHistory });
    assert.deepEqual((await client.execute("SELECT name FROM sqlite_master WHERE name = 'site_runtime'")).rows, []);

    await migrateTurso({ client, apply: true, migrations: [migrations[securityIndex]] });

    const runtime = (await client.execute(`
      SELECT id, launched_at, admin_initialized_at, admin_bootstrap_claim, rate_limit_secret
      FROM site_runtime
      WHERE id = 1
    `)).rows;
    assert.equal(runtime.length, 1);
    assert.equal(runtime[0].id, 1);
    assert.equal(Number(runtime[0].launched_at) > 0, true);
    assert.equal(runtime[0].admin_initialized_at, null);
    assert.equal(runtime[0].admin_bootstrap_claim, null);
    assert.equal(runtime[0].rate_limit_secret, null);
  } finally {
    await client.close();
  }
});

test("runtime security migration aborts before dropping parents with unknown foreign keys", async () => {
  const client = createClient({ url: ":memory:" });
  const migrations = await readMigrations();
  const securityIndex = migrations.findIndex((migration) => migration.name.endsWith("_runtime_security.sql"));
  assert.notEqual(securityIndex, -1);

  try {
    await migrateTurso({ client, apply: true, migrations: migrations.slice(0, securityIndex) });
    const now = Date.now();
    await client.execute({
      sql: `INSERT INTO users
        (id, email, username, password_hash, password_salt, nickname, role, status, created_at, updated_at)
        VALUES (?, ?, ?, 'hash', 'salt', ?, 'member', 'active', ?, ?)`,
      args: ["member-1", "member@example.invalid", "reader01", "读者", now, now],
    });
    await client.execute(`CREATE TABLE extension_rows (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE
    )`);
    await client.execute({
      sql: "INSERT INTO extension_rows (id, user_id) VALUES (?, ?)",
      args: ["extension-1", "member-1"],
    });

    await assert.rejects(
      migrateTurso({ client, apply: true, migrations: [migrations[securityIndex]] }),
      /CHECK constraint failed/u,
    );

    assert.deepEqual((await client.execute("SELECT id, user_id FROM extension_rows")).rows, [
      { id: "extension-1", user_id: "member-1" },
    ]);
    assert.equal((await client.execute("SELECT name FROM sqlite_master WHERE name = 'users_next'")).rows.length, 0);
    assert.equal((await client.execute("SELECT name FROM sqlite_master WHERE name = 'friend_applications'")).rows.length, 1);
    assert.equal((await client.execute({
      sql: "SELECT name FROM fonscape_schema_migrations WHERE name = ?",
      args: [migrations[securityIndex].name],
    })).rows.length, 0);
    const userColumns = (await client.execute("PRAGMA table_info(users)")).rows.map((row) => row.name);
    assert.equal(userColumns.includes("email"), true);
  } finally {
    await client.close();
  }
});
