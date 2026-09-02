import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import { insertCommentAtomically, reconcileRuntimeCounters } from "../functions/_lib/abuse.js";
import { onRequest } from "../functions/api/[[path]].js";
import { sha256 } from "../functions/_lib/community.js";
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

function withD1TriggerChangeCount(db) {
  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      if (!String(sql).trimStart().startsWith("INSERT INTO comments")) return statement;
      return {
        bind(...values) {
          const bound = statement.bind(...values);
          return {
            async run() {
              const result = await bound.run();
              return { ...result, meta: { ...result.meta, changes: 4, rows_written: 4 } };
            },
          };
        },
      };
    },
    batch(statements) { return db.batch(statements); },
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
    const retiredDuplicateIndex = (await client.execute("SELECT name FROM sqlite_schema WHERE type = 'index' AND name = 'comments_duplicate_idx'")).rows;
    assert.deepEqual(retiredDuplicateIndex, []);
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

test("concurrent comment writes enforce capacity limits exactly once", async () => {
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

    const sameBodyResults = await Promise.all(["a", "b"].map((suffix) => insertCommentAtomically(db, {
      id: `same-body-${suffix}`,
      userId: "member-1",
      role: "member",
      target: { type: "post", slug: "site-about" },
      body: "same body",
      now: now + 100,
    }, { ...env, MAX_COMMENTS_PER_USER: "100" }).then(() => "created").catch((error) => error.code)));
    assert.deepEqual(sameBodyResults.sort(), ["created", "created"]);

    const counts = (await client.execute(`SELECT
      (SELECT COUNT(*) FROM comments WHERE status != 'deleted') AS comments,
      (SELECT value FROM storage_counters WHERE metric = 'comments_created') AS stored_comments,
      (SELECT comments_created FROM account_usage WHERE user_id = 'member-1') AS account_comments,
      (SELECT active_comments FROM comment_target_usage WHERE content_type = 'post' AND content_slug = 'site-friends') AS target_comments`)).rows[0];
    assert.deepEqual(counts, { comments: 6, stored_comments: 6, account_comments: 6, target_comments: 4 });
  } finally {
    await client.close();
  }
});

test("comment creation accepts D1 change counts that include trigger writes", async () => {
  const { client, db: baseDb } = await migratedDatabase();
  try {
    const now = Date.now();
    await seedUser(client, { now });
    const id = "d1-trigger-count";
    await insertCommentAtomically(withD1TriggerChangeCount(baseDb), {
      id,
      userId: "member-1",
      role: "member",
      target: { type: "post", slug: "site-about" },
      body: "written once",
      now,
    }, { MAX_COMMENTS_PER_USER: "10", MAX_COMMENTS_PER_TARGET: "10", MAX_TOTAL_COMMENTS: "10" });
    assert.equal((await client.execute({ sql: "SELECT COUNT(*) AS count FROM comments WHERE id = ?", args: [id] })).rows[0].count, 1);
  } finally {
    await client.close();
  }
});

test("comment mutation ids replay one completed write without consuming another rate window", async () => {
  const { client, db } = await migratedDatabase();
  try {
    const now = Date.now();
    const user = await seedUser(client, { now });
    const mutationId = "7d7e8b6d-34f1-4f49-9471-77d2a6070f73";
    const request = () => requestContext({
      path: ["comments"], method: "POST", db, currentUser: user,
      body: { type: "post", slug: "site-about", body: "只写入一次", clientMutationId: mutationId },
    });
    const first = request();
    const firstResponse = await onRequest(first);
    await first.settle();
    assert.equal(firstResponse.status, 201);
    const consumedAfterFirst = (await client.execute("SELECT COALESCE(SUM(count), 0) AS count FROM rate_limits")).rows[0].count;

    const replay = request();
    const replayResponse = await onRequest(replay);
    await replay.settle();
    assert.equal(replayResponse.status, 200);
    assert.equal((await replayResponse.json()).replayed, true);
    assert.equal((await client.execute({ sql: "SELECT COUNT(*) AS count FROM comments WHERE id = ?", args: [mutationId] })).rows[0].count, 1);
    assert.equal((await client.execute("SELECT COALESCE(SUM(count), 0) AS count FROM rate_limits")).rows[0].count, consumedAfterFirst);

    const conflict = requestContext({
      path: ["comments"], method: "POST", db, currentUser: user,
      body: { type: "post", slug: "site-about", body: "不同内容", clientMutationId: mutationId },
    });
    const conflictResponse = await onRequest(conflict);
    assert.equal(conflictResponse.status, 409);
    assert.equal((await conflictResponse.json()).code, "comment_mutation_conflict");
  } finally {
    await client.close();
  }
});

