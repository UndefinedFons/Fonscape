import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  friendEntryFromApplication,
  friendEntryJson,
  parseFriendApplication,
} from "../src/community/friendApplication.js";

const validBlock = [
  "先说一句普通留言。",
  "【友链申请】",
  'site: "风栖小站"',
  'url: "https://example.com/blog"',
  'desc: "记录生活与技术"',
  'color: "#AABBCC"',
  "也谢谢你维护这个页面。",
].join("\n");

test("friend applications require a standalone marker and accept surrounding prose", () => {
  assert.equal(parseFriendApplication("这里提到【友链申请】但不是申请块。"), null);
  const application = parseFriendApplication(validBlock);
  assert.equal(application.valid, true);
  assert.deepEqual(application.data, {
    site: "风栖小站",
    url: "https://example.com/blog",
    desc: "记录生活与技术",
    color: "#aabbcc",
  });
});

test("friend applications reject missing, duplicate, and unsafe values", () => {
  const application = parseFriendApplication([
    "【友链申请】",
    "site: first",
    "site: second",
    "url: javascript:alert(1)",
    "color: pink",
  ].join("\n"));
  assert.equal(application.valid, false);
  assert.ok(application.errors.some((error) => error.includes("site 字段不能重复")));
  assert.ok(application.errors.some((error) => error.includes("缺少 desc")));
  assert.ok(application.errors.some((error) => error.includes("HTTP 或 HTTPS")));
  assert.ok(application.errors.some((error) => error.includes("十六进制")));
});

test("repository friend entries use the comment author identity", () => {
  const application = parseFriendApplication(`${validBlock}\nowner: "申请者自己填写的旧值"`);
  const entry = friendEntryFromApplication(application, { id: "user-42", nickname: "小丰" });
  assert.deepEqual(entry, {
    name: "风栖小站",
    url: "https://example.com/blog",
    description: "记录生活与技术",
    owner: "小丰",
    userId: "user-42",
    color: "#aabbcc",
  });
  assert.deepEqual(JSON.parse(friendEntryJson(application, { id: "user-42", nickname: "小丰" })), entry);
});

test("friends UI derives the owner from the account and keeps the administrator copy action", async () => {
  const [commentsSource, friendsSource] = await Promise.all([
    readFile(new URL("../src/community/CommentsSection.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/FriendsPage.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(commentsSource, /viewer\?\.role === "admin" && friendApplication\?\.valid/u);
  assert.match(commentsSource, /aria-live="polite"/u);
  assert.match(commentsSource, /\{copyState \|\| "复制友链 JSON"\}/u);
  assert.doesNotMatch(commentsSource, /copyState && <p/u);
  assert.ok(commentsSource.indexOf("再次点击确认") < commentsSource.indexOf('{copyState || "复制友链 JSON"}'));
  assert.doesNotMatch(friendsSource, /`owner:/u);
  assert.match(friendsSource, /aria-live="polite"/u);
  assert.match(friendsSource, /请将复制的内容粘贴到下方评论区/u);
});
