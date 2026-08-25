import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import { migrateTurso, readMigrations } from "../scripts/migrate-turso.mjs";

async function tableNames(client) {
  const result = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
  return result.rows.map((row) => String(row.name));
}

test("backend hygiene preserves runtime data while removing retired storage", async () => {
  const client = createClient({ url: ":memory:" });
  const migrations = await readMigrations();
  const cleanupIndex = migrations.findIndex((migration) => migration.name.endsWith("_backend_schema_hygiene.sql"));
  assert.notEqual(cleanupIndex, -1);

  try {
    await migrateTurso({ client, apply: true, migrations: migrations.slice(0, cleanupIndex) });
    const now = Date.now();
    await client.execute({
      sql: `INSERT INTO users
        (id, email, username, password_hash, password_salt, nickname, role, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'member', 'active', ?, ?)`,
      args: ["user-1", "user-1@example.invalid", "reader01", "hash", "salt", "读者", now, now],
    });
    await client.execute({
      sql: "INSERT INTO user_avatars (user_id, image_data, mime_type, byte_size, updated_at) VALUES (?, ?, 'image/webp', ?, ?)",
      args: ["user-1", new Uint8Array(100 * 1024), 100 * 1024, now],
    });
    await client.execute({
      sql: "INSERT INTO article_metrics (slug, views, updated_at) VALUES ('example', 7, ?)",
      args: [now - 1],
    });
    await client.execute({
      sql: "INSERT INTO content_metrics (content_type, content_slug, views, updated_at) VALUES ('post', 'example', 9, ?)",
      args: [now],
    });

    await migrateTurso({ client, apply: true, migrations: [migrations[cleanupIndex]] });

    const tables = await tableNames(client);
    assert.equal(tables.includes("content_entries"), false);
    assert.equal(tables.includes("article_metrics"), false);
    assert.equal(tables.includes("comment_reports"), true);
    assert.equal(tables.includes("admin_audit"), true);
    assert.equal(tables.includes("friend_applications"), true);
    assert.deepEqual((await client.execute("SELECT views FROM content_metrics WHERE content_type = 'post' AND content_slug = 'example'")).rows, [{ views: 9 }]);
    assert.deepEqual((await client.execute("SELECT byte_size, length(image_data) AS stored_bytes FROM user_avatars WHERE user_id = 'user-1'")).rows, [{ byte_size: 102400, stored_bytes: 102400 }]);
    await client.execute({
      sql: `INSERT INTO users
        (id, email, username, password_hash, password_salt, nickname, role, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'member', 'active', ?, ?)`,
      args: ["user-2", "user-2@example.invalid", "reader02", "hash", "salt", "读者二", now, now],
    });
    await assert.rejects(client.execute({
      sql: "INSERT INTO user_avatars (user_id, image_data, mime_type, byte_size, updated_at) VALUES ('user-2', ?, 'image/webp', 102401, ?)",
      args: [new Uint8Array(102401), now],
    }), /CHECK constraint failed/u);
  } finally {
    await client.close();
  }
});

test("backend hygiene refuses to discard repository-era D1 content", async () => {
  const client = createClient({ url: ":memory:" });
  const migrations = await readMigrations();
  const cleanupIndex = migrations.findIndex((migration) => migration.name.endsWith("_backend_schema_hygiene.sql"));

  try {
    await migrateTurso({ client, apply: true, migrations: migrations.slice(0, cleanupIndex) });
    const now = Date.now();
    await client.execute({
      sql: `INSERT INTO users
        (id, email, username, password_hash, password_salt, nickname, role, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'member', 'active', ?, ?)`,
      args: ["user-1", "user-1@example.invalid", "reader01", "hash", "salt", "读者", now, now],
    });
    await client.execute({
      sql: `INSERT INTO content_entries
        (id, type, slug, title, status, data, created_at, updated_at, author_id)
        VALUES ('entry-1', 'post', 'legacy-entry', 'Legacy', 'draft', '{}', ?, ?, 'user-1')`,
      args: [now, now],
    });

    await assert.rejects(
      migrateTurso({ client, apply: true, migrations: [migrations[cleanupIndex]] }),
      /CHECK constraint failed/u,
    );
    assert.equal((await client.execute("SELECT COUNT(*) AS count FROM content_entries")).rows[0].count, 1);
  } finally {
    await client.close();
  }
});

test("retired backend storage is removed without changing active runtime data", async () => {
  const client = createClient({ url: ":memory:" });
  const migrations = await readMigrations();
  const cleanupIndex = migrations.findIndex((migration) => migration.name.endsWith("_remove_retired_backend_surface.sql"));
  assert.notEqual(cleanupIndex, -1);

  try {
    await migrateTurso({ client, apply: true, migrations: migrations.slice(0, cleanupIndex) });
    const now = Date.now();
    await client.batch([
      {
        sql: `INSERT INTO users
          (id, username, password_hash, password_salt, nickname, role, status, created_at, updated_at)
          VALUES ('admin-1', 'siteadmin', 'hash', 'salt', '管理员', 'admin', 'active', ?, ?),
                 ('member-1', 'reader01', 'hash', 'salt', '读者', 'member', 'active', ?, ?)`,
        args: [now, now, now, now],
      },
      {
        sql: `INSERT INTO comments
          (id, content_type, content_slug, user_id, body, status, created_at, updated_at)
          VALUES ('comment-1', 'post', 'example', 'member-1', '保留的评论', 'published', ?, ?)`,
        args: [now, now],
      },
      {
        sql: `INSERT INTO comment_reports
          (id, comment_id, reporter_id, reason, status, created_at)
          VALUES ('report-1', 'comment-1', 'admin-1', 'retired', 'open', ?)`,
        args: [now],
      },
      {
        sql: `INSERT INTO admin_audit
          (id, admin_user_id, action, target_type, target_id, created_at)
          VALUES ('audit-1', 'admin-1', 'retired', 'comment', 'comment-1', ?)`,
        args: [now],
      },
    ], "write");

    await migrateTurso({ client, apply: true, migrations: [migrations[cleanupIndex]] });

    const tables = await tableNames(client);
    assert.equal(tables.includes("comment_reports"), false);
    assert.equal(tables.includes("admin_audit"), false);
    assert.deepEqual((await client.execute("SELECT id, body, status FROM comments")).rows, [
      { id: "comment-1", body: "保留的评论", status: "published" },
    ]);
    assert.deepEqual((await client.execute("SELECT id, username, role FROM users ORDER BY id")).rows, [
      { id: "admin-1", username: "siteadmin", role: "admin" },
      { id: "member-1", username: "reader01", role: "member" },
    ]);
    assert.deepEqual((await client.execute("PRAGMA foreign_key_check")).rows, []);
  } finally {
    await client.close();
  }
});
