import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import { handleVercelApiRequest } from "../api/[...path].js";
import { migrateTurso } from "../scripts/migrate-turso.mjs";
import { createTursoD1Database } from "../server/turso-d1.js";

test("Vercel and Turso execute the shared auth and comment API end to end", async () => {
  const client = createClient({ url: ":memory:" });
  const requestContextKey = Symbol.for("@vercel/request-context");
  const previousRequestContext = globalThis[requestContextKey];
  const deferred = [];
  globalThis[requestContextKey] = {
    get() {
      return { waitUntil(task) { deferred.push(Promise.resolve(task)); } };
    },
  };

  const environment = {
    VERCEL: "1",
    DB: createTursoD1Database({ client }),
    ADMIN_USERNAME: "adminuser",
    ADMIN_BOOTSTRAP_TOKEN: "test-bootstrap-token-with-enough-entropy",
    RATE_LIMIT_SALT: "test-rate-limit-salt-with-enough-entropy",
  };
  const request = (path, { method = "GET", body, cookie } = {}) => {
    const headers = new Headers({ "x-vercel-forwarded-for": "203.0.113.9" });
    if (body !== undefined) headers.set("Content-Type", "application/json");
    if (cookie) headers.set("Cookie", cookie);
    return handleVercelApiRequest(new Request(`https://example.test/api${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), environment);
  };

  try {
    const migration = await migrateTurso({ client, apply: true });
    assert.equal(migration.applied.length, 15);

    const bootstrap = await request("/auth/bootstrap-admin", {
      method: "POST",
      body: {
        token: environment.ADMIN_BOOTSTRAP_TOKEN,
        username: environment.ADMIN_USERNAME,
        nickname: "管理员",
        password: "Admin123",
      },
    });
    assert.equal(bootstrap.status, 201);
    assert.equal((await bootstrap.clone().json()).user.role, "admin");
    const adminCookie = bootstrap.headers.get("Set-Cookie")?.split(";", 1)[0];
    assert.match(adminCookie || "", /^fonscape_session=/u);

    const session = await request("/auth/session", { cookie: adminCookie });
    assert.equal(session.status, 200);
    assert.equal((await session.json()).user.username, "adminuser");

    const registration = await request("/auth/register", {
      method: "POST",
      body: {
        username: "reader01",
        nickname: "读者",
        password: "Reader123",
      },
    });
    assert.equal(registration.status, 201);
    const memberCookie = registration.headers.get("Set-Cookie")?.split(";", 1)[0];
    assert.match(memberCookie || "", /^fonscape_session=/u);

    const comment = await request("/comments", {
      method: "POST",
      cookie: memberCookie,
      body: {
        type: "post",
        slug: "site-friends",
        body: "一条来自 Vercel 与 Turso 集成测试的普通评论。",
      },
    });
    assert.equal(comment.status, 201);
    const memberComment = await comment.clone().json();

    const adminComment = await request("/comments", {
      method: "POST",
      cookie: adminCookie,
      body: {
        type: "post",
        slug: "site-friends",
        body: "一条用于验证普通用户不能越权删除的管理员评论。",
      },
    });
    assert.equal(adminComment.status, 201);
    const adminCommentBody = await adminComment.clone().json();

    const comments = await request("/comments?type=post&slug=site-friends");
    assert.equal(comments.status, 200);
    assert.equal((await comments.json()).comments.length, 2);

    const forbiddenDelete = await request(`/comments/${adminCommentBody.comment.id}`, {
      method: "DELETE",
      cookie: memberCookie,
    });
    assert.equal(forbiddenDelete.status, 403);
    assert.equal((await forbiddenDelete.json()).code, "not_comment_owner");

    const adminDelete = await request(`/comments/${memberComment.comment.id}`, {
      method: "DELETE",
      cookie: adminCookie,
    });
    assert.equal(adminDelete.status, 200);
    assert.deepEqual(await adminDelete.json(), { ok: true });
    const deletedComment = await client.execute({
      sql: "SELECT body, status FROM comments WHERE id = ?",
      args: [memberComment.comment.id],
    });
    assert.deepEqual(deletedComment.rows, [{ body: "[已删除]", status: "deleted" }]);
    const counters = await client.execute("SELECT metric, value FROM storage_counters WHERE metric = 'comments_created'");
    assert.deepEqual(counters.rows, [{ metric: "comments_created", value: 1 }]);
    const memberUsage = await client.execute({
      sql: "SELECT comments_created FROM account_usage WHERE user_id = ?",
      args: [memberComment.comment.author.id],
    });
    assert.deepEqual(memberUsage.rows, [{ comments_created: 0 }]);

    const invalidJsonShape = await handleVercelApiRequest(new Request(
      "https://example.test/api/auth/login",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vercel-forwarded-for": "203.0.113.9",
        },
        body: "[]",
      },
    ), environment);
    assert.equal(invalidJsonShape.status, 400);
    assert.equal((await invalidJsonShape.json()).code, "invalid_json_object");

    await Promise.allSettled(deferred);
  } finally {
    await client.close();
    if (previousRequestContext === undefined) delete globalThis[requestContextKey];
    else globalThis[requestContextKey] = previousRequestContext;
  }
});
