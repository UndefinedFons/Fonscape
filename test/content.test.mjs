import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { staticContentTargets } from "../functions/_generated/content-targets.js";
import {
  parseMusicReview,
  parseMusicReviewMetadata,
  parsePoem,
  parsePoemMetadata,
  parsePost,
  parsePostMetadata,
  sortNewestFirst,
} from "../src/content/frontmatter.js";

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
});

test("post parsers preserve custom categories outside the default list", () => {
  const source = `---\ntitle: "一卷照片"\ndate: "2026-01-01"\ncategory: "摄影"\n---\n正文。`;
  assert.equal(parsePost("custom.md", source).category, "摄影");
  assert.equal(parsePostMetadata("custom.md", source).category, "摄影");
});

test("invalid or duplicate frontmatter is rejected during the build", () => {
  assert.throws(() => parsePost("broken.md", "---\ntitle: A\ntitle: B\ndate: 2026-07-30\ncategory: 开发\n---\nBody"), /字段 title 重复/u);
  assert.throws(() => parsePost("broken.md", "---\ntitle: A\ndate: nope\ncategory: 开发\n---\nBody"), /date 格式无效/u);
  assert.throws(() => parsePost("broken.md", "---\ntitle: A\ndate: 2026-07-30\ncategory: 开发\ncoverAlt: 说明\n---\nBody"), /无需配置 coverAlt/u);
  assert.throws(() => parsePost("broken.md", "---\ntitle: A\ndate: 2026-07-30\ncategory: 开发\ncoverMode: side\n---\nBody"), /coverMode 必须是 wide 或 none/u);
  assert.throws(() => parsePost("broken.md", "---\ntitle: A\ndate: 2026-07-30\ncategory: 开发\ncoverSide: left\n---\nBody"), /不支持 coverSide/u);
  assert.throws(() => parsePost("broken.md", "---\ntitle: A\ndate: 2026-07-30\ncategory: 开发\nfeatured: false\nfeaturedOrder: 2\n---\nBody"), /未置顶，不能配置 featuredOrder/u);
  assert.throws(() => parsePost("broken.md", "---\ntitle: A\ndate: 2026-07-30\ncategory: 开发\nfeatured: true\nfeaturedOrder: 1.5\n---\nBody"), /featuredOrder 必须是正整数/u);
});

test("mixed content can be ordered by time without grouping by type", () => {
  const items = [
    { slug: "post", kind: "post", date: "2026-08-24T09:00:00" },
    { slug: "poem", kind: "poem", date: "2025-07-07" },
    { slug: "music", kind: "music", date: "2026-08-24T10:00:00" },
  ];
  assert.deepEqual(items.sort(sortNewestFirst).map((item) => item.kind), ["music", "post", "poem"]);
});

test("same-date search entries use their generated keys as a stable tie-breaker", () => {
  const items = [
    { key: "poem-z", type: "poem", date: "2026-08-24" },
    { key: "post-a", type: "post", date: "2026-08-24" },
  ];
  assert.deepEqual(items.sort(sortNewestFirst).map((item) => item.key), ["poem-z", "post-a"]);
});
