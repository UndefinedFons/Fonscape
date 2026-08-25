import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { staticContentTargets } from "../functions/_generated/content-targets.js";
import { parseMusicReview, parsePoem, parsePost, sortNewestFirst } from "../src/content/frontmatter.js";

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

test("invalid or duplicate frontmatter is rejected during the build", () => {
  assert.throws(() => parsePost("broken.md", "---\ntitle: A\ntitle: B\ndate: 2026-07-30\ncategory: 开发\n---\nBody"), /字段 title 重复/u);
  assert.throws(() => parsePost("broken.md", "---\ntitle: A\ndate: nope\ncategory: 开发\n---\nBody"), /date 格式无效/u);
  assert.throws(() => parsePost("broken.md", "---\ntitle: A\ndate: 2026-07-30\ncategory: 开发\ncoverAlt: 说明\n---\nBody"), /无需配置 coverAlt/u);
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
