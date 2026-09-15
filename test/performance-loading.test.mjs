import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { summarizeJavaScriptAssets } from "../scripts/check-performance-budget.mjs";

test("cold navigation separates hover, press and idle resource priority", async () => {
  const [app, routes, routing] = await Promise.all([
    readFile("src/App.jsx", "utf8"),
    readFile("src/appRoutes.jsx", "utf8"),
    readFile("src/useAppRouting.js", "utf8"),
  ]);

  assert.match(routing, /startTransition\(\(\) => \{\s*setRoute\(nextRoute\);\s*setRouteQuery\(nextQuery\);\s*\}\)/u);
  assert.match(app, /document\.addEventListener\("pointerover", preloadLinkedRoute/u);
  assert.match(app, /document\.addEventListener\("pointerdown", preloadLinkedRoute/u);
  assert.match(app, /document\.addEventListener\("focusin", preloadLinkedRoute/u);
  assert.match(app, /if \(!\("PointerEvent" in window\)\) document\.addEventListener\("touchstart"/u);
  assert.match(app, /strongIntent \? "high" : "low"/u);
  assert.match(app, /if \(strongIntent\) void preloadRouteContent\(path\)/u);
  assert.match(app, /preloadHeroAssets\(path, compact, "low"\);\s*scheduleNext\(\);/u);
  assert.doesNotMatch(app, /setTimeout\(scheduleNext, 12000\)/u);
  assert.match(routes, /loadCollectionPageChunk\("post", 0\)/u);
  assert.match(routes, /loadCollectionPageChunk\("poem", 0\)/u);
  assert.match(routes, /loadCollectionPageChunk\("music", 0\)/u);
});

test("empty collection chunks reuse one settled request across interaction rerenders", async () => {
  const content = await import("../src/content/index.ts");
  const first = content.loadCollectionPageChunk("missing", 0);
  const second = content.loadCollectionPageChunk("missing", 0);
  assert.equal(first, second);
  assert.deepEqual(await first, []);
});

test("cold dialogs show the final shell immediately and preserve original close animations", async () => {
  const [app, dialogs, account, styles, communityStyles] = await Promise.all([
    readFile("src/App.jsx", "utf8"),
    readFile("src/components/Dialogs.jsx", "utf8"),
    readFile("src/community/AccountDialog.jsx", "utf8"),
    readFile("src/styles/base.css", "utf8"),
    readFile("src/styles/community.css", "utf8"),
  ]);

  assert.match(app, /const DIALOG_CLOSE_DELAYS = \{ search: 240, settings: 260, account: 240 \}/u);
  assert.match(app, /<section className=\{`\$\{kind\}-dialog\$\{loadingShown \? " had-loading" : ""\}`\}/u);
  assert.match(app, /account && <button ref=\{accountCloseButton\} className="account-dialog-close"/u);
  assert.match(app, /<Suspense fallback=\{<DialogSkeleton kind="search" onShown=\{markLoadingShown\} \/>\}/u);
  assert.doesNotMatch(dialogs, /search-dialog-content|settings-dialog-content|dialog-content-reveal/u);
  assert.doesNotMatch(account, /account-dialog-content|dialog-content-reveal/u);
  assert.match(styles, /\.account-dialog\.had-loading>:not\(\.account-dialog-close\):not\(\.dialog-skeleton-content\) \{ animation:dialog-content-reveal \.2s ease-out both; \}/u);
  assert.match(styles, /\.dialog-skeleton-content--account \{ min-height:378px; \}/u);
  assert.match(styles, /\.dialog-backdrop\.is-closing \.search-dialog \{ animation:dialog-panel-out \.22s ease-in both; \}/u);
  assert.match(styles, /\.dialog-backdrop\.is-closing \.settings-dialog \{ animation:dialog-panel-out \.24s ease-in both; \}/u);
  assert.match(communityStyles, /\.account-backdrop\.is-closing \.account-dialog \{ animation:account-panel-out \.24s cubic-bezier\(\.4,0,1,1\) both; \}/u);
});

test("content image metadata reaches image props without blocking the original src", async () => {
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: false, appType: "custom", optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, ws: false, watch: null },
    plugins: [{ name: "image-content-fixture", enforce: "pre", transform(code, id) {
      if (id.endsWith("/functions/_generated/content-metadata.js")) return 'export const contentManifest = { collections: { fixture: { pageChunkCount: 1 } } };';
    } }],
  });
  const originalFetch = globalThis.fetch;
  const source = "/fixture-original.webp";
  const candidates = [{ src: "/fixture-small.webp", width: 480 }, { src: "/fixture-large.webp", width: 960 }];
  const metadata = { [source]: { width: 960, height: 640, candidates } };
  const calls = [];
  try {
    const content = await server.ssrLoadModule("/src/content/index.ts");
    const { responsiveImageProps } = await server.ssrLoadModule("/src/responsiveImages.ts");
    assert.equal(responsiveImageProps(source, "100vw").src, source);
    globalThis.fetch = async (url) => {
      calls.push(url);
      return new Response(JSON.stringify([{ slug: "fixture", responsiveImages: metadata }]));
    };
    await content.loadCollectionPageChunk("fixture", 0);
    assert.deepEqual(responsiveImageProps(source, "100vw"), {
      src: candidates[0].src, srcSet: "/fixture-small.webp 480w, /fixture-large.webp 960w", sizes: "100vw",
    });
    assert.equal(calls.length, 1);
    const detailSource = "/detail-original.webp";
    assert.equal(responsiveImageProps(detailSource, "100vw").src, detailSource);
    globalThis.fetch = async (url) => {
      calls.push(url);
      return url.endsWith(".md") ? new Response("body") : new Response(JSON.stringify({
        body: "/fixture.md", responsiveImages: { [detailSource]: metadata[source] },
      }));
    };
    await content.loadContentEntry("fixture", "detail");
    assert.equal(responsiveImageProps(detailSource, "100vw").src, candidates[0].src);
    assert.equal(calls.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
    await server.close();
  }
});

test("visible collection pages retain cards on failure, retry and abandon obsolete work", async () => {
  const { JSDOM } = await import("jsdom");
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { createServer } = await import("vite");
  const dom = new JSDOM('<div id="root"></div>');
  const originals = new Map();
  const calls = [];
  let resolveRetry;
  let resolveAbandoned;
  let failures = 1;
  const load = async (type, index) => {
    calls.push(index);
    if (!index) return [{ key: "newest", slug: "newest" }];
    if (index === 1 && failures-- > 0) throw new Error("offline");
    if (index === 1) return new Promise((resolve) => { resolveRetry = resolve; });
    if (index === 2) return new Promise((resolve) => { resolveAbandoned = resolve; });
    return [{ key: "last", slug: "last" }];
  };
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true, __collectionTestLoad: load })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const server = await createServer({
    configFile: false, appType: "custom", optimizeDeps: { noDiscovery: true },
    esbuild: { jsx: "automatic" }, server: { middlewareMode: true, ws: false, watch: null },
    plugins: [{ name: "collection-fixture", enforce: "pre", transform(code, id) {
      if (id.endsWith("/src/content/index.ts")) return 'export const loadCollectionPageChunk = globalThis.__collectionTestLoad;';
    } }],
  });
  const root = createRoot(document.getElementById("root"));
  try {
    const { useCollectionPage } = await server.ssrLoadModule("/src/useCollectionPage.ts");
    const { CollectionLoadStatus } = await server.ssrLoadModule("/src/components/CollectionLoadStatus.tsx");
    function Listing({ selection }) {
      const collection = useCollectionPage("post", selection);
      return createElement("section", null,
        createElement("output", null, collection.items.map(({ slug }) => slug).join(",")),
        createElement(CollectionLoadStatus, collection));
    }
    const render = (selection) => root.render(createElement(Listing, { selection }));
    await act(async () => { render([{ key: "newest", page: 0 }, { key: "middle", page: 1 }]); });
    assert.equal(document.querySelector("output").textContent, "newest");
    assert.match(document.querySelector('[role="status"]').textContent, /加载失败/u);
    assert.deepEqual(calls, [0, 1], "do not load unrelated chunks or silently skip failures");
    await act(async () => { document.querySelector("button").click(); document.querySelector("button").click(); });
    assert.equal(document.querySelector("button").disabled, true);
    assert.equal(document.querySelector("output").textContent, "newest", "retry retains available cards");
    assert.deepEqual(calls, [0, 1, 0, 1]);
    await act(async () => { resolveRetry([{ key: "middle", slug: "middle" }]); });
    assert.equal(document.querySelector("output").textContent, "newest,middle");
    assert.equal(document.querySelector('[role="status"]'), null);
    await act(async () => { render([{ key: "old", page: 2 }, { key: "last", page: 3 }]); });
    assert.equal(document.querySelector("output").textContent, "", "previous page must not appear as the new page");
    await act(async () => { render([{ key: "newest", page: 0 }]); });
    await act(async () => { resolveAbandoned([{ key: "old", slug: "old" }]); });
    assert.equal(document.querySelector("output").textContent, "newest");
    assert.ok(!calls.includes(3), "abandoned selection must not expand its remaining chunks");
  } finally {
    await act(async () => root.unmount());
    await server.close();
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("Markdown bodies stay out of the initial module and retain the 1.15.1 detail handoff", async () => {
  const [contentIndex, generator] = await Promise.all([
    readFile("src/content/index.ts", "utf8"),
    readFile("scripts/generate-content-targets.mjs", "utf8"),
  ]);
  assert.doesNotMatch(contentIndex, /import\.meta\.glob/u);
  assert.match(contentIndex, /fetch\(metadata\.body/u);
  assert.match(contentIndex, /const source = await response\.text\(\)/u);
  assert.match(generator, /body: `\/fonscape\/content\/bodies\//u);
  assert.match(generator, /files\.set\(`bodies\//u);
  assert.match(generator, /CONTENT_PAGE_CHUNK_SIZE = 50/u);
  assert.match(generator, /extractLocalRasterSources/u);
});

test("a cold detail entry resolves metadata and Markdown with the two 1.15.1 requests", async () => {
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

test("detail routes retain the original route animation while lazy modules and content resolve", async () => {
  const [app, styles] = await Promise.all([
    readFile("src/App.jsx", "utf8"),
    readFile("src/styles/base.css", "utf8"),
  ]);
  assert.doesNotMatch(app, /DetailRouteFallback|detail-route-pending|detail-route-stage/u);
  assert.match(app, /<div className=\{isDetailRoute \? "route-view route-view--detail" : "route-view"\} key=\{route\}>/u);
  assert.match(styles, /\.route-view--detail \{ animation:route-view-in \.65s cubic-bezier\(\.16,1,\.3,1\) both; \}/u);
  assert.doesNotMatch(styles, /detail-route-pending|detail-route-stage/u);
});

test("the JavaScript budget inspects every asset and isolates the largest non-entry chunk", () => {
  const entry = { path: "/dist/assets/main.js", gzip: 100 };
  const article = { path: "/dist/assets/RichArticleContent.js", gzip: 75 };
  const dialog = { path: "/dist/assets/Dialogs.js", gzip: 12 };
  const summary = summarizeJavaScriptAssets([entry, article, dialog], entry.path);
  assert.deepEqual(summary.dynamicAssets, [article, dialog]);
  assert.equal(summary.largestDynamic, article);
});