test("overlapping retries charge one mutation only once", async () => {
  const { client, db } = await migratedDatabase();
  try {
    const now = Date.now();
    const user = await seedUser(client, { now });
    const body = { type: "post", slug: "site-about", body: "并发重试只写一次", clientMutationId: "f4c0e348-0b79-4f52-8db3-d2c81ae4f8b2" };
    const contexts = [1, 2].map(() => requestContext({ path: ["comments"], method: "POST", db, currentUser: user, body }));
    const responses = await Promise.all(contexts.map(onRequest));
    await Promise.all(contexts.map((context) => context.settle()));
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 201]);
    assert.equal((await client.execute({ sql: "SELECT COUNT(*) AS count FROM comments WHERE id = ?", args: [body.clientMutationId] })).rows[0].count, 1);
    const secret = (await client.execute("SELECT rate_limit_secret FROM site_runtime WHERE id = 1")).rows[0].rate_limit_secret;
    const policyKeys = await Promise.all([
      ["user-10m", user.id, 10 * 60 * 1000],
      ["user-day", user.id, 24 * 60 * 60 * 1000],
      ["ip-10m", "local", 10 * 60 * 1000],
      ["global-hour", "global", 60 * 60 * 1000],
      ["global-day", "global", 24 * 60 * 60 * 1000],
    ].map(([scope, subject, windowMs]) => sha256(`${secret}:comment:${scope}:${windowMs}:${subject}`)));
    assert.equal((await client.execute({
      sql: `SELECT COALESCE(SUM(count), 0) AS count FROM rate_limits WHERE key IN (${policyKeys.map(() => "?").join(", ")})`,
      args: policyKeys,
    })).rows[0].count, 5);
  } finally {
    await client.close();
  }
});

test("a rejected comment mutation rolls back every partial rate-window charge", async () => {
  const { client, db } = await migratedDatabase();
  try {
    const now = Date.now();
    const user = await seedUser(client, { now });
    const environment = { COMMENT_USER_10M: "1" };
    const create = (id, body) => requestContext({
      path: ["comments"], method: "POST", db, currentUser: user, env: environment,
      body: { type: "post", slug: "site-about", body, clientMutationId: id },
    });
    const first = create("0f5d9be1-5d2b-48da-8ee3-2fb94c0a7e01", "先占用一个名额");
    assert.equal((await onRequest(first)).status, 201);
    await first.settle();
    const second = create("3f34dc4a-8e53-4d1c-9f16-f3e8169bf6f7", "应该被拒绝");
    const response = await onRequest(second);
    assert.equal(response.status, 429);
    assert.equal((await response.json()).code, "rate_limited");
    await second.settle();
    assert.equal((await client.execute({ sql: "SELECT COUNT(*) AS count FROM comments WHERE user_id = ?", args: [user.id] })).rows[0].count, 1);
    assert.equal((await client.execute("SELECT COUNT(*) AS count FROM comment_mutations")).rows[0].count, 1);
  } finally {
    await client.close();
  }
});

