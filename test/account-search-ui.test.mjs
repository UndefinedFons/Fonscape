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

  assert.match(dialog, /\]\.sort\(sortNewestFirst\)/u);
});
