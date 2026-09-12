import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { createServer } from "vite";
import { FULL_PAGINATION_THRESHOLD, getVisiblePaginationPages } from "../src/pagination.js";

test("pagination shows every page through the five-page threshold", () => {
  assert.equal(FULL_PAGINATION_THRESHOLD, 5);
  assert.deepEqual(getVisiblePaginationPages(3, 5), [1, 2, 3, 4, 5]);
});

test("pagination compacts page lists once they exceed five pages", () => {
  assert.deepEqual(getVisiblePaginationPages(2, 6), [1, 2, 3, 6]);
  assert.deepEqual(getVisiblePaginationPages(5, 10), [1, 4, 5, 6, 10]);
  assert.deepEqual(getVisiblePaginationPages(9, 10), [1, 8, 9, 10]);
});

test("pagination scroll follows the reduced-motion preference", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/" });
  const originals = new Map();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const scrollIntoViewCalls = [];
  dom.window.matchMedia = (query) => ({
    matches: query.includes("prefers-reduced-motion: reduce"),
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; },
  });
  dom.window.setTimeout = (callback) => {
    callback();
    return 0;
  };
  dom.window.requestAnimationFrame = (callback) => {
    callback();
    return 0;
  };
  const server = await createServer({
    configFile: false,
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
    esbuild: { jsx: "automatic" },
    server: { middlewareMode: true, ws: false, watch: null },
  });
  let root;
  try {
    const { usePagination } = await server.ssrLoadModule("/src/hooks.js");
    function PaginationProbe() {
      const pagination = usePagination([1, 2, 3], 1, "test", "pagination");
      pagination.topRef.current = { scrollIntoView(options) { scrollIntoViewCalls.push(options); } };
      return createElement("button", { onClick: () => pagination.changePage(2) }, "下一页");
    }
    root = createRoot(dom.window.document.getElementById("root"));
    await act(async () => root.render(createElement(PaginationProbe)));
    const button = dom.window.document.querySelector("button");
    await act(async () => button.click());
    assert.deepEqual(scrollIntoViewCalls.at(-1), { behavior: "auto", block: "start" });
  } finally {
    if (root) await act(async () => root.unmount());
    await server.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
  }
});
