import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, use } from "react";
import { createRoot } from "react-dom/client";
import { createServer } from "vite";

test("detail pages retain their final container and usable return control through suspension", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/" });
  const originals = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let reducedMotion = false;
  dom.window.matchMedia = () => ({ matches: reducedMotion });
  const animations = [];
  dom.window.HTMLElement.prototype.animate = function (frames, options) {
    const record = { element: this, frames, options, cancelled: false };
    animations.push(record);
    return { cancel() { record.cancelled = true; } };
  };
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    return { height: this.querySelector('[role="status"]') ? 400 : 700 };
  };
  const server = await createServer({
    configFile: false, appType: "custom", optimizeDeps: { noDiscovery: true },
    esbuild: { jsx: "automatic" }, server: { middlewareMode: true, ws: false, watch: null },
  });
  let root;
  try {
    const { DetailPageFrame } = await server.ssrLoadModule("/src/components/RoutePageFrame.tsx");
    for (const [kind, reduce] of [["post", false], ["poem", false], ["music", false], ["poem", true]]) {
      reducedMotion = reduce;
      animations.length = 0;
      let resolve;
      const content = new Promise((done) => { resolve = done; });
      function Body() { return createElement(kind === "poem" ? "p" : "article", null, use(content)); }
      let returned = 0;
      root = createRoot(document.getElementById("root"));
      await act(async () => {
        root.render(createElement(DetailPageFrame, { kind, onReturn: () => { returned += 1; } }, createElement(Body)));
      });
      const frame = document.querySelector("main");
      const back = frame.querySelector("button");
      const surface = kind === "poem" ? frame.querySelector("article") : frame;
      assert.ok(surface.querySelector('[role="status"]'), "loading belongs inside the final content surface");
      assert.equal(document.querySelectorAll("main").length, 1);
      assert.ok(frame.classList.contains(kind === "poem" ? "poem-page" : "article-page"));
      assert.equal(frame.querySelector('[role="status"]').getAttribute("aria-label"), "正在加载内容");
      await act(async () => { back.click(); });
      assert.equal(returned, 1);
      await act(async () => { resolve("正文已到达"); });
      assert.equal(document.querySelector("main"), frame, "the final container must not be replaced");
      assert.equal(frame.querySelector("button"), back, "the return control must not be replaced");
      assert.equal(kind === "poem" ? frame.querySelector("article") : frame, surface, "the content surface must survive loading");
      assert.equal(frame.querySelector("article").textContent, "正文已到达");
      assert.equal(frame.querySelector('[role="status"]'), null);
      assert.equal(animations.length, reduce ? 0 : 2);
      if (!reduce) {
        assert.equal(animations[0].element, surface);
        assert.deepEqual(animations[0].frames.map(({ height }) => height), ["400px", "700px"]);
        assert.deepEqual(animations[1].frames, [{ opacity: 0 }, { opacity: 1 }]);
      }
      await act(async () => { root.unmount(); });
      root = null;
      assert.ok(animations.every(({ cancelled }) => cancelled), "unmount cancels transition resources");
    }
  } finally {
    if (root) await act(async () => { root.unmount(); });
    await server.close();
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
