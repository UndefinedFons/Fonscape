import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import test from "node:test";
import {
  CONTENT_INDEX_CHUNK_SIZE,
  CONTENT_PAGE_CHUNK_SIZE,
  HOME_FEATURED_CHUNK_SIZE,
  HOME_LATEST_LIMIT,
  buildContentDistribution,
  collectMetingLibraryTargets,
  collectMetingSongTargets,
  resolveCollectionDefinitions,
} from "../scripts/generate-content-targets.mjs";
import { sortMusicLibrary } from "../src/pages/musicContent.ts";

const types = ["post", "poem", "music"];

function record(type, index) {
  const slug = `${type}-${String(index).padStart(5, "0")}`;
  const date = new Date(Date.UTC(2020, 0, 1 + index)).toISOString().slice(0, 10);
  const common = { slug, title: `${type} 内容 ${index}`, date };
  const entry = type === "post"
    ? { ...common, category: "记录", tags: [`tag-${index % 9}`], featured: index % 7 === 0, featuredOrder: index % 7 === 0 ? index + 1 : undefined, wordCount: 500 }
    : type === "poem"
      ? { ...common, previewLines: ["风", "栖", String(index)], lineCount: 3 }
      : { ...common, section: ["songs", "albums", "playlists"][Math.floor(index / types.length) % 3], kind: "随记", wordCount: 300 };
  const name = type === "music" ? `${entry.section}/${slug}.md` : `${slug}.md`;
  return { name, source: `./${type}/${name}`, raw: `---\ntitle: ${entry.title}\ndate: ${date}\n---\n\n正文 ${index}`, entry };
}

function mixedCollections(total) {
  const collections = new Map(types.map((type) => [type, []]));
  for (let index = 0; index < total; index += 1) {
    const type = types[index % types.length];
    collections.get(type).push(record(type, index));
  }
  return [...collections];
}

for (const total of [0, 50, 500, 2000]) {
  test(`${total} mixed content entries keep manifests and generated data chunked`, () => {
    const { manifest, files } = buildContentDistribution(mixedCollections(total));
    assert.ok(gzipSync(JSON.stringify(manifest), { level: 9 }).byteLength < 8 * 1024);
    assert.equal(Object.values(manifest.collections).reduce((sum, descriptor) => sum + descriptor.count, 0), total);

    for (const [type, descriptor] of Object.entries(manifest.collections)) {
      assert.ok(descriptor.home.latest.length <= HOME_LATEST_LIMIT);
      assert.ok((descriptor.home.featured || []).length <= HOME_FEATURED_CHUNK_SIZE);
      assert.equal(descriptor.pageChunkCount, Math.ceil(descriptor.count / CONTENT_PAGE_CHUNK_SIZE));
      for (const [path, source] of files) {
        if (!path.endsWith(".json") || !path.includes(`/${type}/`)) continue;
        const value = JSON.parse(source);
        if (path.startsWith("pages/")) assert.ok(value.length <= CONTENT_PAGE_CHUNK_SIZE);
        if (path.startsWith("facets/") || path.startsWith("search/")) assert.ok(value.length <= CONTENT_INDEX_CHUNK_SIZE);
        if (path.startsWith("featured/")) assert.ok(value.length <= HOME_FEATURED_CHUNK_SIZE);
        assert.ok(gzipSync(source, { level: 9 }).byteLength < 96 * 1024);
      }
    }
  });
}

test("a fourth generic content collection reuses the distribution pipeline", () => {
  const [definition] = resolveCollectionDefinitions({ essay: { directory: "src/content/essays", extension: ".md" } });
  assert.equal(definition.type, "essay");
  assert.equal(definition.parser("src/content/essays/example.md", "---\ntitle: Example\ndate: 2026-01-01\n---\n\nBody").slug, "example");
  const essay = Array.from({ length: 73 }, (_, index) => ({
    name: `essay-${index}.md`,
    source: `./essays/essay-${index}.md`,
    raw: `---\ntitle: Essay ${index}\ndate: 2026-01-01\n---\n\nBody`,
    entry: { slug: `essay-${index}`, title: `Essay ${index}`, date: "2026-01-01", topic: "future" },
  }));
  const { manifest, files } = buildContentDistribution([...mixedCollections(0), ["essay", essay]]);

  assert.equal(manifest.collections.essay.count, 73);
  assert.equal(manifest.collections.essay.pageChunkCount, 2);
  assert.ok(files.has("pages/essay/0.json"));
  assert.ok(files.has("pages/essay/1.json"));
  assert.ok(files.has("entries/essay/essay-72.json"));
  assert.equal(JSON.parse(files.get("entries/essay/essay-72.json")).body, "/fonscape/content/bodies/essay/essay-72.md");
  assert.equal(files.get("bodies/essay/essay-72.md"), essay[72].raw);
});

test("Meting targets include only deduplicated songs referenced by content", () => {
  const collections = mixedCollections(3);
  collections[0][1][0].entry.music = { url: "https://music.163.com/song?id=27557102" };
  collections[0][1][0].entry.musicBlocks = [
    { url: "https://music.163.com/#/song?id=27557102" },
    { url: "https://y.qq.com/n/ryqq/songDetail/0039MnYb0qxYhV" },
    { src: "/audio/local.mp3", title: "Local", artist: "Artist" },
  ];
  assert.deepEqual(collectMetingSongTargets(collections), [
    "netease:27557102",
    "tencent:0039MnYb0qxYhV",
  ]);
});

