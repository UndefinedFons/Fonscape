/**
 * Platform-neutral source-of-truth contract for authored site content.
 *
 * This configuration intentionally contains no hosting, database, account, or
 * repository-provider identifiers. A future editor can use the boundary in
 * server/content-repository.js to propose a reviewed repository change.
 */
export const contentRepositoryConfig = Object.freeze({
  schemaVersion: 1,
  sourceOfTruth: "repository",
  publicationMode: "reviewed-change",
  assetDirectory: "public/assets",
  collections: Object.freeze({
    post: Object.freeze({ directory: "src/content/posts", extension: ".md" }),
    poem: Object.freeze({ directory: "src/content/poems", extension: ".md" }),
    music: Object.freeze({ directory: "src/content/music", extension: ".md" }),
  }),
});
