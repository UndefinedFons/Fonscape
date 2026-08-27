import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
  const [app, main] = await Promise.all([
    readFile("src/App.jsx", "utf8"),
    readFile("src/main.jsx", "utf8"),
  ]);

  assert.match(app, /import\("\.\/pages\/ArticlePage\.jsx"\)/u);
  assert.match(app, /loadRichArticleModule/u);
  assert.match(app, /ensureFullFontStylesheet\(\)/u);
  assert.match(app, /const withFullFonts = \(loader\) => Promise\.all/u);
  assert.match(app, /const loadPostsModule = \(\) => withFullFonts\(\(\) => import\("\.\/pages\/PostsPage\.jsx"\)\)/u);
  assert.match(app, /const loadDialogsModule = \(\) => withFullFonts\(\(\) => import\("\.\/components\/Dialogs\.jsx"\)\)/u);
  assert.match(app, /const loadAccountModule = \(\) => withFullFonts\(\(\) => import\("\.\/community\/AccountDialog\.jsx"\)\)/u);
  assert.match(app, /const ArticlePage = lazy\(/u);
  assert.match(app, /const SearchDialog = lazy\(/u);
  assert.match(app, /const AccountDialog = lazy\(/u);
  assert.doesNotMatch(app, /import .*pages\/(?:ArticlePage|PostsPage|PoemsPage|PoemPage|MusicPage|AboutPage|FriendsPage|AdminSetupPage)\.jsx/u);
  assert.doesNotMatch(app, /import .*community\/AccountDialog\.jsx/u);
  assert.doesNotMatch(app, /import .*components\/Dialogs\.jsx/u);
  assert.match(app, /startTransition\(\(\) =>/u);
  assert.doesNotMatch(app, /route-chunk-loading/u);
  assert.match(main, /React\.Suspense fallback=\{null\}/u);
  assert.match(main, /preloadRoute\(initialRoute\)/u);
});

test("navigation intent preloads the matching route module", async () => {
  const app = await readFile("src/App.jsx", "utf8");

  assert.match(app, /function routeModuleLoader\(path\)/u);
  assert.match(app, /function preloadRouteModule\(path\)/u);
  assert.match(app, /function preloadRouteContent\(path\)/u);
  assert.match(app, /preloadRouteModule\(path\)/u);
  assert.match(app, /preloadRouteContent\(path\)/u);
  assert.match(app, /loadPost\(decode\(routePath\.slice\("\/post\/"\.length\)\)\)\.catch/u);
  assert.match(app, /document\.addEventListener\("focusin", preloadLinkedRoute\)/u);
  assert.match(app, /document\.addEventListener\("touchstart", preloadLinkedRoute/u);
});

test("listing surfaces can use smaller sources without changing detail artwork", async () => {
  const [cards, home, article] = await Promise.all([
    readFile("src/components/Cards.jsx", "utf8"),
    readFile("src/pages/HomePage.jsx", "utf8"),
    readFile("src/pages/ArticlePage.jsx", "utf8"),
  ]);

  assert.match(cards, /src=\{post\.cardImage \|\| post\.image\}/u);
  assert.match(home, /src=\{post\.cardImage \|\| post\.image\}/u);
  assert.match(home, /authorProfile\.avatarSmall \|\| authorProfile\.avatar/u);
  assert.match(article, /src=\{post\.image\}/u);
});

test("Markdown bodies stay out of the initial module and detail loaders remain available", async () => {
  const [contentIndex, generator, article, poem, music] = await Promise.all([
    readFile("src/content/index.js", "utf8"),
    readFile("scripts/generate-content-targets.mjs", "utf8"),
    readFile("src/pages/ArticlePage.jsx", "utf8"),
    readFile("src/pages/PoemPage.jsx", "utf8"),
    readFile("src/pages/MusicPage.jsx", "utf8"),
  ]);

  assert.match(contentIndex, /import\.meta\.glob\("\.\/posts\/\*\*\/\*\.md",\s*\{[\s\S]*?query: "\?raw"/u);
  assert.match(contentIndex, /export function loadPost\(slug\)/u);
  assert.match(contentIndex, /export function loadPoem\(slug\)/u);
  assert.match(contentIndex, /export function loadMusicReview\(section, slug\)/u);
  assert.doesNotMatch(contentIndex, /eager:\s*true/u);
  assert.match(generator, /content-metadata\.js/u);
  assert.match(generator, /parsePostMetadata/u);
  assert.match(article, /loadPost\(post\.slug\)/u);
  assert.match(poem, /loadPoem\(poem\.slug\)/u);
  assert.match(music, /loadMusicReview\(section, review\.slug\)/u);
});

test("the check command enforces static contracts across core JavaScript boundaries", async () => {
  const [packageSource, tsconfigSource] = await Promise.all([
    readFile("package.json", "utf8"),
    readFile("tsconfig.json", "utf8"),
  ]);
  const packageJson = JSON.parse(packageSource);
  const tsconfig = JSON.parse(tsconfigSource);

  assert.equal(packageJson.scripts.typecheck, "tsc -p tsconfig.json");
  assert.match(packageJson.scripts.check, /pnpm typecheck/u);
  assert.equal(tsconfig.compilerOptions.allowJs, true);
  assert.equal(tsconfig.compilerOptions.checkJs, true);
  assert.equal(tsconfig.compilerOptions.strict, true);
  assert.equal(tsconfig.compilerOptions.noEmit, true);
});

test("the production check enforces an initial-load performance budget", async () => {
  const [packageSource, budgetSource] = await Promise.all([
    readFile("package.json", "utf8"),
    readFile("scripts/check-performance-budget.mjs", "utf8"),
  ]);

  assert.match(packageSource, /vite build && pnpm check:performance-budget/u);
  assert.match(budgetSource, /ENTRY_JAVASCRIPT_GZIP_LIMIT/u);
  assert.match(budgetSource, /ENTRY_CSS_GZIP_LIMIT/u);
  assert.match(budgetSource, /ENTRY_HTML_GZIP_LIMIT/u);
  assert.match(budgetSource, /LOCAL_FONT_CSS_GZIP_LIMIT/u);
  assert.match(budgetSource, /FULL_FONT_CSS_GZIP_LIMIT/u);
  assert.match(budgetSource, /HIGH_PRIORITY_IMAGE_LIMIT/u);
});
