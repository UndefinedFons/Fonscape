import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildSearchItems, enabledSearchTypes, filterSearchItems, searchScopeOptions, searchScopeStyle } from "../src/components/searchModel.js";

test("the combined search feed applies newest-first ordering with stable ties", () => {
  const items = buildSearchItems([
    { type: "poem", key: "z-poem", title: "小诗", date: "2026-08-28" },
    { type: "post", key: "b-post", title: "文章 B", category: "评谈", date: "2026-08-29" },
    { type: "music", key: "songs/a-song", title: "音乐", kind: "歌曲", date: "2026-08-27" },
    { type: "post", key: "a-post", title: "文章 A", category: "记录", date: "2026-08-29" },
  ]);
  assert.deepEqual(items.map((item) => item.id), ["post-a-post", "post-b-post", "poem-z-poem", "music-songs/a-song"]);
});

test("search scopes, filtering and indicator geometry follow optional sections", () => {
  assert.deepEqual(enabledSearchTypes({}), ["post"]);
  assert.deepEqual(enabledSearchTypes({ showPoems: true, showMusic: true }), ["post", "poem", "music"]);
  assert.deepEqual(searchScopeOptions({ showPoems: true }), [["all", "全部"], ["post", "文章"], ["poem", "小诗"]]);
  assert.deepEqual(searchScopeStyle(3, 2), { "--search-scope-count": 3, "--search-scope-offset": "200%" });

  const items = buildSearchItems([
    { type: "post", key: "wind", title: "风中的文章", category: "评谈", date: "2026-08-29" },
    { type: "poem", key: "rain", title: "雨", date: "2026-08-28" },
    { type: "music", key: "songs/wind", title: "风之歌", kind: "歌曲", date: "2026-08-27" },
  ]);
  assert.deepEqual(filterSearchItems(items, "all", "风").map((item) => item.kind), ["post", "music"]);
  assert.deepEqual(filterSearchItems(items, "music", "").map((item) => item.title), ["风之歌"]);
});

test("account message previews remain clamped to two lines", async () => {
  const css = await readFile("src/styles/community.css", "utf8");
  const rule = css.match(/^\.account-message-body\s*\{([^}]*)\}/mu)?.[1];
  assert.ok(rule, "the shared account message preview rule must exist");
  const properties = new Map(rule.split(";").map((declaration) => {
    const [property, ...value] = declaration.split(":");
    return [property.trim(), value.join(":").trim()];
  }));
  assert.equal(properties.get("display"), "-webkit-box");
  assert.equal(properties.get("overflow"), "hidden");
  assert.equal(properties.get("-webkit-line-clamp"), "2");
  assert.equal(properties.get("-webkit-box-orient"), "vertical");
});
