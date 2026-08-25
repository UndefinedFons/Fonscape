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
