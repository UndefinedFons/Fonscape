import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  cleanupRuntimeData,
  clientSubjects,
  consumeFixedWindow,
  consumeFixedWindowDecision,
  limitFromEnv,
  networkPrefix,
  protectAdminBootstrap,
  protectAvatar,
  protectComment,
  protectContentView,
  protectLogin,
  protectProfileUpdate,
  protectRegistration,
  rateLimitSecret,
  reconcileRuntimeCounters,
} from "../functions/_lib/abuse.js";
import { createTursoD1Database } from "../server/turso-d1.js";
import {
  ApiError,
  commentRow,
  constantTimeEqual,
  parseCookies,
  publicUser,
  readJson,
  readLimitedBody,
} from "../functions/_lib/community.js";

test("network scopes group IPv4 by /24 and IPv6 by /64", () => {
  assert.equal(networkPrefix("203.0.113.42"), "203.0.113.0/24");
  assert.equal(networkPrefix("2001:db8:abcd:12::99"), "2001:db8:abcd:12::/64");
  assert.equal(networkPrefix("not-an-address"), "unknown");
});

test("client identifiers prefer Cloudflare's connecting address", () => {
  const request = new Request("https://example.com/api/auth/register", {
    headers: { "CF-Connecting-IP": "203.0.113.9" },
  });
  assert.deepEqual(clientSubjects(request), {
    address: "203.0.113.9",
    network: "203.0.113.0/24",
  });
});

test("limit configuration rejects configured values outside its strict bounds", () => {
  assert.equal(limitFromEnv({ LIMIT: "12" }, "LIMIT", 5), 12);
  assert.equal(limitFromEnv({}, "LIMIT", 5), 5);
  assert.throws(() => limitFromEnv({ LIMIT: "0" }, "LIMIT", 5), (error) => error instanceof ApiError && error.code === "rate_limit_invalid");
  assert.throws(() => limitFromEnv({ LIMIT: "2.5" }, "LIMIT", 5), (error) => error instanceof ApiError && error.code === "rate_limit_invalid");
  assert.throws(() => limitFromEnv({ LIMIT: "1001" }, "LIMIT", 5), (error) => error instanceof ApiError && error.code === "rate_limit_invalid");
});

test("specific abuse limits are consumed before shared global capacity", async () => {
  async function consumedLimits(action) {
    const limits = [];
    const db = {
      prepare(sql) {
        let values = [];
        const statement = {
          bind(...next) {
            values = next;
            return statement;
          },
          async run() {
            if (sql.includes("SET rate_limit_secret")) {
              return { meta: { changes: 1 }, results: [{ rate_limit_secret: "a".repeat(64) }] };
            }
            limits.push(values.at(-1));
            return { meta: { changes: 1 }, results: [{ window_started_at: Date.now(), count: 1 }] };
          },
        };
        return statement;
      },
    };
    const context = {
      request: new Request("https://example.com/api/test", {
        headers: { "CF-Connecting-IP": "203.0.113.9" },
      }),
      env: { DB: db },
    };
    await action(context);
    return limits;
  }

  assert.deepEqual(await consumedLimits(protectRegistration), [3, 20, 100]);
  assert.deepEqual(await consumedLimits(protectAdminBootstrap), [5, 20]);
  assert.deepEqual(await consumedLimits((context) => protectLogin(context, "reader")), [10, 30, 500, 5000]);
  assert.deepEqual(await consumedLimits((context) => protectComment(
    context,
    { id: "member-1", role: "member" },
  )), [8, 60, 20, 500, 5000]);
  assert.deepEqual(await consumedLimits((context) => protectComment(
    context,
    { id: "admin-1", role: "admin" },
  )), []);
  assert.deepEqual(await consumedLimits((context) => protectAvatar(
    context,
    { id: "member-1" },
  )), [8, 30, 500]);
  assert.deepEqual(await consumedLimits((context) => protectProfileUpdate(
    context,
    { id: "member-1" },
  )), [20]);
  assert.deepEqual(await consumedLimits((context) => protectAvatar(
    context,
    { id: "admin-1", role: "admin" },
  )), []);
  assert.deepEqual(await consumedLimits((context) => protectProfileUpdate(
    context,
    { id: "admin-1", role: "admin" },
  )), []);
  assert.deepEqual(await consumedLimits(protectContentView), [10000]);
});

