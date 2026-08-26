import { getArticleOutline, getFirstParagraph, markdownToPlainText } from "./content/markdown.js";

/** @param {Partial<import("./types.js").Post>} post */
export function getPostMarkdown(post) {
  if (typeof post.content === "string") return post.content.trim();
  return "";
}

/** @param {Partial<import("./types.js").Post>} post */
export function getPostOutline(post) {
  if (Array.isArray(post.outline)) return post.outline;
  const markdown = getPostMarkdown(post);
  return getArticleOutline(markdown);
}

export { markdownToPlainText } from "./content/markdown.js";

/** @param {Partial<import("./types.js").Post>} post */
export function getPostPlainText(post) {
  return markdownToPlainText(getPostMarkdown(post));
}

/** @param {Partial<import("./types.js").Post>} post */
export function getPostFirstParagraph(post) {
  if (typeof post.firstParagraph === "string") return post.firstParagraph;
  return getFirstParagraph(getPostMarkdown(post));
}
