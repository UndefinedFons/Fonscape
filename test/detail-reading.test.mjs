import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, Profiler } from "react";
import { createRoot } from "react-dom/client";
import { createServer } from "vite";
import { getDetailReadingTarget } from "../src/detailReading.ts";

test("detail routes expose the content region used by the shared reading progress", () => {
  assert.equal(getDetailReadingTarget("/post/example"), ".article-page .article-body");
  assert.equal(getDetailReadingTarget("/poem/example"), ".poem-page article");
  assert.equal(getDetailReadingTarget("/music/albums/example"), ".music-detail-page .article-detail");
  assert.equal(getDetailReadingTarget("/posts"), "");
  assert.equal(getDetailReadingTarget("/music"), "");
});

test("reading progress follows scrolling without re-rendering the header", async () => {
  const dom = new JSDOM('<div class="route-view"><main class="article-page"><div class="article-body"></div></main></div><div id="root"></div>', { url: "http://localhost/post/example" });
  const frames = new Map();
  let nextFrame = 0;
  const originals = new Map();
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class { observe() {} disconnect() {} },
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  dom.window.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
  dom.window.cancelAnimationFrame = (id) => frames.delete(id);
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  Object.defineProperty(dom.window, "innerHeight", { configurable: true, value: 800 });
  // The article body spans 1000px–3000px of the document.
  dom.window.document.querySelector(".article-body").getBoundingClientRect = () => ({ top: 1000 - dom.window.scrollY, bottom: 3000 - dom.window.scrollY });
  const flushFrames = () => act(() => {
    for (const [id, callback] of [...frames]) { frames.delete(id); callback(performance.now()); }
  });
  const scrollTo = async (y) => {
    dom.window.scrollY = y;
    dom.window.dispatchEvent(new dom.window.Event("scroll"));
    await flushFrames();
  };
  const server = await createServer({
    configFile: false, appType: "custom", optimizeDeps: { noDiscovery: true },
    esbuild: { jsx: "automatic" }, server: { middlewareMode: true, ws: false, watch: null },
  });
  let root;
  try {
    const { Header } = await server.ssrLoadModule("/src/components/Header.tsx");
    const noop = () => {};
    let commits = 0;
    root = createRoot(document.getElementById("root"));
    await act(async () => {
      root.render(createElement(Profiler, { id: "header", onRender: () => { commits += 1; } }, createElement(Header, {
        route: "/post/example", theme: "light", menuOpen: false, viewer: null, hasArticleOutline: false, articleOutlineOpen: false,
        onMenu: noop, onTheme: noop, onSearch: noop, onSearchIntent: noop, onSettings: noop, onSettingsIntent: noop,
        onAccount: noop, onAccountIntent: noop, onArticleOutline: noop, onCloseArticleOutline: noop,
      })));
    });
    await flushFrames();
    const capsule = document.querySelector(".header-center");
    const progress = () => [capsule.style.getPropertyValue("--article-reading-progress"), capsule.style.getPropertyValue("--article-reading-progress-opacity")];
    assert.deepEqual(progress(), ["0%", "0"]);
    const settledCommits = commits;

    // Progress starts once the body reaches the reading inset (96px) and ends at the body's last viewport.
    await scrollTo(904 + (2200 - 904) / 2);
    assert.deepEqual(progress(), ["50%", "1"]);
    await scrollTo(5000);
    assert.deepEqual(progress(), ["100%", "1"]);
    await scrollTo(0);
    assert.deepEqual(progress(), ["0%", "0"]);
    assert.equal(commits, settledCommits, "scrolling must not commit header renders");

    await act(async () => root.unmount());
    root = null;
    assert.deepEqual(progress(), ["", ""], "leaving the detail route clears the progress border");
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
