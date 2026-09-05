import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildRssFeed, parseRssDate, readRssPosts } from "../scripts/generate-rss.mjs";
import { buildSitemap } from "../scripts/generate-sitemap.mjs";
import { hasMathSyntax, parseAlertMarker, protectCurrencySyntax } from "../src/content/richFeatures.js";
import { normalizeSiteUrl } from "../src/siteUrl.js";

test("content feature syntax distinguishes alerts, formulas, currency, and code", () => {
  assert.deepEqual(parseAlertMarker("[!WARNING]\n注意内容"), { type: "WARNING", label: "警告", className: "warning" });
  assert.equal(parseAlertMarker("普通引用"), null);
  assert.equal(hasMathSyntax("金额 $20 和 $30"), false);
  assert.equal(hasMathSyntax("行内 $E=mc^2$ 与 $$42$$"), true);
  assert.equal(hasMathSyntax("```text\n$E=mc^2$\n```"), false);
  assert.equal(protectCurrencySyntax("金额 $20 和 $30，`$40 和 $50`"), "金额 \\$20 和 \\$30，`$40 和 $50`");
});

test("RSS generation uses parsed posts, stable links, and deterministic UTC dates", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "fonscape-rss-"));
  try {
    const postsRoot = join(fixtureRoot, "src", "content", "posts");
    await mkdir(postsRoot, { recursive: true });
    await writeFile(join(postsRoot, "hello.md"), `---\ntitle: "Hello & 世界"\ncategory: "记录"\ndate: "2026-01-02T03:04"\nexcerpt: "摘要 <安全>"\n---\n正文\n`);
    const posts = await readRssPosts(fixtureRoot);
    const feed = buildRssFeed(posts, "https://blog.example/", { title: "我的博客", description: "简介" });
    assert.equal(posts.length, 1);
    assert.match(feed, /<title>Hello &amp; 世界<\/title>/u);
    assert.match(feed, /https:\/\/blog\.example\/post\/hello/u);
    assert.match(feed, /<guid isPermaLink="true">https:\/\/blog\.example\/post\/hello<\/guid>/u);
    assert.match(feed, /<pubDate>Fri, 02 Jan 2026 03:04:00 GMT<\/pubDate>/u);
    assert.match(feed, /<description>摘要 &lt;安全&gt;<\/description>/u);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("sitemap generation uses real pathname routes and published sections", () => {
  const sitemap = buildSitemap({
    post: [{ slug: "hello/world", date: "2026-01-02T03:04", title: "Hello" }],
    poem: [{ slug: "quiet", date: "2026-01-01", title: "Quiet" }],
    music: [{ section: "artists", slug: "fons", date: "2025-12-31", title: "Fons" }],
  }, "https://blog.example/", { showPoems: true, showMusic: true });

  assert.match(sitemap, /<loc>https:\/\/blog\.example\/post\/hello\/world<\/loc>/u);
  assert.match(sitemap, /<loc>https:\/\/blog\.example\/poem\/quiet<\/loc>/u);
  assert.match(sitemap, /<loc>https:\/\/blog\.example\/music\/artists\/fons<\/loc>/u);
  assert.match(sitemap, /<loc>https:\/\/blog\.example\/posts<\/loc>/u);
  assert.doesNotMatch(sitemap, /#\//u);
  assert.doesNotMatch(buildSitemap({ post: [] }, "", {}), /<url>/u);
});

test("empty siteUrl disables feed links and dates without timezone are UTC", () => {
  assert.equal(normalizeSiteUrl(""), "");
  assert.equal(normalizeSiteUrl("https://blog.example/"), "https://blog.example");
  assert.throws(() => normalizeSiteUrl("https://blog.example/base/"), /不能包含子目录/u);
  assert.throws(() => buildRssFeed([], "https://blog.example/base/", {}), /不能包含子目录/u);
  assert.throws(() => buildSitemap({}, "https://blog.example/base/"), /不能包含子目录/u);
  assert.equal(buildRssFeed([], "", {}), "");
  assert.equal(parseRssDate("2026-01-02T03:04").toISOString(), "2026-01-02T03:04:00.000Z");
  assert.throws(() => normalizeSiteUrl("/relative"), /有效的 http\(s\) URL/u);
});
