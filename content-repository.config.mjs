/** Markdown collections scanned into the runtime content-target allowlist. */
export const contentRepositoryConfig = Object.freeze({
  schemaVersion: 1,
  collections: Object.freeze({
    post: Object.freeze({ directory: "src/content/posts", extension: ".md" }),
    poem: Object.freeze({ directory: "src/content/poems", extension: ".md" }),
    music: Object.freeze({ directory: "src/content/music", extension: ".md" }),
  }),
});
