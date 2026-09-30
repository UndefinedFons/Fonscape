import assert from "node:assert/strict";
import test from "node:test";
import { contentMeta } from "../src/community/accountData.ts";

test("music account messages resolve titles with nested slugs", () => {
  const item = { contentType: "music", contentSlug: "artists/classical/john-coltrane" };
  const contentLookup = new Map([
    ["music:artists/classical/john-coltrane", { title: "约翰·柯川", kind: "艺术家" }],
  ]);

  assert.deepEqual(contentMeta(item, contentLookup), { title: "约翰·柯川", section: "音乐 · 艺术家" });
});
