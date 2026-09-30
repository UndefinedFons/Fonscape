import type { ArticleOutlineItem, Post } from "./types.ts";
import { getArticleOutline, getFirstParagraph, markdownToPlainText } from "./content/markdown.ts";

export function getPostMarkdown(post: Partial<Post>): string {
  if (typeof post.content === "string") return post.content.trim();
  return "";
}

export function getPostOutline(post: Partial<Post>): ArticleOutlineItem[] {
  if (Array.isArray(post.outline)) return post.outline;
  const markdown = getPostMarkdown(post);
  return getArticleOutline(markdown);
}

export { markdownToPlainText } from "./content/markdown.ts";

export function getPostPlainText(post: Partial<Post>): string {
  return markdownToPlainText(getPostMarkdown(post));
}

export function getPostFirstParagraph(post: Partial<Post>): string {
  if (typeof post.firstParagraph === "string") return post.firstParagraph;
  return getFirstParagraph(getPostMarkdown(post));
}
