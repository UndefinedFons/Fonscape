import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createMusicMetadataResolver, resolveMusicMetadata } from "../scripts/music-metadata.ts";
import { generateContentArtifacts } from "../scripts/generate-content-targets.mjs";
import { parseMusicReview } from "../src/content/frontmatter.ts";
import { buildSearchItems, filterSearchItems } from "../src/components/searchModel.ts";

const metadata = { sourceTitle: "音乐名称", sourceMeta: "音乐人", image: "https://images.example.test/cover.jpg" };
const target = { source: "netease", type: "album", id: "123" };

async function workspace(context) {
  const root = await mkdtemp(join(tmpdir(), "fonscape-music-metadata-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "src/content/music"), { recursive: true });
  return root;
}

test("provider metadata keeps song, album and playlist identities separate on both platforms", async () => {
  const cases = [
    ["netease", "song", { songs: [{ name: "音乐名称", ar: [{ name: "音乐人" }], al: { picUrl: metadata.image } }] }],
    ["netease", "album", { album: { name: "音乐名称", artists: [{ name: "音乐人" }], picUrl: metadata.image }, songs: [{ name: "不是专辑名称" }] }],
    ["netease", "playlist", { playlist: { name: "音乐名称", creator: { nickname: "音乐人" }, coverImgUrl: metadata.image, tracks: [{ name: "不是歌单名称" }] } }],
    ["tencent", "song", { data: [{ name: "音乐名称", singer: [{ name: "音乐人" }], album: { mid: "album-mid" } }] }],
    ["tencent", "album", { data: { getAlbumInfo: { Falbum_name: "音乐名称" }, getSingerInfo: { Fsinger_name: "音乐人" }, getSongInfo: [{ name: "不是专辑名称" }] } }],
    ["tencent", "playlist", { data: { cdlist: [{ dissname: "音乐名称", nickname: "音乐人", logo: metadata.image, songlist: [{ name: "不是歌单名称" }] }] } }],
  ];
  for (const [source, type, response] of cases) {
    const client = { [type]: async () => JSON.stringify(response), pic: async () => JSON.stringify({ url: metadata.image }) };
    assert.deepEqual(await resolveMusicMetadata({ source, type, id: "123" }, client), metadata, `${source} ${type}`);
    await assert.rejects(resolveMusicMetadata({ source, type, id: "123" }, { ...client, [type]: async () => "{}" }), /未返回音乐名称/u);
  }
});

test("URL and date infer all collection categories while note titles remain optional", () => {
  for (const [route, section] of [["song", "songs"], ["album", "albums"], ["playlist", "playlists"]]) {
    const raw = `---\nurl: https://music.163.com/${route}?id=123\ndate: 2026-10-03\n---\n`;
    assert.equal(parseMusicReview("music.md", raw).section, section);
    const note = parseMusicReview("music.md", `${raw}\n只有正文的手记。`);
    assert.equal(note.title, "");
    assert.equal(note.excerpt, undefined);
    assert.equal(note.content, "只有正文的手记。");
    const titled = parseMusicReview("music.md", raw.replace("date:", "title: 手记标题\nkind: 自定义标签\ndate:") + "\n正文。");
    assert.equal(titled.title, "手记标题");
    assert.equal(Object.hasOwn(titled, "kind"), false);
    assert.equal(parseMusicReview("music.md", raw.replace("date:", "title: 不应成为音乐名称\ndate:")).title, "");
  }
  const qq = parseMusicReview("qq.md", "---\nurl: https://y.qq.com/n/ryqq/playlist/1234567\ndate: 2026-10-03\n---\n");
  assert.equal(qq.section, "playlists");
  assert.throws(() => parseMusicReview("external.md", "---\nurl: https://example.test/music\ndate: 2026-10-03\ntitle: 手记标题\n---\n"), /填写 section.*sourceTitle/u);
  const manual = parseMusicReview("external.md", "---\nsourceTitle: 音乐名称\nsection: albums\ndate: 2026-10-03\n---\n正文。");
  assert.equal(manual.sourceTitle, "音乐名称");
  assert.equal(manual.title, "");
});

test("generated pages, home, search and detail share resolved music metadata without editing Markdown", async (context) => {
  const root = await workspace(context);
  const bare = "---\nurl: https://music.163.com/album?id=123\ndate: 2026-10-03\n---\n";
  const inputs = { bare, body: `${bare}\n正文。`, titled: `${bare.replace("date:", "title: 手记标题\nexcerpt: 手记摘要\ndate:")}\n手记正文。` };
  for (const [slug, raw] of Object.entries(inputs)) await writeFile(join(root, `src/content/music/${slug}.md`), raw);
  let calls = 0;
  await generateContentArtifacts({ projectRoot: root, resolveMetadata: async () => { calls += 1; return metadata; } });
  assert.equal(calls, 1, "entries sharing one URL resolve it once");
  const read = (path) => readFile(join(root, "public/fonscape/content", path), "utf8");
  const pages = JSON.parse(await read("pages/music/0.json"));
  assert.equal(pages.length, 3);
  assert.ok(pages.every((entry) => entry.sourceTitle === metadata.sourceTitle && entry.sourceMeta === metadata.sourceMeta && entry.image === metadata.image && !Object.hasOwn(entry, "kind")));
  const search = buildSearchItems(JSON.parse(await read("search/music/0.json")));
  assert.equal(search.find((entry) => entry.slug === "albums/bare").title, metadata.sourceTitle);
  assert.equal(search.find((entry) => entry.slug === "albums/titled").title, "手记标题");
  assert.equal(search.find((entry) => entry.slug === "albums/titled").sourceTitle, metadata.sourceTitle);
  assert.equal(filterSearchItems(search, "music", metadata.sourceTitle).length, 3);
  assert.ok(search.every((entry) => entry.meta === "专辑"));
  const facets = JSON.parse(await read("facets/music/0.json"));
  assert.ok(facets.every((entry) => entry.title === metadata.sourceTitle));
  const manifest = await readFile(join(root, "functions/_generated/content-metadata.js"), "utf8");
  assert.ok(manifest.includes(metadata.sourceTitle));
  assert.equal(manifest.includes("手记标题"), false, "home lists the music name");
  for (const [slug, raw] of Object.entries(inputs)) {
    assert.equal(await readFile(join(root, `src/content/music/${slug}.md`), "utf8"), raw);
    const detail = parseMusicReview(`${slug}.md`, await read(`bodies/music/${slug}.md`));
    assert.equal(detail.sourceTitle, metadata.sourceTitle);
    assert.equal(detail.title, slug === "titled" ? "手记标题" : "");
    assert.equal(detail.content, slug === "titled" ? "手记正文。" : slug === "body" ? "正文。" : "");
  }
  await generateContentArtifacts({ projectRoot: root, check: true, resolveMetadata: async () => { throw new Error("cache should be used"); } });
});

test("manual metadata overrides are respected and blank names are resolved only in the generated header", async (context) => {
  const root = await workspace(context);
  const raw = "---\nurl: https://music.163.com/album?id=123\ndate: 2026-10-03\n  sourceTitle: \"\"\nsourceMeta: \"手动音乐人\"\nimage: \"\"\n---\nsourceTitle: 正文中的文字\n";
  await writeFile(join(root, "src/content/music/overrides.md"), raw);
  await generateContentArtifacts({ projectRoot: root, resolveMetadata: async () => metadata });
  const body = await readFile(join(root, "public/fonscape/content/bodies/music/overrides.md"), "utf8");
  const entry = parseMusicReview("overrides.md", body);
  assert.equal(entry.sourceTitle, metadata.sourceTitle);
  assert.equal(entry.sourceMeta, "手动音乐人");
  assert.equal(entry.image, "");
  assert.equal(entry.content, "sourceTitle: 正文中的文字");
  const manual = "---\nurl: https://music.163.com/album?id=456\ndate: 2026-10-03\nsourceTitle: 手动音乐名称\nsourceMeta: \"\"\nimage: \"\"\n---\n";
  await writeFile(join(root, "src/content/music/manual.md"), manual);
  await generateContentArtifacts({ projectRoot: root, resolveMetadata: async () => { throw new Error("manual metadata should skip the provider"); } });
});

test("failed metadata requests never poison the cache or replace prior generated content", async (context) => {
  const root = await workspace(context);
  let calls = 0;
  const resolve = createMusicMetadataResolver(root, async () => { calls += 1; if (calls <= 2) throw new Error("provider unavailable"); return metadata; });
  await assert.rejects(resolve(target), /provider unavailable/u);
  assert.deepEqual(await resolve(target), metadata);
  assert.equal(calls, 3);
  const cached = createMusicMetadataResolver(root, async () => { throw new Error("provider unavailable"); });
  assert.deepEqual(await cached(target), metadata);
  const cachePath = join(root, ".fonscape-cache/music-metadata/netease-album-123.json");
  const oldCache = JSON.parse(await readFile(cachePath, "utf8"));
  await writeFile(cachePath, JSON.stringify({ ...oldCache, savedAt: 0 }));
  const stale = createMusicMetadataResolver(root, async () => { throw new Error("provider unavailable"); });
  assert.deepEqual(await stale(target), metadata, "a provider outage retains the last successful metadata");
  await writeFile(join(root, "src/content/music/broken.md"), "---\nurl: https://music.163.com/album?id=456\ndate: 2026-10-03\n---\n");
  await mkdir(join(root, "public/fonscape/content"), { recursive: true });
  await writeFile(join(root, "public/fonscape/content/previous.json"), "previous output");
  await assert.rejects(generateContentArtifacts({ projectRoot: root, resolveMetadata: async () => { throw new Error("provider unavailable"); } }), /broken.md.*album\?id=456.*重试.*sourceTitle/u);
  assert.equal(await readFile(join(root, "public/fonscape/content/previous.json"), "utf8"), "previous output");
});
