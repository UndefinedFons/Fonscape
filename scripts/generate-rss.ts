import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import siteConfig from "../fonscape.config.js";
import { contentRepositoryConfig } from "../content-repository.config.mjs";
import type { PostMetadata } from "../src/types.ts";
import { parsePostMetadata, sortNewestFirst } from "../src/content/frontmatter.ts";
import { parseContentDate } from "../src/content/date.ts";
import { normalizeSiteUrl, siteUrlForPath } from "../src/siteUrl.ts";
import { postRoute } from "../src/routes.ts";

export { normalizeSiteUrl };

type FeedPost = Pick<PostMetadata, "slug" | "date" | "title" | "excerpt" | "firstParagraph" | "category">;
type FeedConfig = { siteUrl?: unknown; title?: string; description?: string; language?: string };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * Content dates without an explicit timezone are interpreted as UTC so the
 * generated feed is byte-for-byte stable across developer and CI timezones.
 */
export function parseRssDate(value: unknown): Date {
  const source = String(value ?? "").trim();
  const date = parseContentDate(source);
  if (!date) throw new Error(`RSS 日期无效：${source}`);
  return date;
}

async function findMarkdownFiles(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith(".")) continue;
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`内容文件不能是符号链接：${name}`);
    if (entry.isDirectory()) files.push(...await findMarkdownFiles(path, name));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(path);
  }
  return files;
}

/** Read posts with the same parser and ordering used by the content manifest. */
export async function readRssPosts(sourceRoot = root): Promise<PostMetadata[]> {
  const definition = contentRepositoryConfig.collections.post;
  const sourceDirectory = join(sourceRoot, definition.directory);
  const files = await findMarkdownFiles(sourceDirectory);
  const entries = await Promise.all(files.map(async (path) => {
    const raw = await readFile(path, "utf8");
    return parsePostMetadata(relative(sourceRoot, path).replaceAll("\\", "/"), raw);
  }));
  return entries.sort(sortNewestFirst);
}

export function buildRssFeed(posts: readonly FeedPost[], siteUrl: unknown, config: FeedConfig = {}): string {
  const base = normalizeSiteUrl(siteUrl);
  if (!base) return "";
  const title = config.title || "博客文章";
  const description = config.description || "";
  const language = config.language || "zh-CN";
  const items = posts.map((post) => {
    const postUrl = siteUrlForPath(base, postRoute(post.slug));
    const date = parseRssDate(post.date);
    return [
      "    <item>",
      `      <title>${escapeXml(post.title)}</title>`,
      `      <link>${escapeXml(postUrl)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(postUrl)}</guid>`,
      `      <pubDate>${escapeXml(date.toUTCString())}</pubDate>`,
      `      <description>${escapeXml(post.excerpt || post.firstParagraph || "")}</description>`,
      post.category ? `      <category>${escapeXml(post.category)}</category>` : "",
      "    </item>",
    ].filter(Boolean).join("\n");
  }).join("\n");
  const latestDate = posts[0] ? parseRssDate(posts[0].date).toUTCString() : "";
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(title)}</title>`,
    `    <link>${escapeXml(base)}</link>`,
    `    <description>${escapeXml(description)}</description>`,
    `    <language>${escapeXml(language)}</language>`,
    `    <atom:link href="${escapeXml(siteUrlForPath(base, "/feed.xml"))}" rel="self" type="application/rss+xml" />`,
    latestDate ? `    <lastBuildDate>${escapeXml(latestDate)}</lastBuildDate>` : "",
    items,
    "  </channel>",
    "</rss>",
    "",
  ].filter((line) => line !== "").join("\n");
}

/**
 * Generate the repository-owned feed during dev/build. An empty siteUrl
 * intentionally removes any old generated feed so no placeholder domain is
 * ever published.
 */
export async function generateRssFeed({ root: sourceRoot = root, config = siteConfig }: { root?: string; config?: FeedConfig } = {}): Promise<string> {
  const base = normalizeSiteUrl(config.siteUrl);
  const outputPath = join(sourceRoot, "public", "feed.xml");
  if (!base) {
    await rm(outputPath, { force: true });
    console.log("RSS 未生成：siteUrl 为空。");
    return "";
  }
  const posts = await readRssPosts(sourceRoot);
  const feed = buildRssFeed(posts, base, config);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, feed, "utf8");
  console.log(`RSS 已生成：${relative(sourceRoot, outputPath)}（${posts.length} 篇文章）。`);
  return feed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateRssFeed();
}
