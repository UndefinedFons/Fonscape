import assert from "node:assert/strict";
import test from "node:test";
import { onRequest } from "../functions/api/[[path]].js";

const admin = Object.freeze({
  id: "admin-1",
  username: "admin",
  nickname: "管理员",
  role: "admin",
  status: "active",
  created_at: 1,
});

const member = Object.freeze({
  id: "member-1",
  username: "reader",
  nickname: "读者",
  role: "member",
  status: "active",
  created_at: 1,
});

function compactSql(value) {
  return String(value).replace(/\s+/gu, " ").trim();
}

function createDb({ comment, profile, receivedComments = [], launchedAt = 1_700_000_000_000 } = {}) {
  const state = { comment: comment ? { ...comment } : null, profile: profile ? { ...profile } : null };
  const operations = [];

  function prepare(sql) {
    const query = compactSql(sql);
    let values = [];
    const statement = {
      query,
      bind(...next) {
        values = next;
        return statement;
      },
      async first() {
        operations.push({ kind: "first", query, values: [...values] });
        if (query === "SELECT user_id, status FROM comments WHERE id = ? LIMIT 1") {
          return state.comment ? { user_id: state.comment.user_id, status: state.comment.status } : null;
        }
        if (query.includes("WHERE u.id = ? AND u.status = 'active' LIMIT 1")) {
          return state.profile?.id === values[0] ? { ...state.profile } : null;
        }
        if (query === "SELECT launched_at FROM site_runtime WHERE id = 1 LIMIT 1") {
          return { launched_at: launchedAt };
        }
        return null;
      },
      async all() {
        operations.push({ kind: "all", query, values: [...values] });
        if (query.includes("WHERE c.user_id != ? AND c.parent_id IS NULL")) {
          return { results: receivedComments.map((row) => ({ ...row })) };
        }
        return { results: [] };
      },
      async run() {
        operations.push({ kind: "run", query, values: [...values] });
        if (query.includes("SET rate_limit_secret")) {
          return { meta: { changes: 1 }, results: [{ rate_limit_secret: "a".repeat(64) }] };
        }
        if (query.startsWith("INSERT INTO content_metrics") && query.endsWith("RETURNING views")) {
          return { meta: { changes: 1 }, results: [{ views: 7 }] };
        }
        if (query.startsWith("UPDATE comments SET body = '[已删除]', status = 'deleted'")) {
          if (state.comment?.status === "deleted") return { meta: { changes: 0 } };
          state.comment = {
            ...state.comment,
            body: "[已删除]",
            status: "deleted",
            moderated_at: values[1],
            moderated_by: values[2],
          };
        }
        return { meta: { changes: 1 } };
      },
    };
    return statement;
  }

  return {
    state,
    operations,
    db: {
      prepare,
      async batch(statements) {
        return Promise.all(statements.map((statement) => (
          /^(?:INSERT|UPDATE|DELETE)\b/u.test(statement.query)
            ? statement.run()
            : statement.all()
        )));
      },
    },
  };
}

function createContext(options) {
  const { path, method = "GET", db } = options;
  const currentUser = Object.hasOwn(options, "currentUser") ? options.currentUser : admin;
  const pending = [];
  return {
    request: new Request(`https://example.com/api/${path.join("/")}`, { method }),
    env: { DB: db },
    params: { path },
    data: currentUser === undefined ? {} : { currentUser },
    waitUntil(promise) {
      pending.push(promise);
    },
    async settle() {
      await Promise.all(pending);
    },
  };
}

test("malformed session cookies produce an anonymous response", async () => {
  const fake = createDb();
  const context = createContext({
    path: ["auth", "session"],
    currentUser: undefined,
    db: fake.db,
  });
  context.request = new Request("https://example.com/api/auth/session", {
    headers: { Cookie: "fonscape_session=%" },
  });

  const response = await onRequest(context);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { user: null });
});

test("site runtime exposes this installation's persisted launch time", async () => {
  const launchedAt = 1_787_246_400_000;
  const fake = createDb({ launchedAt });
  const response = await onRequest(createContext({
    path: ["site", "runtime"],
    currentUser: undefined,
    db: fake.db,
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { launchedAt });
  assert.equal(fake.operations.some((operation) => operation.query === "SELECT launched_at FROM site_runtime WHERE id = 1 LIMIT 1"), true);
});

test("successful protected writes expose their remaining rate-limit quota", async () => {
  const fake = createDb();
  const context = createContext({
    path: ["content", "view"],
    method: "POST",
    db: fake.db,
  });
  context.request = new Request("https://example.com/api/content/view", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "post", slug: "site-about" }),
  });

  const response = await onRequest(context);
  await context.settle();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.clone().json(), { type: "post", slug: "site-about", views: 7 });
  assert.equal(response.headers.get("RateLimit-Limit"), "10000");
  assert.equal(response.headers.get("RateLimit-Remaining"), "9999");
  assert.match(response.headers.get("RateLimit-Reset"), /^\d+$/u);
  assert.equal(fake.operations.filter((operation) => operation.query.startsWith("INSERT INTO rate_limits") && operation.values.at(-1) === 10000).length, 1);
  assert.equal(fake.operations.some((operation) => operation.query.startsWith("SELECT views FROM content_metrics")), false);
});