test("comment page pagination exposes every thread beyond the former 200 item boundary", async () => {
  const { client, db } = await migratedDatabase();
  try {
    const now = Date.now();
    await seedUser(client, { now });
    await Promise.all(Array.from({ length: 201 }, (_, index) => insertCommentAtomically(db, {
      id: `page-${String(index).padStart(3, "0")}`,
      userId: "member-1",
      role: "member",
      target: { type: "post", slug: "site-about" },
      body: `comment-${index}`,
      now: now + index,
    }, { MAX_COMMENTS_PER_USER: "300", MAX_COMMENTS_PER_TARGET: "300", MAX_TOTAL_COMMENTS: "300" })));

    const ids = new Set();
    let totalPages = 0;
    for (let page = 1; page <= (totalPages || 1); page += 1) {
      const query = `?type=post&slug=site-about&page=${page}`;
      const context = requestContext({ path: ["comments"], db, currentUser: undefined, query });
      const response = await onRequest(context);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.total, 201);
      assert.equal(body.page, page);
      assert.equal(body.pageSize, 20);
      totalPages = body.totalPages;
      assert.ok(body.comments.length <= body.pageSize);
      if (page === 1) assert.equal(body.comments[0].id, "page-200");
      if (page === 2) assert.equal(body.comments[0].id, "page-180");
      body.comments.forEach((comment) => ids.add(comment.id));
    }
    assert.equal(totalPages, 11);
    assert.equal(ids.size, 201);
    assert.equal(ids.has("page-000"), true);
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

test("published comment totals exclude replies whose parent is deleted", async () => {
  const { client, db } = await migratedDatabase();
  try {
    const now = Date.now();
    await seedUser(client, { now });
    await insertCommentAtomically(db, {
      id: "deleted-parent", userId: "member-1", role: "member",
      target: { type: "post", slug: "site-about" }, body: "父评论", now,
    }, { MAX_COMMENTS_PER_USER: "10", MAX_COMMENTS_PER_TARGET: "10", MAX_TOTAL_COMMENTS: "10" });
    await insertCommentAtomically(db, {
      id: "orphaned-reply", userId: "member-1", role: "member",
      target: { type: "post", slug: "site-about" }, body: "回复", parentId: "deleted-parent",
      replyToUserId: "member-1", replyToCommentId: "deleted-parent", now: now + 1,
    }, { MAX_COMMENTS_PER_USER: "10", MAX_COMMENTS_PER_TARGET: "10", MAX_TOTAL_COMMENTS: "10" });
    assert.equal((await client.execute("SELECT published_comments FROM comment_target_usage WHERE content_type = 'post' AND content_slug = 'site-about'")).rows[0].published_comments, 2);
    await client.execute({ sql: "UPDATE comments SET status = 'deleted', updated_at = ? WHERE id = 'deleted-parent'", args: [now + 2] });
    assert.equal((await client.execute("SELECT published_comments FROM comment_target_usage WHERE content_type = 'post' AND content_slug = 'site-about'")).rows[0].published_comments, 0);
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

test("reply notification receipts mark only the clicked message", async () => {
  const { client, db } = await migratedDatabase();
  try {
    const now = Date.now();
    const recipient = await seedUser(client, { id: "member-1", now });
    await seedUser(client, { id: "member-2", username: "writer02", nickname: "写作者", now });
    await insertCommentAtomically(db, {
      id: "reply-before-snapshot", userId: "member-2", role: "member",
      target: { type: "post", slug: "site-about" }, body: "第一条回复",
      replyToUserId: recipient.id, now: now + 1,
    }, { MAX_COMMENTS_PER_USER: "10", MAX_COMMENTS_PER_TARGET: "10", MAX_TOTAL_COMMENTS: "10" });
    await insertCommentAtomically(db, {
      id: "reply-after-snapshot", userId: "member-2", role: "member",
      target: { type: "post", slug: "site-about" }, body: "稍后到达的回复",
      replyToUserId: recipient.id, now: now + 2,
    }, { MAX_COMMENTS_PER_USER: "10", MAX_COMMENTS_PER_TARGET: "10", MAX_TOTAL_COMMENTS: "10" });
    const initialFeed = await onRequest(requestContext({ path: ["me", "replies"], db, currentUser: recipient }));
    const initial = await initialFeed.json();
    assert.deepEqual(initial.replies.map((item) => [item.id, item.unread]), [
      ["reply-after-snapshot", true],
      ["reply-before-snapshot", true],
    ]);
    assert.equal(Object.hasOwn(initial, "readThrough"), false);

    const receipt = requestContext({ path: ["me", "notifications", "reply-before-snapshot"], method: "PATCH", db, currentUser: recipient });
    assert.equal((await onRequest(receipt)).status, 200);
    await receipt.settle();
    const afterOne = await (await onRequest(requestContext({ path: ["me", "replies"], db, currentUser: recipient }))).json();
    assert.deepEqual(afterOne.replies.map((item) => [item.id, item.unread]), [
      ["reply-after-snapshot", true],
      ["reply-before-snapshot", false],
    ]);
    const sessionAfterOne = await (await onRequest(requestContext({ path: ["auth", "session"], db, currentUser: recipient }))).json();
    assert.equal(sessionAfterOne.user.unreadReplies, 1);

    const secondReceipt = requestContext({ path: ["me", "notifications", "reply-after-snapshot"], method: "PATCH", db, currentUser: recipient });
    assert.equal((await onRequest(secondReceipt)).status, 200);
    await secondReceipt.settle();
    const sessionAfterTwo = await (await onRequest(requestContext({ path: ["auth", "session"], db, currentUser: recipient }))).json();
    assert.equal(sessionAfterTwo.user.unreadReplies, 0);
    assert.deepEqual((await client.execute("SELECT user_id, comment_id FROM comment_notification_reads ORDER BY comment_id")).rows, [
      { user_id: recipient.id, comment_id: "reply-after-snapshot" },
      { user_id: recipient.id, comment_id: "reply-before-snapshot" },
    ]);
  } finally {
    await client.close();
  }
});

test("admin comment notification receipts are also per message", async () => {
  const { client, db } = await migratedDatabase();
  try {
    const now = Date.now();
    const admin = await seedUser(client, { id: "admin-1", username: "admin01", nickname: "管理员", role: "admin", now });
    await seedUser(client, { id: "member-1", now });
    for (const [id, body, offset] of [["admin-comment-old", "较早留言", 1], ["admin-comment-new", "较新留言", 2]]) {
      await insertCommentAtomically(db, {
        id, userId: "member-1", role: "member", target: { type: "post", slug: "site-friends" }, body, now: now + offset,
      }, { MAX_COMMENTS_PER_USER: "10", MAX_COMMENTS_PER_TARGET: "10", MAX_TOTAL_COMMENTS: "10" });
    }

    const initial = await (await onRequest(requestContext({ path: ["me", "admin-comments"], db, currentUser: admin }))).json();
    assert.deepEqual(initial.comments.map((item) => [item.id, item.unread]), [
      ["admin-comment-new", true],
      ["admin-comment-old", true],
    ]);
    const receipt = requestContext({ path: ["me", "admin-comments", "admin-comment-old"], method: "PATCH", db, currentUser: admin });
    assert.equal((await onRequest(receipt)).status, 200);
    await receipt.settle();
    const afterOne = await (await onRequest(requestContext({ path: ["me", "admin-comments"], db, currentUser: admin }))).json();
    assert.deepEqual(afterOne.comments.map((item) => [item.id, item.unread]), [
      ["admin-comment-new", true],
      ["admin-comment-old", false],
    ]);
    const session = await (await onRequest(requestContext({ path: ["auth", "session"], db, currentUser: admin }))).json();
    assert.equal(session.user.unreadAdminComments, 1);
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
