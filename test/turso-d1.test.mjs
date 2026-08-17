import assert from "node:assert/strict";
import test from "node:test";
import { createTursoD1Database } from "../server/turso-d1.js";

test("Turso adapter exposes the D1 prepared-statement result shape", async () => {
  const calls = [];
  const client = {
    async execute(statement) {
      calls.push({ method: "execute", statement });
      return {
        rows: [{ id: 7n, avatar: new Uint8Array([1, 2, 3]) }],
        rowsAffected: 2,
        lastInsertRowid: 9n,
      };
    },
    async batch(statements, mode) {
      calls.push({ method: "batch", statements, mode });
      return statements.map((statement, index) => ({
        rows: [{ statement: index, sql: statement.sql }],
        rowsAffected: index + 1,
        lastInsertRowid: BigInt(index + 10),
      }));
    },
  };
  const db = createTursoD1Database({ client });

  const statement = db.prepare("SELECT id, avatar FROM users WHERE username = ?").bind("reader");
  assert.deepEqual(await statement.first(), {
    id: 7,
    avatar: new Uint8Array([1, 2, 3]).buffer,
  });
  assert.equal(await statement.first("id"), 7);

  const all = await statement.all();
  assert.equal(all.success, true);
  assert.equal(all.meta.changes, 2);
  assert.equal(all.meta.last_row_id, 9);
  assert.deepEqual(calls[0].statement, {
    sql: "SELECT id, avatar FROM users WHERE username = ?",
    args: ["reader"],
  });

  const run = await db.prepare("UPDATE users SET nickname = ? WHERE id = ?").bind("读者", "u1").run();
  assert.equal(run.meta.changes, 2);

  const batch = await db.batch([
    db.prepare("INSERT INTO events (id) VALUES (?)").bind("one"),
    db.prepare("INSERT INTO events (id) VALUES (?)").bind("two"),
  ]);
  assert.equal(calls.at(-1).method, "batch");
  assert.equal(calls.at(-1).mode, "write");
  assert.deepEqual(calls.at(-1).statements, [
    { sql: "INSERT INTO events (id) VALUES (?)", args: ["one"] },
    { sql: "INSERT INTO events (id) VALUES (?)", args: ["two"] },
  ]);
  assert.deepEqual(batch.map((result) => result.meta.changes), [1, 2]);
});

test("Turso adapter rejects values that are not its prepared statements", async () => {
  const db = createTursoD1Database({
    client: {
      execute: async () => ({ rows: [] }),
      batch: async () => [],
    },
  });
  await assert.rejects(db.batch([{}]), /prepared statements/u);
});
