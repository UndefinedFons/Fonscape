import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { staticContentTargets } from "../functions/_generated/content-targets.js";
import {
  assertUniqueEntries,
  parseContentDate,
  parseMusicReview,
  parseMusicReviewMetadata,
  parsePoem,
  parsePoemMetadata,
  parsePost,
  parsePostMetadata,
  sortNewestFirst,
} from "../src/content/frontmatter.ts";
import { getArticleOutline } from "../src/content/markdown.ts";

const definitions = [
  ["post", "posts", parsePost, (entry) => entry.slug],
  ["poem", "poems", parsePoem, (entry) => entry.slug],
  ["music", "music", parseMusicReview, (entry) => `${entry.section}/${entry.slug}`],
];

test("every Markdown content file is discovered and represented in the API target manifest", async () => {
  for (const [type, directory, parser, target] of definitions) {
    const root = join(process.cwd(), "src", "content", directory);
    const names = (await readdir(root)).filter((name) => name.endsWith(".md")).sort();
    const parsedTargets = [];
    for (const name of names) {
      const path = join(root, name);
      parsedTargets.push(target(parser(path, await readFile(path, "utf8"))));
    }
    const systemTargets = type === "post" ? ["site-about", "site-friends"] : [];
    assert.deepEqual([...parsedTargets, ...systemTargets].sort(), staticContentTargets[type]);
  }
});

test("poems retain their complete line-oriented body", () => {
  const poem = parsePoem("example.md", `---
title: "示例小诗"
date: "2026-01-01"
---
第一行
第二行
第三行
第四行`);
  assert.equal(poem.title, "示例小诗");
  assert.deepEqual(poem.lines, [
    "第一行",
    "第二行",
    "第三行",
    "第四行",
  ]);
});

test("metadata parsers keep listing data while omitting Markdown bodies", () => {
  const post = parsePostMetadata("post.md", `---\ntitle: "文章"\ndate: "2026-01-01"\ncategory: "记录"\ncontent: "不应覆盖正文"\ncoverPosition: "50% 30%"\n---\n首段摘要。\n\n## 第一节\n\n正文。\n\n## 第二节\n\n更多正文。`);
  assert.equal(Object.hasOwn(post, "content"), false);
  assert.equal(Object.hasOwn(post, "coverPosition"), false);
  assert.equal(post.firstParagraph, "首段摘要。");
  assert.equal(post.wordCount, 16);
  assert.deepEqual(post.outline.map((item) => item.title), ["序章", "第一节", "第二节"]);

  const poem = parsePoemMetadata("poem.md", `---\ntitle: "小诗"\ndate: "2026-01-01"\n---\n一\n二\n三\n四`);
  assert.equal(Object.hasOwn(poem, "lines"), false);
  assert.deepEqual(poem.previewLines, ["一", "二", "三"]);
  assert.equal(poem.lineCount, 4);

  const music = parseMusicReviewMetadata("music.md", `---\ntitle: "音乐"\nkind: "歌曲"\ndate: "2026-01-01"\n---\n听见一首歌。`);
  assert.equal(Object.hasOwn(music, "content"), false);
  assert.equal(Object.hasOwn(music, "reading"), false);
  assert.equal(music.firstParagraph, "听见一首歌。");
  assert.equal(music.wordCount, 5);
  assert.equal(music.featured, false);
});

test("post parsers preserve custom categories outside the default list", () => {
  const source = `---\ntitle: "一卷照片"\ndate: "2026-01-01"\ncategory: "摄影"\n---\n正文。`;
  assert.equal(parsePost("custom.md", source).category, "摄影");
  assert.equal(parsePostMetadata("custom.md", source).category, "摄影");
});

