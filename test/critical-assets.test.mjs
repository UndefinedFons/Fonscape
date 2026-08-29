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

test("site metadata configuration is applied to the generated HTML", async () => {
  const { applySiteMetadata } = await import("../vite.config.mjs");
  const transformed = applySiteMetadata(await readFile("index.html", "utf8"), {
    language: "en",
    title: "Notes $& $1 & ideas",
    description: 'A $& $1 <small> site "description"',
  });
  assert.match(transformed, /<html lang="en">/u);
  assert.match(transformed, /<title>Notes \$&amp; \$1 &amp; ideas<\/title>/u);
  assert.match(transformed, /content="A \$&amp; \$1 &lt;small> site &quot;description&quot;"/u);
});

test("homepage and detail images use shared responsive candidates while retaining original fallbacks", async () => {
  const [config, cards, home, responsive, zoomable, richArticle, article, music, generator, player] = await Promise.all([
    readFile("vite.config.mjs", "utf8"),
    readFile("src/components/Cards.jsx", "utf8"),
    readFile("src/pages/HomePage.jsx", "utf8"),
    readFile("src/responsiveImages.ts", "utf8"),
    readFile("src/ZoomableImage.jsx", "utf8"),
    readFile("src/RichArticleContent.jsx", "utf8"),
    readFile("src/pages/ArticlePage.jsx", "utf8"),
    readFile("src/pages/MusicPage.jsx", "utf8"),
    readFile("scripts/generate-responsive-images.mjs", "utf8"),
    readFile("src/ArticleMusicPlayer.jsx", "utf8"),
  ]);

  assert.match(config, /homeFeaturedImage/u);
  assert.match(config, /post\?\.cardImage \|\| post\?\.image/u);
  assert.match(config, /imagesrcset=/u);
  assert.match(config, /if \(desktopImage && mobileImage\) \{\s*preloads\.push\(preloadImage\(mobileImage, \{ media: "\(max-width: 760px\)", intendedWidth: 960/u);
  assert.match(config, /preloads\.push\(preloadImage\(desktopImage, \{ media: "\(min-width: 761px\)", intendedWidth: 1600/u);
  assert.match(cards, /responsiveImageProps\(imageSource, sizes\)/u);
  assert.match(home, /responsiveImageProps\(post\.cardImage \|\| post\.image/u);
  assert.match(home, /responsiveImageProps\(authorProfile\.avatarSmall \|\| authorProfile\.avatar/u);
  assert.match(responsive, /srcSet:/u);
  assert.match(responsive, /candidates\.at\(-1\)\?\.src \|\| source/u);
  assert.match(zoomable, /responsiveImageProps\(src, sizes\)/u);
  assert.match(zoomable, /<img src=\{src\} alt=\{alt\} \/>/u);
  assert.match(responsive, /detailImageSizes = "\(max-width: 760px\) calc\(100vw - 68px\), min\(calc\(100vw - 116px\), 790px\)"/u);
  assert.match(richArticle, /sizes=\{detailImageSizes\}/u);
  assert.match(article, /sizes=\{detailImageSizes\}/u);
  assert.match(music, /responsiveImageProps\(review\.image,/u);
  assert.match(generator, /detail: \[384, 640, 960, 1280, 1600\]/u);
  assert.match(generator, /extractLocalRasterSources/u);
  assert.match(generator, /addTarget\(targets, post\.image, "detail"\)/u);
  assert.match(generator, /post\.musicBlocks/iu);
  assert.match(generator, /track\?\.cover/iu);
  assert.match(generator, /addTarget\(targets, entry\.image, "thumbnail"\)/u);
  assert.match(player, /responsiveImageProps\(track\.cover,/u);
});
