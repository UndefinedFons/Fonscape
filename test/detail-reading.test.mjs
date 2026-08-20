import assert from "node:assert/strict";
import test from "node:test";
import { getDetailReadingTarget } from "../src/detailReading.js";

test("detail routes expose the content region used by the shared reading progress", () => {
  assert.equal(getDetailReadingTarget("/post/example"), ".article-page .article-body");
  assert.equal(getDetailReadingTarget("/poem/example"), ".poem-page article");
  assert.equal(getDetailReadingTarget("/music/albums/example"), ".music-detail-page .article-detail");
  assert.equal(getDetailReadingTarget("/posts"), "");
  assert.equal(getDetailReadingTarget("/music"), "");
});
