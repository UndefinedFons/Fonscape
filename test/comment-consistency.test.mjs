import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import { insertCommentAtomically, reconcileRuntimeCounters } from "../functions/_lib/abuse.js";
import { onRequest } from "../functions/api/[[path]].js";
import { migrateTurso } from "../scripts/migrate-turso.mjs";
import { createTursoD1Database } from "../server/turso-d1.js";

async function migratedDatabase() {
  const client = createClient({ url: ":memory:" });
  await migrateTurso({ client, apply: true });
  return { client, db: createTursoD1Database({ client }) };
}

async function seedUser(client, {
  id = "member-1",
  username = "reader01",
  nickname = "读者",
  role = "member",
  now = Date.now(),
} = {}) {
  await client.execute({
    sql: `INSERT INTO users
      (id, username, password_hash, password_salt, nickname, role, status,
        created_at, updated_at)
      VALUES (?, ?, 'hash', 'salt', ?, ?, 'active', ?, ?)`,
    args: [id, username, nickname, role, now, now],
  });
  await client.execute({
    sql: "INSERT INTO account_usage (user_id, comments_created, updated_at) VALUES (?, 0, ?)",
    args: [id, now],
  });
  return { id, username, nickname, role, status: "active", created_at: now };
}

function requestContext({ path, method = "GET", db, currentUser, query = "", body, headers = {}, env = {} }) {
  const pending = [];
  return {
    request: new Request(`https://example.test/api/${path.join("/")}${query}`, {
      method,
      headers: body === undefined ? headers : { "Content-Type": "application/json", ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env: { DB: db, ...env },
    params: { path },
    data: { currentUser },
    waitUntil(promise) { pending.push(Promise.resolve(promise)); },
    async settle() { await Promise.all(pending); },
  };
}

test("comment consistency migration backfills generic target usage and removes dead session state", async () => {
  const { client } = await migratedDatabase();
  try {
    const sessionColumns = (await client.execute("PRAGMA table_info(sessions)")).rows.map((row) => row.name);
    assert.equal(sessionColumns.includes("last_seen_at"), false);
    const targetColumns = (await client.execute("PRAGMA table_info(comment_target_usage)")).rows.map((row) => row.name);
    assert.deepEqual(targetColumns, ["content_type", "content_slug", "active_comments", "published_comments", "updated_at"]);
    const schema = String((await client.execute("SELECT sql FROM sqlite_schema WHERE name = 'comment_target_usage'")).rows[0].sql);
    assert.doesNotMatch(schema, /post|poem|music/iu);
    const triggers = (await client.execute("SELECT name FROM sqlite_schema WHERE type = 'trigger' AND name LIKE 'comments_usage_%' ORDER BY name")).rows;
    assert.deepEqual(triggers.map((row) => row.name), [
      "comments_usage_after_delete",
      "comments_usage_after_insert",
      "comments_usage_after_status_change",
    ]);
  } finally {
    await client.close();
  }
});

test("concurrent comment writes enforce duplicate and capacity limits exactly once", async () => {
  const { client, db } = await migratedDatabase();
  try {
    const now = Date.now();
    await seedUser(client, { now });
    const target = { type: "post", slug: "site-friends" };
    const env = { MAX_COMMENTS_PER_USER: "4", MAX_COMMENTS_PER_TARGET: "6", MAX_TOTAL_COMMENTS: "8" };
    const results = await Promise.all(Array.from({ length: 20 }, (_, index) => insertCommentAtomically(db, {
      id: `comment-${index}`,
      userId: "member-1",
      role: "member",
      target,
      body: `body-${index}`,
      now: now + index,
    }, env).then(() => "created").catch((error) => error.code)));
    assert.equal(results.filter((value) => value === "created").length, 4);
    assert.equal(results.filter((value) => value === "comment_storage_limit").length, 16);

    const duplicateResults = await Promise.all(["a", "b"].map((suffix) => insertCommentAtomically(db, {
      id: `duplicate-${suffix}`,
      userId: "member-1",
      role: "member",
      target: { type: "post", slug: "site-about" },
      body: "same body",
      now: now + 100,
    }, { ...env, MAX_COMMENTS_PER_USER: "100" }).then(() => "created").catch((error) => error.code)));
    assert.deepEqual(duplicateResults.sort(), ["created", "duplicate_comment"]);

    const counts = (await client.execute(`SELECT
      (SELECT COUNT(*) FROM comments WHERE status != 'deleted') AS comments,
      (SELECT value FROM storage_counters WHERE metric = 'comments_created') AS stored_comments,
      (SELECT comments_created FROM account_usage WHERE user_id = 'member-1') AS account_comments,
      (SELECT active_comments FROM comment_target_usage WHERE content_type = 'post' AND content_slug = 'site-friends') AS target_comments`)).rows[0];
    assert.deepEqual(counts, { comments: 5, stored_comments: 5, account_comments: 5, target_comments: 4 });
  } finally {
    await client.close();
  }
});

test("comment aggregates distinguish hidden capacity from published statistics", async () => {
  const { client, db } = await migratedDatabase();
  try {
    const now = Date.now();
    await seedUser(client, { now });
    await insertCommentAtomically(db, {
      id: "visibility-comment",
      userId: "member-1",
      role: "member",
      target: { type: "post", slug: "site-about" },
      body: "visible",
      now,
    }, { MAX_COMMENTS_PER_USER: "10", MAX_COMMENTS_PER_TARGET: "10", MAX_TOTAL_COMMENTS: "10" });
    await client.execute({ sql: "UPDATE comments SET status = 'hidden', updated_at = ? WHERE id = 'visibility-comment'", args: [now + 1] });
    assert.deepEqual((await client.execute("SELECT active_comments, published_comments FROM comment_target_usage WHERE content_type = 'post' AND content_slug = 'site-about'")).rows, [{ active_comments: 1, published_comments: 0 }]);
    await client.execute({ sql: "UPDATE comments SET status = 'deleted', updated_at = ? WHERE id = 'visibility-comment'", args: [now + 2] });
    assert.deepEqual((await client.execute("SELECT active_comments, published_comments FROM comment_target_usage WHERE content_type = 'post' AND content_slug = 'site-about'")).rows, [{ active_comments: 0, published_comments: 0 }]);
  } finally {
    await client.close();
  }
});

test("maintenance reconciliation remains consistent with concurrent writes", async () => {
  const { client, db } = await migratedDatabase();
  try {
    const now = Date.now();
    await seedUser(client, { now });
    const writes = Array.from({ length: 24 }, (_, index) => insertCommentAtomically(db, {
      id: `maintenance-${index}`,
      userId: "member-1",
      role: "member",
      target: { type: "post", slug: "site-friends" },
      body: `maintenance-${index}`,
      now: now + index,
    }, { MAX_COMMENTS_PER_USER: "100", MAX_COMMENTS_PER_TARGET: "100", MAX_TOTAL_COMMENTS: "100" }));
    await Promise.all([...writes, reconcileRuntimeCounters(db, now + 1000)]);
    const counts = (await client.execute(`SELECT
      (SELECT COUNT(*) FROM comments WHERE status != 'deleted') AS comments,
      (SELECT value FROM storage_counters WHERE metric = 'comments_created') AS stored_comments,
      (SELECT comments_created FROM account_usage WHERE user_id = 'member-1') AS account_comments,
      (SELECT active_comments FROM comment_target_usage WHERE content_type = 'post' AND content_slug = 'site-friends') AS target_comments`)).rows[0];
    assert.deepEqual(counts, { comments: 24, stored_comments: 24, account_comments: 24, target_comments: 24 });
  } finally {
    await client.close();
  }
});

test("notification read receipts never move backwards", async () => {
  const { client, db } = await migratedDatabase();
  try {
    const now = Date.now();
    const user = await seedUser(client, { role: "admin", now });
    const future = now + 60 * 60 * 1000;
    await client.execute({
      sql: "UPDATE users SET notifications_seen_at = ?, admin_comments_seen_at = ?, updated_at = ? WHERE id = ?",
      args: [future, future, future, user.id],
    });
    for (const path of [["me", "notifications"], ["me", "admin-comments"]]) {
      const context = requestContext({
        path,
        method: "PATCH",
        db,
        currentUser: { ...user, notifications_seen_at: future, admin_comments_seen_at: future },
      });
      assert.equal((await onRequest(context)).status, 200);
      await context.settle();
    }
    assert.deepEqual((await client.execute("SELECT notifications_seen_at, admin_comments_seen_at, updated_at FROM users WHERE id = 'member-1'")).rows, [{
      notifications_seen_at: future,
      admin_comments_seen_at: future,
      updated_at: future,
    }]);
  } finally {
    await client.close();
  }
});

test("concurrent registrations map the unique username race to 409", async () => {
  const { client, db } = await migratedDatabase();
  const environment = { ADMIN_BOOTSTRAP_TOKEN: "test-bootstrap-token" };
  try {
    const setupContext = requestContext({
      path: ["admin", "setup"], method: "POST", db, currentUser: undefined, env: environment,
      body: { token: environment.ADMIN_BOOTSTRAP_TOKEN, username: "admin01", nickname: "管理员", password: "Admin123" },
    });
    assert.equal((await onRequest(setupContext)).status, 201);
    await setupContext.settle();
    const registrationContexts = Array.from({ length: 2 }, () => requestContext({
      path: ["auth", "register"], method: "POST", db, currentUser: undefined,
      body: { username: "racer01", nickname: "竞速用户", password: "Reader123" },
    }));
    const attempts = await Promise.all(registrationContexts.map((context) => onRequest(context)));
    await Promise.all(registrationContexts.map((context) => context.settle()));
    assert.deepEqual(attempts.map((response) => response.status).sort(), [201, 409]);
    assert.equal((await attempts.find((response) => response.status === 409).json()).code, "username_exists");
  } finally {
    await client.close();
  }
});

test("content stats query explicit generic targets without scanning comments", async () => {
  const { client, db: baseDb } = await migratedDatabase();
  const queries = [];
  const db = {
    prepare(sql) { queries.push(String(sql)); return baseDb.prepare(sql); },
    batch(statements) { return baseDb.batch(statements); },
  };
  try {
    const now = Date.now();
    await client.batch([
      { sql: "INSERT INTO content_metrics (content_type, content_slug, views, updated_at) VALUES ('essay', 'future-entry', 8, ?)", args: [now] },
      { sql: "INSERT INTO comment_target_usage (content_type, content_slug, active_comments, published_comments, updated_at) VALUES ('essay', 'future-entry', 4, 3, ?)", args: [now] },
    ], "write");
    const context = requestContext({ path: ["content", "stats"], db, currentUser: undefined, query: "?target=essay:future-entry" });
    const response = await onRequest(context);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).stats.essay["future-entry"], { views: 8, comments: 3 });
    assert.equal(queries.length, 1);
    assert.doesNotMatch(queries[0], /COUNT\(\*\).*comments/iu);
    assert.match(queries[0], /comment_target_usage/iu);
  } finally {
    await client.close();
  }
});
