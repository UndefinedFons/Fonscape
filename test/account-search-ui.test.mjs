import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildSearchItems, enabledSearchTypes, filterSearchItems, searchScopeOptions, searchScopeStyle } from "../src/components/searchModel.js";

test("all account message feeds use the same two-line body preview", async () => {
  const [dialog, styles] = await Promise.all([
    readFile("src/community/AccountDialog.jsx", "utf8"),
    readFile("src/styles.css", "utf8"),
  ]);

  assert.equal(dialog.match(/<p className="account-message-body">/gu)?.length, 2);
  assert.match(styles, /\.account-message-body\s*\{[^}]*-webkit-line-clamp:2;/u);
});

test("account notifications stay unread until an individual message is opened", async () => {
  const dialog = await readFile("src/community/AccountDialog.jsx", "utf8");
  assert.doesNotMatch(dialog, /loadFeedWithBestEffortReceipt|readThrough/u);
  assert.match(dialog, /const \[tab, setTab\] = useState\("profile"\);/u);
  assert.match(dialog, /if \(item\.unread && markRead\) Promise\.resolve\(markRead\(item\.id\)\)\.catch\(\(\) => \{\}\);/u);
  assert.match(dialog, /commentLinkProps\(reply, closeAccount, markReplyRead\)/u);
  assert.match(dialog, /commentLinkProps\(comment, closeAccount, markAdminCommentRead\)/u);
});

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
