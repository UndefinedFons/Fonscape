import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createClient } from "@libsql/client";
import { migrateTurso, splitSqlStatements } from "../scripts/migrate-turso.mjs";

test("Turso migration splitter preserves quoted and commented semicolons", () => {
  assert.deepEqual(splitSqlStatements(`-- ignored ; comment
CREATE TABLE test (value TEXT DEFAULT 'a; b');
INSERT INTO test VALUES ("quoted; value");
/* another ; comment */
UPDATE test SET value = 'it''s done';
-- trailing comment only`), [
    "-- ignored ; comment\nCREATE TABLE test (value TEXT DEFAULT 'a; b')",
    'INSERT INTO test VALUES ("quoted; value")',
    "/* another ; comment */\nUPDATE test SET value = 'it''s done'",
  ]);
});

test("Turso migration splitter preserves complete trigger bodies", () => {
  const trigger = `-- Keep the trigger as one migration statement.
CREATE TRIGGER example_after_insert
AFTER INSERT ON example
BEGIN
  UPDATE counters SET value = value + 1;
  INSERT INTO audit (message) VALUES ('created; safely');
END;`;
  assert.deepEqual(splitSqlStatements(`${trigger}
CREATE INDEX example_value_idx ON example(value);`), [
    trigger.slice(0, -1),
    "CREATE INDEX example_value_idx ON example(value)",
  ]);
});

test("Turso migration splitter handles nested CASE and trigger trailing comments", () => {
  const trigger = `CREATE TRIGGER example_after_insert
AFTER INSERT ON example
BEGIN
  UPDATE counters
  SET value = CASE
    WHEN NEW.kind = 'a; b' THEN 1
    ELSE 0
  END;
  -- An END in a comment must not close the trigger.
  INSERT INTO audit (message) VALUES ('created');
END /* keep the trigger comment attached */;`;

  assert.deepEqual(splitSqlStatements(`${trigger}
CREATE INDEX example_value_idx ON example(value);`), [
    trigger.slice(0, -1),
    "CREATE INDEX example_value_idx ON example(value)",
  ]);
});

test("Turso migration only writes with explicit apply and records checksums", async () => {
  const client = createClient({ url: ":memory:" });
  const migrations = [{
    name: "0001_example.sql",
    checksum: "example-checksum",
    statements: ["CREATE TABLE example (id TEXT PRIMARY KEY)"],
  }];

  try {
    assert.deepEqual(await migrateTurso({ client, migrations }), {
      applied: [],
      pending: ["0001_example.sql"],
    });
    assert.deepEqual((await client.execute("SELECT name FROM sqlite_master WHERE name = 'example'")).rows, []);

    assert.deepEqual(await migrateTurso({ client, migrations, apply: true }), {
      applied: ["0001_example.sql"],
      pending: [],
    });
    assert.deepEqual((await client.execute("SELECT name FROM sqlite_master WHERE name = 'example'")).rows, [{ name: "example" }]);
    assert.deepEqual((await client.execute("SELECT name, checksum FROM fonscape_schema_migrations")).rows, [{
      name: "0001_example.sql",
      checksum: "example-checksum",
    }]);
  } finally {
    await client.close();
  }
});

test("concurrent Turso migration runners apply each migration once", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fonscape-migration-"));
  const url = `file:${join(directory, "runtime.db")}`;
  const firstClient = createClient({ url });
  const secondClient = createClient({ url });
  const migrations = [{
    name: "0001_concurrent.sql",
    checksum: "concurrent-checksum",
    statements: ["CREATE TABLE concurrent_example (id TEXT PRIMARY KEY)"],
  }];

  try {
    const results = await Promise.all([
      migrateTurso({ client: firstClient, migrations, apply: true }),
      migrateTurso({ client: secondClient, migrations, apply: true }),
    ]);
    assert.equal(results.flatMap((result) => result.applied).length, 1);
    assert.deepEqual((await firstClient.execute(
      "SELECT name, checksum FROM fonscape_schema_migrations",
    )).rows, [{ name: "0001_concurrent.sql", checksum: "concurrent-checksum" }]);
  } finally {
    await firstClient.close();
    await secondClient.close();
    await rm(directory, { recursive: true, force: true });
  }
});
