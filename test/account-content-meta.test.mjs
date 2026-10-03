import assert from "node:assert/strict";
import test from "node:test";
import { contentMeta } from "../src/community/accountData.ts";

test("music account messages resolve nested slugs and derive their type from collection metadata", () => {
  for (const [section, label] of [["songs", "歌曲"], ["albums", "专辑"], ["playlists", "歌单"]]) {
    const item = { contentType: "music", contentSlug: `${section}/classical/example` };
    const contentLookup = new Map([
      [`music:${item.contentSlug}`, { title: "音乐名称", section }],
    ]);
    assert.deepEqual(contentMeta(item, contentLookup), { title: "音乐名称", section: `音乐 · ${label}` });
    assert.deepEqual(contentMeta(item, new Map()), { title: "classical/example", section: "音乐 · 内容" });
  }
});

test("music messages use the music title independently of the note and stored message title", () => {
  const item = { contentType: "music", contentSlug: "albums/example", contentTitle: "旧听后感标题" };
  const lookup = new Map([["music:albums/example", { title: "听后感标题", sourceTitle: "专辑名称", section: "albums" }]]);
  assert.equal(contentMeta(item, lookup).title, "专辑名称");
});
