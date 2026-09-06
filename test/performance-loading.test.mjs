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

  assert.doesNotMatch(routing, /startTransition/u);
  assert.match(routing, /setRoute\(nextRoute\);\s*setRouteQuery\(nextQuery\);/u);
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

test("primary routes commit the target hero before lazy body content uses the established reveal", async () => {
  const [app, routes, pages] = await Promise.all([
    readFile("src/App.jsx", "utf8"),
    readFile("src/appRoutes.jsx", "utf8"),
    Promise.all(["PostsPage", "PoemsPage", "MusicPage", "FriendsPage", "AboutPage"].map((name) => readFile(`src/pages/${name}.jsx`, "utf8"))),
  ]);

  assert.match(routes, /function PrimaryRoute/u);
  assert.match(routes, /<PageHero \{\.\.\.primaryRouteShells\[path\]\} \/>/u);
  assert.match(routes, /<PageHero \{\.\.\.primaryRouteShells\[path\]\} \/><Suspense fallback=\{null\}>\{children\}<\/Suspense>/u);
  assert.match(routes, /const loadPostsModule = \(\) => withFullAssets\(\(\) => import\("\.\/pages\/PostsPage\.jsx"\)\)/u);
  pages.forEach((page) => assert.doesNotMatch(page, /<PageHero/u));
  assert.doesNotMatch(app, /route-body-skeleton/u);
  assert.doesNotMatch(app, /route-loading-indicator|DialogLoading|正在打开/u);
});

test("empty collection chunks reuse one settled request across interaction rerenders", async () => {
  const content = await import("../src/content/index.js");
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

test("content image metadata travels with content and img src is never blocked", async () => {
  const [generator, content, hook, responsive, routes] = await Promise.all([
    readFile("scripts/generate-content-targets.mjs", "utf8"),
    readFile("src/content/index.js", "utf8"),
    readFile("src/useResponsiveImage.js", "utf8"),
    readFile("src/responsiveImages.ts", "utf8"),
    readFile("src/appRoutes.jsx", "utf8"),
  ]);

  assert.match(generator, /responsive-images-build\.json/u);
  assert.match(generator, /responsiveImages: responsiveImagesFor/u);
  assert.match(content, /registerResponsiveImages\(entry\?\.responsiveImages\)/u);
  assert.match(content, /registerResponsiveImages\(metadata\.responsiveImages\)/u);
  assert.match(hook, /return responsiveImageProps\(source, sizes\);/u);
  assert.doesNotMatch(hook, /src: undefined|useEffect|useState/u);
  assert.match(responsive, /const src = candidates\[0\]\?\.src \|\| source/u);
  assert.doesNotMatch(responsive, /responsive-images-full|import\(/u);
  assert.doesNotMatch(routes, /preloadResponsiveImageIndex/u);
});

test("collection pages render chunk zero and append later chunks serially while idle", async () => {
  const progressive = await readFile("src/useProgressiveCollection.js", "utf8");
  assert.match(progressive, /use\(loadCollectionPageChunk\(type, 0\)\)/u);
  assert.match(progressive, /let nextIndex = 1/u);
  assert.match(progressive, /await loadCollectionPageChunk\(type, nextIndex\)/u);
  assert.match(progressive, /requestIdleCallback\(loadNext/u);
  assert.doesNotMatch(progressive, /Promise\.all/u);
});

test("Markdown bodies stay out of the initial module and load in one detail response", async () => {
  const [contentIndex, generator] = await Promise.all([
    readFile("src/content/index.js", "utf8"),
    readFile("scripts/generate-content-targets.mjs", "utf8"),
  ]);
  assert.doesNotMatch(contentIndex, /import\.meta\.glob/u);
  assert.match(contentIndex, /const content = metadata\.content/u);
  assert.doesNotMatch(contentIndex, /fetch\(metadata\.body/u);
  assert.match(generator, /content: record\.raw/u);
  assert.match(generator, /CONTENT_PAGE_CHUNK_SIZE = 50/u);
  assert.match(generator, /extractLocalRasterSources/u);
});

test("a cold detail entry resolves metadata and Markdown with one request", async () => {
  const { loadContentEntry } = await import("../src/content/index.js");
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return new Response(JSON.stringify({
      key: "single-request",
      source: "src/content/posts/single-request.md",
      content: "---\ntitle: 单次请求\ndate: 2026-09-06\ncategory: 记录\n---\n\n正文。",
      responsiveImages: {},
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const entry = await loadContentEntry("post", "single-request");
    assert.equal(entry.title, "单次请求");
    assert.deepEqual(requests, ["/fonscape/content/entries/post/single-request.json"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("detail routes retain the final page container while lazy modules and content resolve", async () => {
  const [app, styles] = await Promise.all([
    readFile("src/App.jsx", "utf8"),
    readFile("src/styles/base.css", "utf8"),
  ]);
  assert.match(app, /function DetailRouteFallback/u);
  assert.match(app, /<Suspense fallback=\{isDetailRoute \? <DetailRouteFallback route=\{route\} \/> : null\}>/u);
  assert.match(app, /article-page\$\{music \? " music-detail-page" : ""\} material-panel page-width detail-route-pending/u);
  assert.match(styles, /\.route-view--detail \{ animation:route-view-in \.65s cubic-bezier\(\.16,1,\.3,1\) both; \}/u);
  assert.match(styles, /\.detail-route-pending \{ min-height:max\(440px,calc\(100vh - 180px\)\); \}/u);
});

test("the JavaScript budget inspects every asset and isolates the largest non-entry chunk", () => {
  const entry = { path: "/dist/assets/main.js", gzip: 100 };
  const article = { path: "/dist/assets/RichArticleContent.js", gzip: 75 };
  const dialog = { path: "/dist/assets/Dialogs.js", gzip: 12 };
  const summary = summarizeJavaScriptAssets([entry, article, dialog], entry.path);
  assert.deepEqual(summary.dynamicAssets, [article, dialog]);
  assert.equal(summary.largestDynamic, article);
});