test("invalid or duplicate frontmatter is rejected during the build", () => {
  assert.throws(() => parsePost("broken.md", "---\ntitle: A\ntitle: B\ndate: 2026-07-30\ncategory: 开发\n---\nBody"), /字段 title 重复/u);
  assert.throws(() => parsePost("broken.md", "---\ntitle: A\ndate: nope\ncategory: 开发\n---\nBody"), /date 格式无效/u);
  assert.throws(() => parsePost("broken.md", "---\ntitle: A\ndate: 2026-02-31T12:00\ncategory: 开发\n---\nBody"), /date 格式无效/u);
  assert.throws(() => parsePost("broken.md", "---\ntitle: A\nslug: notes/foo/\ndate: 2026-07-30\ncategory: 开发\n---\nBody"), /slug 格式无效/u);
  assert.throws(() => parsePost("broken.md", "---\ntitle: A\nslug: notes//foo\ndate: 2026-07-30\ncategory: 开发\n---\nBody"), /slug 格式无效/u);
  assert.throws(() => parsePost("broken.md", "---\ntitle: A\ndate: 2026-07-30\ncategory: 开发\ncoverAlt: 说明\n---\nBody"), /无需配置 coverAlt/u);
  assert.throws(() => parsePost("broken.md", "---\ntitle: A\ndate: 2026-07-30\ncategory: 开发\ncoverMode: side\n---\nBody"), /coverMode 必须是 wide 或 none/u);
  assert.throws(() => parsePost("broken.md", "---\ntitle: A\ndate: 2026-07-30\ncategory: 开发\ncoverSide: left\n---\nBody"), /不支持 coverSide/u);
  assert.throws(() => parsePost("broken.md", "---\ntitle: A\ndate: 2026-07-30\ncategory: 开发\nfeatured: false\nfeaturedOrder: 2\n---\nBody"), /未置顶，不能配置 featuredOrder/u);
  assert.throws(() => parsePost("broken.md", "---\ntitle: A\ndate: 2026-07-30\ncategory: 开发\nfeatured: true\nfeaturedOrder: 1.5\n---\nBody"), /featuredOrder 必须是正整数/u);
  assert.throws(() => parsePost("broken.md", "---\ntitle: A\ndate: 2026-07-30\ncategory: 开发\nseries: 系列\nseriesOrder: -1\n---\nBody"), /seriesOrder 必须是正整数/u);
  assert.throws(() => parsePost("broken.md", '---\ntitle: A\ndate: 2026-07-30\ncategory: 开发\nmusic: {"url":"https://music.163.com/song?id=1","src":"/audio/a.mp3"}\n---\nBody'), /必须且只能配置 url 或 src/u);
  assert.throws(() => parsePost("broken.md", '---\ntitle: A\ndate: 2026-07-30\ncategory: 开发\nmusic: {"url":"https://music.163.com/album?id=1"}\n---\nBody'), /必须是网易云音乐或 QQ 音乐的单曲链接/u);
  assert.throws(() => parsePost("broken.md", '---\ntitle: A\ndate: 2026-07-30\ncategory: 开发\nmusic: {"src":"/audio/a.mp3"}\n---\nBody'), /必须配置 title 和 artist/u);
});

test("required content labels must be non-empty strings", () => {
  assert.throws(
    () => parsePost("broken.md", '---\ntitle: {"unexpected":"object"}\ndate: 2026-07-30\ncategory: 开发\n---\nBody'),
    /title 必须是非空字符串/u,
  );
});

test("optional content fields reject values that cannot be rendered or used as their declared types", () => {
  const post = (field) => `---\ntitle: Post\ndate: 2026-07-30\ncategory: 记录\n${field}\n---\nBody`;
  const music = (field) => `---\ntitle: Music\ndate: 2026-07-30\nkind: 歌曲\n${field}\n---\nBody`;
  for (const field of ["excerpt", "image", "cardPosition", "slug"]) {
    assert.throws(() => parsePost("post.md", post(`${field}: {"text":"invalid"}`)), new RegExp(`${field} 必须是字符串`, "u"));
  }
  assert.throws(() => parsePost("post.md", post('featured: "false"')), /featured 必须是布尔值/u);
  assert.throws(() => parsePost("post.md", post("musicPlacement: false")), /musicPlacement 必须是 inline/u);
  assert.throws(() => parsePost("post.md", post('music: {"src":"/audio/a.mp3","title":{},"artist":"B"}')), /title 必须是字符串/u);
  assert.throws(() => parsePost("post.md", post('musicBlocks: [{"url":"https://music.163.com/song?id=1","autoplay":"false"}]')), /autoplay 必须是布尔值/u);
  assert.throws(() => parsePoem("poem.md", "---\ntitle: Poem\ndate: 2026-07-30\nnote: []\n---\nLine"), /note 必须是字符串/u);
  for (const field of ["slug", "section", "excerpt", "image", "url", "sourceTitle", "sourceMeta", "action"]) {
    assert.throws(() => parseMusicReview("music.md", music(`${field}: []`)), new RegExp(`${field} 必须是字符串`, "u"));
  }
  const valid = parsePost("post.md", post('excerpt: ""\nfeatured: false\nseries: null\nmusicPlacement: "inline"\nmusic: {"src":"/audio/a.mp3","title":"A","artist":"B","autoplay":false}'));
  assert.equal(valid.excerpt, "");
  assert.equal(valid.featured, false);
  assert.equal(valid.series, null);
  assert.equal(valid.music.autoplay, false);
});

