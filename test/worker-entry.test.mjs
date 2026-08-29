import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";
import worker, { audioAssetSizes, canonicalAudioPathname } from "../worker/index.js";

function executionContext() {
  return { waitUntil() {} };
}

async function repositoryAudioPaths(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      paths.push(...await repositoryAudioPaths(new URL(`${encodeURIComponent(entry.name)}/`, directory), relativePath));
    } else if (entry.isFile()) {
      paths.push(`/audio/${relativePath.split("/").map(encodeURIComponent).join("/")}`);
    }
  }
  return paths;
}

test("Worker routes API requests through the shared Cloudflare handler", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/api/not-a-real-route"),
    { ASSETS: { fetch: () => Promise.reject(new Error("API requests must not reach assets")) } },
    executionContext(),
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "接口不存在。", code: "not_found" });
});

test("Worker routes audio requests through the existing range handler", async () => {
  const bytes = new TextEncoder().encode("0123456789");
  let assetRequests = 0;
  const response = await worker.fetch(
    new Request("https://example.com/audio/example.mp3", { headers: { Range: "bytes=2-5" } }),
    {
      ASSETS: {
        fetch: async (request) => {
          assetRequests += 1;
          assert.equal(request.headers.has("Range"), false);
          return new Response(bytes, {
            headers: { "Content-Length": String(bytes.byteLength), "Content-Type": "audio/mpeg" },
          });
        },
      },
    },
    executionContext(),
  );

  assert.equal(response.status, 206);
  assert.equal(assetRequests, 1);
  assert.equal(response.headers.get("Content-Range"), "bytes 2-5/10");
  assert.equal(await response.text(), "2345");
});

test("Worker audio size metadata matches every repository audio asset", async () => {
  const audioDirectory = new URL("../public/audio/", import.meta.url);
  const audioPaths = (await repositoryAudioPaths(audioDirectory)).sort();

  assert.deepEqual(audioPaths, Object.keys(audioAssetSizes).sort());
  for (const [pathname, expectedSize] of Object.entries(audioAssetSizes)) {
    const metadata = await stat(new URL(`../public${pathname}`, import.meta.url));
    assert.equal(metadata.size, expectedSize, `${pathname} size metadata is stale`);
  }
});

test("Worker canonicalizes equivalent audio pathname escapes", () => {
  assert.equal(canonicalAudioPathname("/audio/%e9%9f%b3%e4%b9%90.mp3"), "/audio/%E9%9F%B3%E4%B9%90.mp3");
  assert.equal(canonicalAudioPathname("/audio/mix%20one.mp3"), "/audio/mix%20one.mp3");
});

test("Worker delegates non-dynamic paths to Static Assets unchanged", async () => {
  let receivedRequest;
  const response = await worker.fetch(
    new Request("https://example.com/posts?tag=开发", { headers: { Accept: "text/html" } }),
    {
      ASSETS: {
        fetch: async (request) => {
          receivedRequest = request;
          return new Response("spa-shell", { headers: { "Content-Type": "text/html" } });
        },
      },
    },
    executionContext(),
  );

  assert.equal(receivedRequest.url, "https://example.com/posts?tag=%E5%BC%80%E5%8F%91");
  assert.equal(receivedRequest.headers.get("Accept"), "text/html");
  assert.equal(await response.text(), "spa-shell");
});

test("Worker canonicalizes direct administrator browser routes", async () => {
  const environment = { ASSETS: { fetch: () => Promise.reject(new Error("administrator routes must redirect before assets")) } };
  const setup = await worker.fetch(new Request("https://example.com/admin/setup"), environment, executionContext());
  const setupSlash = await worker.fetch(new Request("https://example.com/admin/setup/"), environment, executionContext());
  const retired = await worker.fetch(new Request("https://example.com/admin"), environment, executionContext());
  const retiredChild = await worker.fetch(new Request("https://example.com/admin/comments"), environment, executionContext());

  assert.equal(setup.status, 302);
  assert.equal(setup.headers.get("Location"), "https://example.com/#/admin/setup");
  assert.equal(setupSlash.headers.get("Location"), "https://example.com/#/admin/setup");
  assert.equal(retired.headers.get("Location"), "https://example.com/#/");
  assert.equal(retiredChild.headers.get("Location"), "https://example.com/#/");
});

test("Worker runs database hygiene through its scheduled handler", async () => {
  const queries = [];
  const db = {
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...next) {
          values = next;
          return statement;
        },
        async run() {
          queries.push({ sql, values });
          return { meta: { changes: 2 } };
        },
      };
      return statement;
    },
    async batch(statements) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
  };

  await worker.scheduled({ scheduledTime: 123_456 }, { DB: db }, executionContext());
  assert.equal(queries.length, 8);
  assert.match(queries[0].sql, /DELETE FROM sessions/u);
  assert.match(queries[1].sql, /DELETE FROM rate_limits/u);
  assert.match(queries[5].sql, /DELETE FROM comment_target_usage/u);
  assert.match(queries[6].sql, /INSERT INTO comment_target_usage/u);
  assert.match(queries[7].sql, /avatar_bytes/u);
  assert.equal(queries[0].values[0], 123_456);
});

test("Wrangler config schedules weekly runtime reconciliation", async () => {
  const config = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  assert.deepEqual(config.triggers?.crons, ["17 3 * * SUN"]);
});
