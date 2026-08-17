import assert from "node:assert/strict";
import test from "node:test";
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

test("Turso migration only writes with explicit apply and records checksums", async () => {
  const calls = [];
  const client = {
    async execute(statement) {
      calls.push({ method: "execute", statement });
      return { rows: [] };
    },
    async batch(statements, mode) {
      calls.push({ method: "batch", statements, mode });
      return [];
    },
  };
  const migrations = [{
    name: "0001_example.sql",
    checksum: "example-checksum",
    statements: ["CREATE TABLE example (id TEXT PRIMARY KEY)"],
  }];

  assert.deepEqual(await migrateTurso({ client, migrations }), {
    applied: [],
    pending: ["0001_example.sql"],
  });
  assert.match(calls[0].statement, /^SELECT name, checksum/u);
  assert.equal(calls.filter((call) => call.method === "batch").length, 0);

  assert.deepEqual(await migrateTurso({ client, migrations, apply: true }), {
    applied: ["0001_example.sql"],
    pending: [],
  });
  const write = calls.at(-1);
  assert.equal(write.method, "batch");
  assert.equal(write.mode, "write");
  assert.equal(write.statements.at(-1).args[0], "0001_example.sql");
});