test("Meting library targets come only from direct provider URLs in music entries", () => {
  const collections = [
    ["post", [{ entry: { url: "https://music.163.com/playlist?id=12345" } }]],
    ["music", [
      { entry: { section: "albums", url: "https://music.163.com/album?id=34720827" } },
      { entry: { section: "songs", url: "https://music.163.com/song?id=27557102" } },
      { entry: { section: "songs", url: "https://y.qq.com/n/ryqq/playlistDetail/0039MnYb0qxYhV" } },
      { entry: { section: "albums", url: "https://y.qq.com/n/ryqq/playlistDetail/1234567" } },
      { entry: { section: "albums", url: "https://music.163.com/artist?id=12345" } },
      { entry: { section: "albums", url: "https://example.com/artist/12345" } },
    ]],
  ];
  assert.deepEqual(collectMetingLibraryTargets(collections), [
    "netease:album:34720827",
    "netease:song:27557102",
    "tencent:playlist:0039MnYb0qxYhV",
    "tencent:playlist:1234567",
  ]);
});

test("music pins sort first while ordinary music and homepage feed keep newest-first order", () => {
  const entries = [
    { slug: "newest", title: "Newest", date: "2026-09-10", section: "songs", kind: "歌曲", featured: false },
    { slug: "pin-later", title: "Pin later", date: "2025-01-01", section: "albums", kind: "专辑", featured: true, featuredOrder: 10 },
    { slug: "pin-first", title: "Pin first", date: "2025-03-01", section: "songs", kind: "歌曲", featured: true, featuredOrder: 2 },
    { slug: "pin-unordered-old", title: "Pin unordered old", date: "2025-01-01", section: "albums", kind: "专辑", featured: true },
    { slug: "ordinary", title: "Ordinary", date: "2026-09-01", section: "albums", kind: "专辑", featured: false },
    { slug: "pin-unordered-new", title: "Pin unordered new", date: "2026-01-01", section: "songs", kind: "歌曲", featured: true },
  ];
  assert.deepEqual(sortMusicLibrary(entries).map((entry) => entry.slug), [
    "pin-first",
    "pin-later",
    "pin-unordered-new",
    "pin-unordered-old",
    "newest",
    "ordinary",
  ]);

  const records = entries.map((entry) => ({
    name: `${entry.section}/${entry.slug}.md`,
    source: `./music/${entry.section}/${entry.slug}.md`,
    raw: `---\ntitle: ${entry.title}\ndate: ${entry.date}\nkind: ${entry.kind}\n---\nBody`,
    entry,
  }));
  const { manifest, files } = buildContentDistribution([["music", records]]);
  const descriptor = manifest.collections.music;
  const homeMusic = descriptor.home.latest;
  const firstPage = JSON.parse(files.get("pages/music/0.json"));

  assert.equal(descriptor.featuredCount, 0);
  assert.equal(descriptor.featuredChunkCount, 0);
  assert.equal(files.has("featured/music/0.json"), false);
  assert.deepEqual(homeMusic.map((entry) => entry.slug), [
    "pin-first",
    "pin-later",
    "pin-unordered-new",
    "pin-unordered-old",
    "newest",
  ]);
  assert.deepEqual(firstPage.map((entry) => entry.slug), [
    "pin-first",
    "pin-later",
    "pin-unordered-new",
    "pin-unordered-old",
    "newest",
    "ordinary",
  ]);
  assert.equal(homeMusic[0].featured, true);
  assert.equal(homeMusic[0].featuredOrder, 2);
});

test("music page chunks form a pin-first prefix before progressive pages are appended", () => {
  const records = Array.from({ length: 111 }, (_, index) => {
    const slug = `music-${String(index).padStart(3, "0")}`;
    const date = new Date(Date.UTC(2026, 8, 30 - index)).toISOString().slice(0, 10);
    const section = ["songs", "albums", "playlists"][index % 3];
    const entry = {
      slug,
      title: slug,
      date,
      section,
      kind: section === "songs" ? "歌曲" : section === "playlists" ? "歌单" : "专辑",
      featured: index < 57,
      ...(index < 57 ? { featuredOrder: index * 2 + 1 } : {}),
    };
    return {
      name: `${section}/${slug}.md`,
      source: `./music/${section}/${slug}.md`,
      raw: `---\ntitle: ${slug}\ndate: ${date}\nkind: ${entry.kind}\n---\nBody`,
      entry,
    };
  });
  const { manifest, files } = buildContentDistribution([["music", records]]);
  const pages = Array.from({ length: manifest.collections.music.pageChunkCount }, (_, index) => JSON.parse(files.get(`pages/music/${index}.json`)));
  const facets = JSON.parse(files.get("facets/music/0.json"));
  const search = JSON.parse(files.get("search/music/0.json"));
  const pageOrder = pages.flat().map((entry) => entry.slug);
  const expected = sortMusicLibrary(records.map(({ entry }) => entry)).map((entry) => entry.slug);
  const pageBySlug = new Map(pages.flatMap((page, pageIndex) => page.map((entry) => [entry.slug, pageIndex])));
  const facetPageBySlug = new Map(facets.map((facet) => [facet.key.split("/").at(-1), facet.page]));

  assert.equal(pages[0].length, CONTENT_PAGE_CHUNK_SIZE);
  assert.deepEqual(pageOrder, expected);
  assert.equal(pages[0].every((entry) => entry.featured), true);
  assert.equal(pages[1][0].featured, true);
  assert.equal(pages[1][6].featured, true);
  assert.equal(pages[1][7].featured, false);
  assert.deepEqual(facets.map((facet) => facet.key.split("/").at(-1)).slice(0, 3), ["music-000", "music-001", "music-002"]);
  assert.equal(facetPageBySlug.get("music-110"), pageBySlug.get("music-110"));
  assert.deepEqual(search.slice(0, 3).map((entry) => entry.key.split("/").at(-1)), ["music-000", "music-001", "music-002"]);
  assert.equal(search.at(-1).key.split("/").at(-1), "music-110");
});
