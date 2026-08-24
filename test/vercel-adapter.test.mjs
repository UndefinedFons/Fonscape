import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createVercelApiContext,
  handleVercelApiRequest,
  requestWithVercelClientAddress,
  vercelApiPath,
  vercelClientAddress,
} from "../api/fonscape.js";

test("Vercel adapter uses the first trusted forwarded address for existing abuse policies", () => {
  const request = new Request("https://example.test/api/comments", {
    headers: {
      "CF-Connecting-IP": "spoofed",
      "x-vercel-forwarded-for": " 2001:db8::1 , 10.0.0.1 ",
    },
  });
  assert.equal(vercelClientAddress(request), "2001:db8::1");
  const adapted = requestWithVercelClientAddress(request, { VERCEL: "1" });
  assert.equal(adapted.headers.get("CF-Connecting-IP"), "2001:db8::1");
  assert.equal(requestWithVercelClientAddress(request, {}).headers.get("CF-Connecting-IP"), "spoofed");
  assert.equal(vercelClientAddress(new Request("https://example.test", {
    headers: { "x-vercel-forwarded-for": "not-an-address" },
  })), "");
});

test("Vercel adapter translates catch-all API paths to Pages Function params", () => {
  assert.deepEqual(vercelApiPath(new Request("https://example.test/api/auth/session")), ["auth", "session"]);
  assert.deepEqual(vercelApiPath(new Request("https://example.test/api")), []);
  assert.deepEqual(vercelApiPath(new Request("https://example.test/api/avatar/user-1")), ["avatar", "user-1"]);
  assert.deepEqual(vercelApiPath(new Request("https://example.test/api/fonscape?path=admin%2Fsetup")), ["admin", "setup"]);
});

test("Vercel adapter delegates database-missing responses to the existing Pages handler", async () => {
  const response = await handleVercelApiRequest(
    new Request("https://example.test/api/auth/session"),
    { VERCEL: "1" },
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "评论服务尚未完成数据库配置。",
    code: "database_unavailable",
  });
});

test("Vercel adapter registers deferred maintenance through Vercel waitUntil", async () => {
  const key = Symbol.for("@vercel/request-context");
  const previous = globalThis[key];
  const pending = [];
  globalThis[key] = {
    get() {
      return { waitUntil(task) { pending.push(task); } };
    },
  };
  try {
    const context = createVercelApiContext(new Request("https://example.test/api/auth/session"), { VERCEL: "1" });
    context.waitUntil(Promise.resolve("complete"));
    assert.equal(pending.length, 1);
    await pending[0];
  } finally {
    if (previous === undefined) delete globalThis[key];
    else globalThis[key] = previous;
  }
});

test("Vercel redirects retired admin paths before the API-safe SPA fallback", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(config.framework, "vite");
  assert.equal(config.outputDirectory, "dist");
  assert.deepEqual(config.redirects, [
    { source: "/admin/setup", destination: "/#/admin/setup", statusCode: 302 },
    { source: "/admin/setup/", destination: "/#/admin/setup", statusCode: 302 },
    { source: "/admin", destination: "/", statusCode: 302 },
    { source: "/admin/:path*", destination: "/", statusCode: 302 },
  ]);
  assert.deepEqual(config.rewrites.slice(0, 2), [
    { source: "/api", destination: "/api/fonscape?path=" },
    { source: "/api/:path*", destination: "/api/fonscape?path=:path*" },
  ]);
  assert.equal(config.rewrites.length, 3);
  assert.match(config.rewrites.at(-1).source, /api/u);
  assert.doesNotMatch(config.rewrites.at(-1).source, /admin/u);
  assert.equal(config.rewrites.at(-1).destination, "/index.html");
});

test("Cloudflare Pages redirects every retired admin path to the blog home", async () => {
  const source = await readFile(new URL("../public/_redirects", import.meta.url), "utf8");
  assert.deepEqual(source.trim().split(/\r?\n/u), [
    "/admin/setup /#/admin/setup 302",
    "/admin/setup/ /#/admin/setup 302",
    "/admin / 302",
    "/admin/ / 302",
    "/admin/* / 302",
  ]);
});
