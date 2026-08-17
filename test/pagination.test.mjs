import assert from "node:assert/strict";
import test from "node:test";
import { FULL_PAGINATION_THRESHOLD, getVisiblePaginationPages } from "../src/pagination.js";

test("pagination shows every page through the five-page threshold", () => {
  assert.equal(FULL_PAGINATION_THRESHOLD, 5);
  assert.deepEqual(getVisiblePaginationPages(3, 5), [1, 2, 3, 4, 5]);
});

test("pagination compacts page lists once they exceed five pages", () => {
  assert.deepEqual(getVisiblePaginationPages(2, 6), [1, 2, 3, 6]);
  assert.deepEqual(getVisiblePaginationPages(5, 10), [1, 4, 5, 6, 10]);
  assert.deepEqual(getVisiblePaginationPages(9, 10), [1, 8, 9, 10]);
});
