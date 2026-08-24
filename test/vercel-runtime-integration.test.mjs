import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import { handleVercelApiRequest } from "../api/fonscape.js";
import { migrateTurso, readMigrations } from "../scripts/migrate-turso.mjs";
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
    ADMIN_BOOTSTRAP_TOKEN: "test-bootstrap-token-with-enough-entropy",
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
    const migrations = await readMigrations();
    const migration = await migrateTurso({ client, apply: true });
    assert.equal(migration.applied.length, migrations.length);

    const runtime = await request("/site/runtime");
    assert.equal(runtime.status, 200);
    assert.equal(Number.isFinite((await runtime.json()).launchedAt), true);

    const setupBefore = await request("/admin/setup");
    assert.equal(setupBefore.status, 200);
    assert.deepEqual(await setupBefore.json(), { initialized: false });

    const registrationBeforeSetup = await request("/auth/register", {
      method: "POST",
      body: { username: "earlyreader", nickname: "提前注册", password: "Reader123" },
    });
    assert.equal(registrationBeforeSetup.status, 403);
    assert.equal((await registrationBeforeSetup.json()).code, "registration_closed");

    const invalidBootstrap = await request("/admin/setup", {
      method: "POST",
      body: { token: "wrong-token", username: "invalidadmin", password: "Admin123" },
    });
    assert.equal(invalidBootstrap.status, 403);
    assert.equal((await invalidBootstrap.json()).code, "invalid_bootstrap_token");

    const bootstrapAttempts = await Promise.all(Array.from({ length: 4 }, (_, index) => request("/admin/setup", {
      method: "POST",
      body: {
        token: environment.ADMIN_BOOTSTRAP_TOKEN,
        username: `adminuser${index}`,
        nickname: `管理员${index}`,
        password: "Admin123",
      },
    })));
    const successfulBootstraps = bootstrapAttempts.filter((response) => response.status === 201);
    assert.equal(successfulBootstraps.length, 1);
    assert.deepEqual(bootstrapAttempts.filter((response) => response.status !== 201).map((response) => response.status), [409, 409, 409]);
    const bootstrap = successfulBootstraps[0];
    assert.equal(bootstrap.status, 201);
    const bootstrapUser = (await bootstrap.clone().json()).user;
    assert.equal(bootstrapUser.role, "admin");
    assert.match(bootstrapUser.nickname, /^管理员[0-3]$/u);
    const adminCookie = bootstrap.headers.get("Set-Cookie")?.split(";", 1)[0];
    assert.match(adminCookie || "", /^[a-z][a-z0-9_-]*_session=/u);

    const session = await request("/auth/session", { cookie: adminCookie });
    assert.equal(session.status, 200);
    assert.match((await session.json()).user.username, /^adminuser[0-3]$/u);

    const setupAfter = await request("/admin/setup");
    assert.deepEqual(await setupAfter.json(), { initialized: true });
    const retiredBootstrapRoute = await request("/auth/bootstrap-admin", {
      method: "POST",
      body: { token: environment.ADMIN_BOOTSTRAP_TOKEN, username: "retiredadmin", password: "Admin123" },
    });
    assert.equal(retiredBootstrapRoute.status, 404);
    environment.ADMIN_BOOTSTRAP_TOKEN = "a-different-token";
    const bootstrapAfterInitialization = await request("/admin/setup", {
      method: "POST",
      body: { token: environment.ADMIN_BOOTSTRAP_TOKEN, username: "anotheradmin", password: "Admin123" },
    });
    assert.equal(bootstrapAfterInitialization.status, 409);
    assert.equal((await bootstrapAfterInitialization.json()).code, "admin_already_initialized");

    await client.execute("UPDATE storage_counters SET value = 104857600 WHERE metric = 'avatar_bytes'");
    const fullAvatarStorage = await handleVercelApiRequest(new Request("https://example.test/api/me/avatar", {
      method: "POST",
      headers: {
        "Content-Type": "image/webp",
        Cookie: adminCookie,
        "x-vercel-forwarded-for": "203.0.113.9",
      },
      body: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
    }), environment);
    assert.equal(fullAvatarStorage.status, 503);
    assert.equal((await fullAvatarStorage.json()).code, "avatar_capacity_reached");
    await client.execute("UPDATE storage_counters SET value = 0 WHERE metric = 'avatar_bytes'");

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
    assert.match(memberCookie || "", /^[a-z][a-z0-9_-]*_session=/u);

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
