import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("homepage fonts are inlined while the complete catalog loads only on demand", async () => {
  const index = await readFile("index.html", "utf8");
  const [fontCss, fullFontCss, app, { localizeGoogleFontStylesheet }] = await Promise.all([
    readFile("public/fonscape/google-fonts.css", "utf8"),
    readFile("public/fonscape/google-fonts-full.css", "utf8"),
    readFile("src/App.jsx", "utf8"),
    import("../vite.config.mjs"),
  ]);
  const transformed = localizeGoogleFontStylesheet(index);

  assert.match(transformed, /<style data-fonscape-critical-fonts>@font-face/u);
  assert.doesNotMatch(transformed, /google-fonts-full\.css/u);
  assert.doesNotMatch(transformed, /fonts\.googleapis\.com/u);
  assert.match(fontCss, /font-family:\s*'Noto Sans SC'/u);
  assert.match(fontCss, /font-family:\s*'Zen Maru Gothic'/u);
  assert.match(fullFontCss, /font-weight:\s*400/u);
  assert.match(fullFontCss, /font-weight:\s*500/u);
  assert.match(fullFontCss, /font-weight:\s*700/u);
  assert.match(app, /document\.createElement\("link"\)/u);
  assert.match(app, /href:\s*"\/fonscape\/google-fonts-full\.css"/u);
  assert.match(fontCss, /font-display:\s*swap/iu);
  assert.ok(fontCss.length < fullFontCss.length / 2, "首屏字体声明应明显小于完整字符目录");
});

test("homepage image candidates retain the explicit lightweight source", async () => {
  const [config, cards, home] = await Promise.all([
    readFile("vite.config.mjs", "utf8"),
    readFile("src/components/Cards.jsx", "utf8"),
    readFile("src/pages/HomePage.jsx", "utf8"),
  ]);

  assert.match(config, /homeFeaturedImage/u);
  assert.match(config, /post\?\.cardImage \|\| post\?\.image/u);
  assert.match(cards, /src=\{post\.cardImage \|\| post\.image\}/u);
  assert.doesNotMatch(cards, /srcSet=/u);
  assert.doesNotMatch(home, /srcSet=/u);
});
