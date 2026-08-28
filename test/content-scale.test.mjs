import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import test from "node:test";
import {
  CONTENT_INDEX_CHUNK_SIZE,
  CONTENT_PAGE_CHUNK_SIZE,
  HOME_FEATURED_CHUNK_SIZE,
  HOME_LATEST_LIMIT,
  buildContentDistribution,
  resolveCollectionDefinitions,
} from "../scripts/generate-content-targets.mjs";
import { chunkResponsiveEntries } from "../scripts/generate-responsive-images.mjs";

const types = ["post", "poem", "music"];

function record(type, index) {
  const slug = `${type}-${String(index).padStart(5, "0")}`;
  const date = new Date(Date.UTC(2020, 0, 1 + index)).toISOString().slice(0, 10);
  const common = { slug, title: `${type} 内容 ${index}`, date };
  const entry = type === "post"
    ? { ...common, category: "记录", tags: [`tag-${index % 9}`], featured: index % 7 === 0, featuredOrder: index % 7 === 0 ? index + 1 : undefined, wordCount: 500 }
    : type === "poem"
      ? { ...common, previewLines: ["风", "栖", String(index)], lineCount: 3 }
      : { ...common, section: ["songs", "artists", "albums"][index % 3], kind: "随记", wordCount: 300 };
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
  assert.ok(files.has("bodies/essay/essay-72.md"));
});

for (const total of [0, 50, 500, 2000]) {
  test(`${total} responsive image records stay in fixed-size catalog chunks`, () => {
    const entries = Object.fromEntries(Array.from({ length: total }, (_, index) => [
      `/assets/content-${index}.webp`,
      {
        width: 1600,
        height: 900,
        candidates: [384, 576, 768, 960, 1280, 1600].map((width) => ({
          src: `/fonscape/generated-images/content-${index}-w${width}.webp`,
          width,
        })),
      },
    ]));
    const chunks = chunkResponsiveEntries(entries, 100);

    assert.equal(chunks.length, Math.ceil(total / 100));
    assert.ok(chunks.every((chunk) => Object.keys(chunk).length <= 100));
    assert.ok(chunks.every((chunk) => gzipSync(JSON.stringify(chunk), { level: 9 }).byteLength < 32 * 1024));
  });
}