test("rate-limit secret is generated once in the database without an environment variable", async () => {
  const client = createClient({ url: ":memory:" });
  try {
    await client.execute("CREATE TABLE site_runtime (id INTEGER PRIMARY KEY, rate_limit_secret TEXT)");
    await client.execute("INSERT INTO site_runtime (id) VALUES (1)");
    const db = createTursoD1Database({ client });
    const contexts = Array.from({ length: 8 }, () => ({ env: { DB: db }, data: {} }));
    const secrets = await Promise.all(contexts.map((context) => rateLimitSecret(context)));
    assert.equal(new Set(secrets).size, 1);
    assert.match(secrets[0], /^[a-f0-9]{64}$/u);
    assert.equal((await client.execute("SELECT rate_limit_secret FROM site_runtime WHERE id = 1")).rows[0].rate_limit_secret, secrets[0]);
  } finally {
    await client.close();
  }
});

test("fixed-window limits block concurrent excess and reopen after the window", async () => {
  const client = createClient({ url: ":memory:" });
  try {
    await client.execute(`CREATE TABLE rate_limits (
      key TEXT PRIMARY KEY,
      window_started_at INTEGER NOT NULL,
      count INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
    const db = createTursoD1Database({ client });
    const attempts = await Promise.all(Array.from({ length: 8 }, () => (
      consumeFixedWindow(db, "comment:user:1", 3, 60_000, 1_000_000)
    )));
    assert.equal(attempts.filter(Boolean).length, 3);
    assert.equal(await consumeFixedWindow(db, "comment:user:1", 3, 60_000, 1_060_001), true);
  } finally {
    await client.close();
  }
});

test("fixed-window decisions expose remaining quota and the exact reset time", async () => {
  const client = createClient({ url: ":memory:" });
  try {
    await client.execute(`CREATE TABLE rate_limits (
      key TEXT PRIMARY KEY,
      window_started_at INTEGER NOT NULL,
      count INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
    const db = createTursoD1Database({ client });
    assert.deepEqual(await consumeFixedWindowDecision(db, "register:ip", 2, 10_000, 12_000), {
      allowed: true,
      limit: 2,
      remaining: 1,
      resetAt: 22_000,
      retryAfterSeconds: null,
    });
    assert.deepEqual(await consumeFixedWindowDecision(db, "register:ip", 2, 10_000, 15_250), {
      allowed: true,
      limit: 2,
      remaining: 0,
      resetAt: 22_000,
      retryAfterSeconds: null,
    });
    assert.deepEqual(await consumeFixedWindowDecision(db, "register:ip", 2, 10_000, 19_250), {
      allowed: false,
      limit: 2,
      remaining: 0,
      resetAt: 22_000,
      retryAfterSeconds: 3,
    });
  } finally {
    await client.close();
  }
});

test("runtime maintenance keeps request cleanup separate from counter reconciliation", async () => {
  const client = createClient({ url: ":memory:" });
  try {
    await client.execute("CREATE TABLE sessions (id_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)");
    await client.execute("CREATE TABLE rate_limits (key TEXT PRIMARY KEY, updated_at INTEGER NOT NULL)");
    await client.execute("CREATE TABLE users (id TEXT PRIMARY KEY, role TEXT NOT NULL)");
    await client.execute("CREATE TABLE comments (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, content_type TEXT NOT NULL, content_slug TEXT NOT NULL, parent_id TEXT, status TEXT NOT NULL)");
    await client.execute("CREATE TABLE account_usage (user_id TEXT PRIMARY KEY, comments_created INTEGER NOT NULL, updated_at INTEGER NOT NULL)");
    await client.execute("CREATE TABLE storage_counters (metric TEXT PRIMARY KEY, value INTEGER NOT NULL, updated_at INTEGER NOT NULL)");
    await client.execute("CREATE TABLE comment_target_usage (content_type TEXT NOT NULL, content_slug TEXT NOT NULL, active_comments INTEGER NOT NULL, published_comments INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (content_type, content_slug))");
    await client.execute("CREATE TABLE user_avatars (user_id TEXT PRIMARY KEY, byte_size INTEGER NOT NULL)");
    await client.batch([
      { sql: "INSERT INTO sessions VALUES (?, ?)", args: ["expired", 999] },
      { sql: "INSERT INTO sessions VALUES (?, ?)", args: ["active", 1_001] },
      { sql: "INSERT INTO rate_limits VALUES (?, ?)", args: ["stale", 1_000 - 9 * 86_400_000] },
      { sql: "INSERT INTO rate_limits VALUES (?, ?)", args: ["fresh", 1_000] },
      { sql: "INSERT INTO users VALUES (?, ?)", args: ["member-1", "member"] },
      { sql: "INSERT INTO comments VALUES (?, ?, ?, ?, ?, ?)", args: ["published", "member-1", "post", "example", null, "published"] },
      { sql: "INSERT INTO comments VALUES (?, ?, ?, ?, ?, ?)", args: ["deleted", "member-1", "post", "example", null, "deleted"] },
      { sql: "INSERT INTO account_usage VALUES (?, ?, ?)", args: ["member-1", 99, 0] },
    ], "write");
    const db = createTursoD1Database({ client });
    const cleanup = await cleanupRuntimeData(db, 1_000);
    assert.deepEqual(cleanup, { expiredSessions: 1, staleRateLimits: 1 });
    assert.deepEqual((await client.execute("SELECT id_hash FROM sessions ORDER BY id_hash")).rows, [{ id_hash: "active" }]);
    assert.deepEqual((await client.execute("SELECT key FROM rate_limits ORDER BY key")).rows, [{ key: "fresh" }]);
    assert.deepEqual((await client.execute("SELECT comments_created FROM account_usage")).rows, [{ comments_created: 99 }]);
    const reconciliation = await reconcileRuntimeCounters(db, 1_000);
    assert.deepEqual(reconciliation, { reconciledAccounts: 1 });
    assert.deepEqual((await client.execute("SELECT comments_created FROM account_usage")).rows, [{ comments_created: 1 }]);
    assert.deepEqual((await client.execute("SELECT content_type, content_slug, active_comments, published_comments FROM comment_target_usage")).rows, [{
      content_type: "post",
      content_slug: "example",
      active_comments: 1,
      published_comments: 1,
    }]);
    assert.deepEqual((await client.execute("SELECT metric, value FROM storage_counters ORDER BY metric")).rows, [
      { metric: "avatar_bytes", value: 0 },
      { metric: "comments_created", value: 1 },
      { metric: "member_accounts", value: 1 },
    ]);
  } finally {
    await client.close();
  }
});

test("bounded JSON parsing accepts small objects and rejects oversized bodies", async () => {
  const valid = new Request("https://example.com/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true }),
  });
  assert.deepEqual(await readJson(valid, 64), { ok: true });

  const oversized = new Request("https://example.com/api/test", {
    method: "POST",
    body: "x".repeat(65),
  });
  await assert.rejects(readLimitedBody(oversized, 64), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 413);
    return true;
  });
});

