import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("all account message feeds use the same two-line body preview", async () => {
  const [dialog, styles] = await Promise.all([
    readFile("src/community/AccountDialog.jsx", "utf8"),
    readFile("src/styles.css", "utf8"),
  ]);

  assert.equal(dialog.match(/<p className="account-message-body">/gu)?.length, 2);
  assert.match(styles, /\.account-message-body\s*\{[^}]*-webkit-line-clamp:2;/u);
});

test("read-receipt failures cannot replace an already loaded message feed", async () => {
  const dialog = await readFile("src/community/AccountDialog.jsx", "utf8");

  assert.match(dialog, /viewer\.unreadReplies > 0\) markRepliesRead\(\)\.catch/u);
  assert.match(dialog, /viewer\.unreadAdminComments > 0\) markAdminCommentsRead\(\)\.catch/u);
  assert.doesNotMatch(dialog, /loadMyReplies\([^)]*\)\.then\(async/u);
  assert.doesNotMatch(dialog, /loadReceivedComments\([^)]*\)\.then\(async/u);
});

test("the combined search feed applies the shared newest-first ordering", async () => {
  const dialog = await readFile("src/components/Dialogs.jsx", "utf8");

  assert.match(dialog, /indexedContent\.map\([\s\S]*?\)\.sort\(sortNewestFirst\)/u);
});

test("search scopes and results follow the optional section switches", async () => {
  const dialog = await readFile("src/components/Dialogs.jsx", "utf8");
  const styles = await readFile("src/styles.css", "utf8");

  assert.match(dialog, /const showPoems = siteConfig\.showPoems === true/u);
  assert.match(dialog, /const showMusic = siteConfig\.showMusic === true/u);
  assert.match(dialog, /\["post", showPoems && "poem", showMusic && "music"\]\.filter\(Boolean\)/u);
  assert.match(dialog, /loadSearchIndex\(enabledTypes\)\.then/u);
  assert.match(dialog, /正在加载搜索内容/u);
  assert.match(dialog, /entry\.type === "poem"/u);
  assert.match(dialog, /kind: "music"/u);
  assert.match(dialog, /showPoems \? \[\["poem", "小诗"\]\] : \[\]/u);
  assert.match(dialog, /showMusic \? \[\["music", "音乐"\]\] : \[\]/u);
  assert.match(dialog, /"--search-scope-count": scopeOptions\.length/u);
  assert.match(dialog, /"--search-scope-offset": `\$\{activeScopeIndex \* 100\}%`/u);
  assert.match(styles, /grid-template-columns:repeat\(var\(--search-scope-count\),minmax\(0,1fr\)\)/u);
  assert.match(styles, /width:calc\(\(100% - 6px\)\/var\(--search-scope-count\)\)/u);
  assert.match(styles, /transform:translateX\(var\(--search-scope-offset\)\)/u);
});
