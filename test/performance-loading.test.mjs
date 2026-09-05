import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { summarizeJavaScriptAssets } from "../scripts/check-performance-budget.mjs";

test("non-current hero artwork waits until navigation intent or sustained idle time", async () => {
  const app = await readFile("src/App.jsx", "utf8");

  assert.match(app, /document\.addEventListener\("pointerover", preloadLinkedRoute/u);
  assert.match(app, /document\.addEventListener\("touchstart", preloadLinkedRoute/u);
  assert.match(app, /window\.setTimeout\(scheduleNext, 12000\)/u);
  assert.match(app, /connection\?\.saveData/u);
  assert.match(app, /effectiveType/u);
  assert.doesNotMatch(app, /ROUTE_HERO_IMAGES|GLASS_BACKGROUND_IMAGES/u);
});

test("route and feature surfaces stay out of the initial module", async () => {
  const [app, routes, main, routing] = await Promise.all([
    readFile("src/App.jsx", "utf8"),
    readFile("src/appRoutes.jsx", "utf8"),
    readFile("src/main.jsx", "utf8"),
    readFile("src/useAppRouting.js", "utf8"),
  ]);

  assert.match(routes, /import\("\.\/pages\/ArticlePage\.jsx"\)/u);
  assert.match(routes, /loadRichArticleModule/u);
  assert.match(routes, /ensureFullFontStylesheet\(\)/u);
  assert.match(routes, /ensureFullResponsiveImages\(\)/u);
  assert.match(routes, /const withFullFonts = \(loader\) => Promise\.all/u);
  assert.match(routes, /const withFullAssets = \(loader\) => Promise\.all/u);
  assert.match(routes, /const loadPostsModule = \(\) => withFullAssets\(\(\) => import\("\.\/pages\/PostsPage\.jsx"\)\)/u);
  assert.match(routes, /const loadDialogsModule = \(\) => withFullFonts\(\(\) => import\("\.\/components\/Dialogs\.jsx"\)\)/u);
  assert.match(routes, /const loadAccountModule = \(\) => withFullFonts\(\(\) => import\("\.\/community\/AccountDialog\.jsx"\)\)/u);
  assert.match(routes, /const ArticlePage = lazy\(/u);
  assert.match(routes, /const SearchDialog = lazy\(/u);
  assert.match(routes, /const AccountDialog = lazy\(/u);
  assert.doesNotMatch(app, /import .*pages\/(?:ArticlePage|PostsPage|PoemsPage|PoemPage|MusicPage|AboutPage|FriendsPage|AdminSetupPage)\.jsx/u);
  assert.doesNotMatch(app, /import .*community\/AccountDialog\.jsx/u);
  assert.doesNotMatch(app, /import .*components\/Dialogs\.jsx/u);
  assert.match(routing, /startTransition\(\(\) =>/u);
  assert.doesNotMatch(app, /route-chunk-loading/u);
  assert.match(main, /React\.Suspense fallback=\{null\}/u);
  assert.match(main, /preloadRoute\(initialRoute\)/u);
});

test("navigation intent preloads the matching route module", async () => {
  const [app, routes] = await Promise.all([
    readFile("src/App.jsx", "utf8"),
    readFile("src/appRoutes.jsx", "utf8"),
  ]);

  assert.match(routes, /function routeModuleLoader\(path\)/u);
  assert.match(routes, /function preloadRouteModule\(path\)/u);
  assert.match(routes, /function preloadRouteContent\(path\)/u);
  assert.match(app, /preloadRouteModule\(path\)/u);
  assert.match(app, /preloadRouteContent\(path\)/u);
  assert.match(routes, /loadPost\(decodeRoutePath\(routePath\.slice\("\/post\/"\.length\)\)\)\.catch/u);
  assert.match(app, /document\.addEventListener\("focusin", preloadLinkedRoute\)/u);
  assert.match(app, /document\.addEventListener\("touchstart", preloadLinkedRoute/u);
});

test("listing surfaces can use smaller sources without changing detail artwork", async () => {
  const [cards, home, article] = await Promise.all([
    readFile("src/components/Cards.jsx", "utf8"),
    readFile("src/pages/HomePage.jsx", "utf8"),
    readFile("src/pages/ArticlePage.jsx", "utf8"),
  ]);

  assert.match(cards, /responsiveImageProps\(imageSource, sizes\)/u);
  assert.match(home, /responsiveImageProps\(post\.image/u);
  assert.match(home, /authorProfile\.avatarSmall \|\| authorProfile\.avatar/u);
  assert.match(article, /src=\{post\.image\}/u);
});

test("Markdown bodies stay out of the initial module and load only with their detail metadata", async () => {
  const [contentIndex, generator, article, poem, music] = await Promise.all([
    readFile("src/content/index.js", "utf8"),
    readFile("scripts/generate-content-targets.mjs", "utf8"),
    readFile("src/pages/ArticlePage.jsx", "utf8"),
    readFile("src/pages/PoemPage.jsx", "utf8"),
    readFile("src/pages/MusicPage.jsx", "utf8"),
  ]);

  assert.doesNotMatch(contentIndex, /import\.meta\.glob/u);
  assert.match(contentIndex, /export function loadContentEntry\(type, key/u);
  assert.match(contentIndex, /fetch\(metadata\.body/u);
  assert.match(contentIndex, /export function loadCollection\(type\)/u);
  assert.match(contentIndex, /export function loadPost\(slug\)/u);
  assert.match(contentIndex, /export function loadPoem\(slug\)/u);
  assert.match(contentIndex, /export function loadMusicReview\(section, slug\)/u);
  assert.match(generator, /content-metadata\.js/u);
  assert.match(generator, /CONTENT_PAGE_CHUNK_SIZE = 50/u);
  assert.match(generator, /parseGenericContentMetadata/u);
  assert.match(article, /loadPost\(slug\)/u);
  assert.match(poem, /loadPoem\(slug\)/u);
  assert.match(music, /loadMusicReview\(section, slug\)/u);
});

test("the JavaScript budget inspects every asset and isolates the largest non-entry chunk", () => {
  const entry = { path: "/dist/assets/main.js", gzip: 100 };
  const article = { path: "/dist/assets/RichArticleContent.js", gzip: 75 };
  const manifest = { path: "/dist/assets/responsive-images-full.js", gzip: 12 };
  const summary = summarizeJavaScriptAssets([entry, article, manifest], entry.path);

  assert.deepEqual(summary.dynamicAssets, [article, manifest]);
  assert.equal(summary.largestDynamic, article);
});