test("blocked protected writes report their retry window", async () => {
  const now = Date.now();
  const db = {
    prepare(sql) {
      const statement = {
        bind() { return statement; },
        async run() {
          if (sql.includes("SET rate_limit_secret")) {
            return { meta: { changes: 1 }, results: [{ rate_limit_secret: "a".repeat(64) }] };
          }
          return { meta: { changes: 0 }, results: [] };
        },
        async first() {
          return sql.startsWith("SELECT window_started_at, count FROM rate_limits")
            ? { window_started_at: now, count: 10000 }
            : null;
        },
      };
      return statement;
    },
  };
  const context = createContext({
    path: ["content", "view"],
    method: "POST",
    db,
  });
  context.request = new Request("https://example.com/api/content/view", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "post", slug: "site-about" }),
  });

  const response = await onRequest(context);

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("RateLimit-Limit"), "10000");
  assert.equal(response.headers.get("RateLimit-Remaining"), "0");
  assert.match(response.headers.get("RateLimit-Reset"), /^\d+$/u);
  assert.match(response.headers.get("Retry-After"), /^\d+$/u);
});

test("public profile reads the current nickname and versioned avatar for a linked account", async () => {
  const fake = createDb({
    profile: {
      id: member.id,
      nickname: "旧昵称",
      avatar_user_id: member.id,
      avatar_updated_at: 123,
    },
  });
  const firstResponse = await onRequest(createContext({
    path: ["profile", member.id],
    currentUser: undefined,
    db: fake.db,
  }));
  assert.equal(firstResponse.status, 200);
  assert.deepEqual(await firstResponse.json(), {
    profile: {
      id: member.id,
      nickname: "旧昵称",
      avatarUrl: `/api/avatar/${member.id}?v=123`,
    },
  });

  fake.state.profile.nickname = "新昵称";
  const updatedResponse = await onRequest(createContext({
    path: ["profile", member.id],
    currentUser: undefined,
    db: fake.db,
  }));
  assert.equal(updatedResponse.status, 200);
  assert.equal((await updatedResponse.json()).profile.nickname, "新昵称");
});

test("retired backend routes are unavailable even to an administrator", async () => {
  const fake = createDb();
  const routes = [
    { method: "GET", path: ["admin", "overview"] },
    { method: "GET", path: ["admin", "comments"] },
    { method: "DELETE", path: ["admin", "comments", "comment-1"] },
    { method: "GET", path: ["admin", "users"] },
    { method: "PATCH", path: ["admin", "users", "member-1"] },
    { method: "GET", path: ["admin", "friend-applications"] },
    { method: "PATCH", path: ["admin", "friend-applications", "application-1"] },
    { method: "DELETE", path: ["admin", "friend-links"] },
    { method: "GET", path: ["articles", "stats"] },
    { method: "POST", path: ["articles", "example", "view"] },
    { method: "PATCH", path: ["me", "notifications"] },
    { method: "PATCH", path: ["me", "admin-comments"] },
  ];

  for (const { method, path } of routes) {
    const response = await onRequest(createContext({ path, method, db: fake.db }));
    assert.equal(response.status, 404, path.join("/"));
    assert.equal((await response.json()).code, "not_found");
  }
  assert.equal(fake.operations.length, 0);
});

test("a member cannot mark an administrator notification as read", async () => {
  const fake = createDb();
  const response = await onRequest(createContext({
    path: ["me", "admin-comments", "comment-1"],
    method: "PATCH",
    currentUser: member,
    db: fake.db,
  }));

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "admin_required");
  assert.equal(fake.operations.length, 0);
});

test("a member cannot read the administrator received-comments feed", async () => {
  const fake = createDb();
  const response = await onRequest(createContext({
    path: ["me", "admin-comments"],
    currentUser: member,
    db: fake.db,
  }));

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "admin_required");
  assert.equal(fake.operations.length, 0);
});

test("the administrator received-comments feed remains available", async () => {
  const fake = createDb({
    receivedComments: [{
      id: "comment-1",
      user_id: member.id,
      nickname: member.nickname,
      user_role: member.role,
      parent_id: null,
      reply_to_user_id: null,
      body: "一条留言",
      status: "published",
      created_at: 2,
      updated_at: 2,
    }],
  });
  const response = await onRequest(createContext({
    path: ["me", "admin-comments"],
    db: fake.db,
  }));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.comments.length, 1);
  assert.equal(body.comments[0].canDelete, true);
});

test("a member cannot delete another user's comment", async () => {
  const fake = createDb({ comment: { id: "comment-1", user_id: "member-2", status: "published" } });
  const context = createContext({
    path: ["comments", "comment-1"],
    method: "DELETE",
    currentUser: member,
    db: fake.db,
  });
  const response = await onRequest(context);
  await context.settle();

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "not_comment_owner");
  assert.equal(fake.state.comment.status, "published");
  assert.equal(fake.operations.some((operation) => operation.query.startsWith("INSERT INTO rate_limits")), false);
});

test("an administrator can delete any comment through the shared comment endpoint", async () => {
  const fake = createDb({ comment: { id: "comment-1", user_id: member.id, status: "published" } });
  const context = createContext({
    path: ["comments", "comment-1"],
    method: "DELETE",
    db: fake.db,
  });
  const response = await onRequest(context);
  await context.settle();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(fake.state.comment.status, "deleted");
  assert.equal(fake.state.comment.body, "[已删除]");
  assert.equal(fake.state.comment.moderated_by, admin.id);
});

test("deleting an already deleted comment is idempotent", async () => {
  const fake = createDb({ comment: { id: "comment-1", user_id: member.id, body: "[已删除]", status: "deleted" } });
  const context = createContext({
    path: ["comments", "comment-1"],
    method: "DELETE",
    currentUser: member,
    db: fake.db,
  });
  const response = await onRequest(context);
  await context.settle();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(fake.operations.some((operation) => operation.query.startsWith("UPDATE storage_counters")), false);
});