test("JSON request bodies must be objects", async () => {
  for (const body of ["null", "[]", "true", "42", "\"text\""]) {
    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    await assert.rejects(readJson(request), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 400);
      assert.equal(error.code, "invalid_json_object");
      return true;
    });
  }
});

test("malformed cookie encoding is ignored instead of throwing", () => {
  const cookies = parseCookies(new Request("https://example.com/api/auth/session", {
    headers: { Cookie: "fonscape_session=%; theme=night%20mode" },
  }));
  assert.equal(cookies.fonscape_session, undefined);
  assert.equal(cookies.theme, "night mode");
});

test("constant-time comparison has a portable Web Crypto fallback", async () => {
  assert.equal(await constantTimeEqual("same value", "same value"), true);
  assert.equal(await constantTimeEqual("same value", "different value"), false);
});

test("avatar URLs are emitted only when the avatar row belongs to that user", () => {
  const user = {
    id: "user-a",
    username: "a",
    nickname: "A",
    role: "member",
    status: "active",
    created_at: 1,
    avatar_updated_at: 123,
  };
  assert.equal(publicUser({ ...user, avatar_user_id: "user-b" }).avatarUrl, null);
  assert.equal(publicUser({ ...user, avatar_user_id: "user-a" }).avatarUrl, "/api/avatar/user-a?v=123");

  const comment = commentRow({
    id: "comment-a",
    user_id: "user-a",
    nickname: "A",
    user_role: "member",
    avatar_user_id: "user-b",
    avatar_updated_at: 123,
    body: "hello",
    status: "published",
    created_at: 1,
    updated_at: 1,
  });
  assert.equal(comment.author.avatarUrl, null);
});
