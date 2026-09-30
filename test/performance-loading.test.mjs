import assert from "node:assert/strict";
import test from "node:test";
import { summarizeJavaScriptAssets } from "../scripts/check-performance-budget.mjs";

test("empty collection chunks reuse one settled request across interaction rerenders", async () => {
  const content = await import("../src/content/index.ts");
  const first = content.loadCollectionPageChunk("missing", 0);
  const second = content.loadCollectionPageChunk("missing", 0);
  assert.equal(first, second);
  assert.deepEqual(await first, []);
});

test("a cold detail entry resolves metadata and Markdown in two requests", async () => {
  const { loadContentEntry } = await import("../src/content/index.ts");
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    if (String(input).endsWith(".json")) {
      return new Response(JSON.stringify({
        key: "two-request",
        source: "src/content/posts/two-request.md",
        body: "/fonscape/content/bodies/post/two-request.md",
        responsiveImages: {},
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("---\ntitle: 两段请求\ndate: 2026-09-06\ncategory: 记录\n---\n\n正文。", { status: 200, headers: { "Content-Type": "text/markdown" } });
  };
  try {
    const entry = await loadContentEntry("post", "two-request");
    assert.equal(entry.title, "两段请求");
    assert.deepEqual(requests, [
      "/fonscape/content/entries/post/two-request.json",
      "/fonscape/content/bodies/post/two-request.md",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the JavaScript budget inspects every asset and isolates the largest non-entry chunk", () => {
  const entry = { path: "/dist/assets/main.js", gzip: 100 };
  const article = { path: "/dist/assets/RichArticleContent.js", gzip: 75 };
  const dialog = { path: "/dist/assets/Dialogs.js", gzip: 12 };
  const summary = summarizeJavaScriptAssets([entry, article, dialog], entry.path);
  assert.deepEqual(summary.dynamicAssets, [article, dialog]);
  assert.equal(summary.largestDynamic, article);
});
