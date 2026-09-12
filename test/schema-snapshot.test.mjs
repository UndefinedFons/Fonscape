import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import { migrateTurso } from "../scripts/migrate-turso.mjs";

async function schemaSnapshot(client) {
  const objects = await client.execute(`
    SELECT type, name, tbl_name
    FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite_%' AND name != 'fonscape_schema_migrations'
    ORDER BY type, name
  `);
  const columns = [];
  for (const { name } of objects.rows.filter((object) => object.type === "table")) {
    const tableColumns = await client.execute(`PRAGMA table_info(${JSON.stringify(String(name))})`);
    columns.push(...tableColumns.rows.map((row) => ({
      table: String(name),
      name: String(row.name),
      type: String(row.type),
      notNull: Number(row.notnull),
      primaryKey: Number(row.pk),
    })));
  }
  return {
    objects: objects.rows.map(({ type, name, tbl_name }) => ({ type, name, tbl_name })),
    columns,
  };
}

test("runtime schema remains a deliberate, machine-checkable snapshot", async () => {
  const client = createClient({ url: ":memory:" });
  try {
    await migrateTurso({ client, apply: true });
    const snapshot = await schemaSnapshot(client);
    assert.equal(snapshot.objects.filter((object) => object.type === "table").length, 12);
    assert.deepEqual(snapshot.objects.filter((object) => object.type === "table").map((object) => object.name), [
      "account_usage",
      "comment_mutations",
      "comment_notification_reads",
      "comment_target_usage",
      "comments",
      "content_metrics",
      "rate_limits",
      "sessions",
      "site_runtime",
      "storage_counters",
      "user_avatars",
      "users",
    ]);
    assert.equal(snapshot.objects.some((object) => object.type === "table" && object.name === "friend_applications"), false);
    assert.deepEqual(snapshot.columns.filter((column) => column.table === "comments" && column.primaryKey).map((column) => column.name), ["id"]);
    assert.deepEqual(snapshot.columns.filter((column) => column.table === "comment_target_usage").map((column) => column.name), [
      "content_type",
      "content_slug",
      "active_comments",
      "published_comments",
      "updated_at",
    ]);
    assert.equal(snapshot.columns.some((column) => column.table === "sessions" && column.name === "last_seen_at"), false);
  } finally {
    await client.close();
  }
});
