import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { summarizeJavaScriptAssets } from "../scripts/check-performance-budget.mjs";

test("empty collection chunks reuse one settled request across interaction rerenders", async () => {
  const content = await import("../src/content/index.ts");
  const first = content.loadCollectionPageChunk("missing", 0);
  const second = content.loadCollectionPageChunk("missing", 0);
  assert.equal(first, second);
  assert.deepEqual(await first, []);
});

test("a cold detail entry resolves metadata and Markdown in two requests", async () => {
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

test("music intent preloads the same section and complete slug used by detail loading", async () => {
  const configPath = fileURLToPath(new URL("../fonscape.config.js", import.meta.url));
  const server = await createServer({
    root: fileURLToPath(new URL("../", import.meta.url)), configFile: false, appType: "custom",
    optimizeDeps: { noDiscovery: true }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "music-preload-fixture", transform(code, id) {
      if (id === configPath) return code.replace("export default siteConfig;", "export default { ...siteConfig, showMusic: true };");
    } }],
    server: { middlewareMode: true, ws: false, watch: null },
  });
  const originalFetch = globalThis.fetch;
  try {
    const { preloadRouteContent } = await server.ssrLoadModule("/src/appRoutes.tsx");
    const { loadMusicReview } = await server.ssrLoadModule("/src/content/index.ts");
    for (const [section, slug, route] of [
      ["songs", "nested/review", "/music/%73ongs/nested/review?from=search"],
      ["artists", "artist", "/music/artists/artist"],
      ["albums", "album", "/music/albums/album"],
    ]) {
      const requests = [];
      const metadataPath = `/fonscape/content/entries/music/${section}/${slug}.json`;
      const bodyPath = `/fonscape/content/bodies/music/${section}-${slug.replaceAll("/", "-")}.md`;
      globalThis.fetch = async (input) => {
        const path = String(input);
        requests.push(path);
        if (path === metadataPath) return Response.json({ key: `${section}/${slug}`, source: "music.md", body: bodyPath });
        if (path === bodyPath) return new Response(`---\ntitle: Music\nkind: 歌曲\nsection: ${section}\nslug: ${slug}\ndate: 2026-01-01\n---\nBody`);
        return new Response("not found", { status: 404 });
      };
      const entry = await preloadRouteContent(route);
      assert.deepEqual(requests, [metadataPath, bodyPath]);
      assert.equal(entry, await loadMusicReview(section, slug), "navigation reuses the prefetched entry");
      assert.equal(entry.slug, slug);
      assert.equal(requests.length, 2, "detail loading must not fetch the same entry again");
    }
  } finally {
    globalThis.fetch = originalFetch;
    await server.close();
  }
});

test("later featured chunks register their responsive image candidates before rendering", async () => {
  const { contentManifest } = await import("../functions/_generated/content-metadata.js");
  const { loadFeaturedChunk } = await import("../src/content/index.ts");
  const { responsiveImageProps, responsiveImageLqip } = await import("../src/responsiveImages.ts");
  const descriptor = contentManifest.collections.post;
  const previousCount = descriptor.featuredChunkCount;
  const originalFetch = globalThis.fetch;
  const source = "/assets/later-featured-regression.webp";
  const candidates = [{ src: "/small-featured.webp", width: 640 }, { src: "/large-featured.webp", width: 1600 }];
  try {
    descriptor.featuredChunkCount = 2;
    globalThis.fetch = async () => Response.json([{ slug: "ninth", image: source,
      responsiveImages: { [source]: { width: 2400, height: 1600, candidates, lqip: "data:image/webp;base64,placeholder" } },
    }]);
    const chunk = await loadFeaturedChunk("post", 1);
    assert.equal(chunk[0].image, source);
    assert.deepEqual(responsiveImageProps(source, "100vw"), {
      src: candidates[0].src, srcSet: "/small-featured.webp 640w, /large-featured.webp 1600w", sizes: "100vw",
    });
    assert.equal(responsiveImageLqip(source), "data:image/webp;base64,placeholder");
  } finally {
    descriptor.featuredChunkCount = previousCount;
    globalThis.fetch = originalFetch;
  }
});

test("the JavaScript budget inspects every asset and isolates the largest non-entry chunk", () => {
  const entry = { path: "/dist/assets/main.js", gzip: 100 };
  const article = { path: "/dist/assets/RichArticleContent.js", gzip: 75 };
  const dialog = { path: "/dist/assets/Dialogs.js", gzip: 12 };
  const summary = summarizeJavaScriptAssets([entry, article, dialog], entry.path);
  assert.deepEqual(summary.dynamicAssets, [article, dialog]);
  assert.equal(summary.largestDynamic, article);
});
