import assert from "node:assert/strict";
import test from "node:test";
import { getHomeContent } from "../src/pages/homeContent.js";

test("home content leaves the featured area empty when no article is pinned", () => {
  const result = getHomeContent([
    { slug: "new", date: "2026-08-02", featured: false },
    { slug: "old", date: "2026-08-01", featured: false },
  ], [], {});

  assert.deepEqual(result.featuredPosts, []);
  assert.deepEqual(result.recentPosts.map((post) => post.slug), ["new", "old"]);
  assert.deepEqual(result.latestPoems, []);
  assert.deepEqual(result.latestMusic, []);
  assert.equal(result.musicCount, 0);
});

test("home content keeps explicit featured ordering and limits each feed", () => {
  const posts = Array.from({ length: 7 }, (_, index) => ({
    slug: `post-${index}`,
    date: `2026-08-${String(index + 1).padStart(2, "0")}`,
    featured: index < 3,
    featuredOrder: index === 0 ? 20 : index === 1 ? 10 : undefined,
  }));
  const poems = Array.from({ length: 6 }, (_, index) => ({ slug: `poem-${index}`, date: `2026-07-${String(index + 1).padStart(2, "0")}` }));
  const music = { albums: Array.from({ length: 6 }, (_, index) => ({ slug: `music-${index}`, date: `2026-06-${String(index + 1).padStart(2, "0")}` })) };
  const result = getHomeContent(posts, poems, music);

  assert.deepEqual(result.featuredPosts.map((post) => post.slug), ["post-1", "post-0", "post-2"]);
  assert.equal(result.recentPosts.length, 5);
  assert.equal(result.latestPoems.length, 5);
  assert.equal(result.latestMusic.length, 5);
  assert.ok(result.latestMusic.every((entry) => entry.section === "albums"));
  assert.equal(result.musicCount, 6);
});
