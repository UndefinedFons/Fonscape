import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { act, createElement, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { createServer } from "vite";

test("a failed later collection chunk preserves loaded items and retries the same chunk", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://fonscape.test/posts", pretendToBeVisual: true });
  const globals = new Map();
  const window = dom.window;
  window.requestIdleCallback = (callback) => window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 50 }), 0);
  window.cancelIdleCallback = (id) => window.clearTimeout(id);
  for (const [key, value] of Object.entries({ window, document: window.document, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const previousFetch = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  const server = await createServer({
    root: fileURLToPath(new URL("../", import.meta.url)),
    configFile: false,
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
    esbuild: { jsx: "automatic" },
    server: { middlewareMode: true, ws: false, watch: null },
  });
  let root;
  let originalChunkCount;
  try {
    const { contentManifest } = await server.ssrLoadModule("/functions/_generated/content-metadata.js");
    const postDescriptor = contentManifest.collections.post;
    originalChunkCount = postDescriptor.pageChunkCount;
    postDescriptor.pageChunkCount = 3;
    const { useProgressiveCollection } = await server.ssrLoadModule("/src/useProgressiveCollection.ts");
    const calls = [];
    let retryChunkAttempts = 0;
    globalThis.fetch = async (input) => {
      const path = String(input);
      calls.push(path);
      if (path.endsWith("/pages/post/0.json")) return Response.json([{ slug: "first" }]);
      if (path.endsWith("/pages/post/1.json")) {
        retryChunkAttempts += 1;
        if (retryChunkAttempts === 1) return new Response("temporary failure", { status: 503 });
        return Response.json([{ slug: "second" }]);
      }
      if (path.endsWith("/pages/post/2.json")) return Response.json([{ slug: "third" }]);
      return new Response("not found", { status: 404 });
    };

    function Probe() {
      const { items, error, retry } = useProgressiveCollection("post");
      return createElement("section", null,
        createElement("ul", null, items.map((item) => createElement("li", { key: item.slug }, item.slug))),
        error && createElement("div", { role: "alert" },
          createElement("span", null, "部分内容暂时无法加载"),
          createElement("button", { type: "button", onClick: retry }, "重试加载")));
    }

    root = createRoot(document.getElementById("root"));
    await act(async () => {
      root.render(createElement(Suspense, { fallback: createElement("p", null, "正在加载") }, createElement(Probe)));
    });
    await waitFor(() => assert.ok(document.querySelector('[role="alert"]')));
    assert.deepEqual([...document.querySelectorAll("li")].map((item) => item.textContent), ["first"]);
    assert.equal(retryChunkAttempts, 1, "the injected 503 fails the first request for chunk one");

    await act(async () => document.querySelector('[role="alert"] button').click());
    await waitFor(() => assert.deepEqual([...document.querySelectorAll("li")].map((item) => item.textContent), ["first", "second", "third"]));
    assert.equal(retryChunkAttempts, 2, "the retry requests chunk one again before advancing");
    assert.deepEqual(calls.map((path) => Number(path.match(/pages\/post\/(\d+)\.json/u)?.[1])), [0, 1, 1, 2]);
  } finally {
    if (root) await act(async () => root.unmount());
    if (originalChunkCount !== undefined) {
      const { contentManifest } = await server.ssrLoadModule("/functions/_generated/content-metadata.js");
      contentManifest.collections.post.pageChunkCount = originalChunkCount;
    }
    await server.close();
    dom.window.close();
    if (previousFetch) Object.defineProperty(globalThis, "fetch", previousFetch);
    else delete globalThis.fetch;
    for (const [key, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

async function waitFor(assertion, timeout = 3000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeout) {
    try {
      return assertion();
    } catch (error) {
      lastError = error;
    }
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  throw lastError || new Error("Timed out while waiting for progressive collection content.");
}