test("music pins require a boolean flag and positive order only when pinned", () => {
  const music = (fields = "") => `---\ntitle: Music\nkind: 歌曲\ndate: 2026-07-30\n${fields}\n---\nBody`;
  assert.throws(() => parseMusicReview("music.md", music('featured: "true"')), /featured 必须是布尔值/u);
  assert.throws(() => parseMusicReview("music.md", music("featured: false\nfeaturedOrder: 1")), /未置顶，不能配置 featuredOrder/u);
  assert.throws(() => parseMusicReview("music.md", music("featured: true\nfeaturedOrder: 0")), /featuredOrder 必须是正整数/u);
  assert.throws(() => parseMusicReview("music.md", music("featured: true\nfeaturedOrder: 1.5")), /featuredOrder 必须是正整数/u);
  const pinned = parseMusicReviewMetadata("music.md", music("featured: true\nfeaturedOrder: 3"));
  assert.equal(pinned.featured, true);
  assert.equal(pinned.featuredOrder, 3);
});

test("article outlines ignore headings inside fenced code blocks", () => {
  const outline = getArticleOutline("引言\n\n~~~md\n## 假标题\n~~~\n\n## 第一节\n\n## 第二节");
  assert.deepEqual(outline.map((item) => item.title), ["序章", "第一节", "第二节"]);
});

test("posts accept Meting URLs while preserving local music sources", () => {
  const meting = parsePost("meting.md", '---\ntitle: A\ndate: 2026-07-30\ncategory: 开发\nmusic: {"url":"https://music.163.com/song?id=27557102"}\n---\nBody');
  assert.equal(meting.music.url, "https://music.163.com/song?id=27557102");
  const local = parsePost("local.md", '---\ntitle: A\ndate: 2026-07-30\ncategory: 开发\nmusic: {"src":"/audio/a.mp3","title":"A","artist":"B"}\n---\nBody');
  assert.equal(local.music.src, "/audio/a.mp3");
});

test("music content accepts the three collection categories and rejects removed categories", () => {
  for (const [section, kind] of [["songs", "歌曲"], ["albums", "专辑"], ["playlists", "歌单"]]) {
    const source = `---\ntitle: 音乐\nsection: ${section}\nkind: ${kind}\ndate: 2026-01-01\n---\n`;
    assert.equal(parseMusicReview(`${section}.md`, source).section, section);
    assert.equal(parseMusicReviewMetadata(`${section}.md`, source).section, section);
  }
  assert.throws(() => parseMusicReview("artist.md", "---\ntitle: 音乐人\nsection: artists\nkind: 音乐人\ndate: 2026-01-01\n---\n"), /section 必须是 songs、albums 或 playlists/u);
});

test("mixed content can be ordered by time without grouping by type", () => {
  const items = [
    { slug: "post", kind: "post", date: "2026-01-01T12:00" },
    { slug: "poem", kind: "poem", date: "2025-07-07" },
    { slug: "music", kind: "music", date: "2026-01-01T05:00Z" },
  ];
  assert.equal(parseContentDate("2026-01-01T12:00")?.toISOString(), "2026-01-01T12:00:00.000Z");
  assert.deepEqual(items.sort(sortNewestFirst).map((item) => item.kind), ["post", "music", "poem"]);

  const music = [
    { slug: "hello", section: "songs", date: "2026-01-01" },
    { slug: "hello", section: "albums", date: "2026-01-01" },
    { slug: "hello", section: "playlists", date: "2026-01-01" },
  ];
  assert.doesNotThrow(() => assertUniqueEntries(music, "音乐", (entry) => `${entry.section}/${entry.slug}`));
});
