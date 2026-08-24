import assert from "node:assert/strict";
import test from "node:test";
import { getPostMarkdown } from "../src/richContent.js";

test("rich content uses the Markdown content field as its only source", () => {
  assert.equal(getPostMarkdown({ content: "  # 正文\n" }), "# 正文");
  assert.equal(getPostMarkdown({ body: ["旧格式正文"] }), "");
  assert.equal(getPostMarkdown({}), "");
});
