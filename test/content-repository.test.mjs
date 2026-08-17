import assert from "node:assert/strict";
import test from "node:test";
import {
  contentPathFor,
  contentRepositoryConfig,
  createContentRepositoryBoundary,
} from "../server/content-repository.js";

test("content repository destinations are independent of deployment platform", () => {
  assert.equal(contentPathFor(contentRepositoryConfig, "post", "a-new-note"), "src/content/posts/a-new-note.md");
  assert.equal(contentPathFor(contentRepositoryConfig, "poem", "a-poem"), "src/content/poems/a-poem.md");
  assert.equal(contentPathFor(contentRepositoryConfig, "music", "an-album"), "src/content/music/an-album.md");
  assert.throws(() => contentPathFor(contentRepositoryConfig, "post", "../escape"), /invalid content destination/u);
});

test("content repository boundary delegates a reviewed proposal without selecting a host", async () => {
  const changes = [];
  const repository = createContentRepositoryBoundary({
    proposeChange(change) {
      changes.push(change);
      return { status: "pending-review" };
    },
  });

  assert.deepEqual(await repository.propose({
    type: "post",
    slug: "future-writing",
    content: "---\ntitle: Future\n---\n\nDraft body",
    message: "Add future writing",
  }), { status: "pending-review" });
  assert.deepEqual(changes, [{
    path: "src/content/posts/future-writing.md",
    content: "---\ntitle: Future\n---\n\nDraft body",
    message: "Add future writing",
    publicationMode: "reviewed-change",
  }]);
});
