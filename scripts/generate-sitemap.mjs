import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import siteConfig from "../fonscape.config.js";
import { contentRepositoryConfig } from "../content-repository.config.mjs";
import {
  parseMusicReviewMetadata,
  parsePoemMetadata,
  parsePostMetadata,
  sortNewestFirst,
} from "../src/content/frontmatter.js";
import { musicRoute, poemRoute, postRoute, routeHref } from "../src/routes.js";
import { normalizeSiteUrl, siteUrlForPath } from "../src/siteUrl.js";
import { parseRssDate } from "./generate-rss.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const parserByType = {
  post: parsePostMetadata,
  poem: parsePoemMetadata,
  music: parseMusicReviewMetadata,
};

/**
 * @param {string} directory
 * @param {string} extension
 * @param {string} [prefix]
 * @returns {Promise<string[]>}
 */
async function findContentFiles(directory, extension, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith(".")) continue;
    const relativeName = prefix ? `${prefix}/${entry.name}` : entry.name;
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`内容文件不能是符号链接：${relativeName}`);
    if (entry.isDirectory()) files.push(...await findContentFiles(path, extension, relativeName));
    else if (entry.isFile() && entry.name.endsWith(extension)) files.push(path);
  }
  return files;
}

/**
 * Read all published content metadata for the sitemap. The same frontmatter
 * parsers and repository definitions as the content manifest are used here.
 * @param {string} [sourceRoot]
 * @returns {Promise<Record<string, Array<Record<string, any>>>>}
 */
export async function readSitemapEntries(sourceRoot = root) {
  const collections = {};
  for (const [type, definition] of Object.entries(contentRepositoryConfig.collections)) {
    const parser = parserByType[definition.parser || type];
    if (!parser) continue;
    const sourceDirectory = join(sourceRoot, definition.directory);
    const files = await findContentFiles(sourceDirectory, definition.extension);
    const entries = await Promise.all(files.map(async (path) => {
      const raw = await readFile(path, "utf8");
      return parser(relative(sourceRoot, path).replaceAll("\\", "/"), raw);
    }));
    collections[type] = entries.sort(sortNewestFirst);
  }
  return collections;
}

/** @param {unknown} value @returns {string} */
function sitemapDate(value) {
  return parseRssDate(value).toISOString();
}

/**
 * @param {Record<string, Array<Record<string, any>>>} collections
 * @param {string} siteUrl
 * @param {{ showPoems?: boolean, showMusic?: boolean }} [config]
 * @returns {string}
 */
export function buildSitemap(collections, siteUrl, config = {}) {
  const base = normalizeSiteUrl(siteUrl);
  if (!base) return "";
  const records = new Map();
  const add = (path, date) => {
    const location = siteUrlForPath(base, path);
    if (!location) return;
    const previous = records.get(location);
    if (!previous || (date && date > previous)) records.set(location, date || previous || "");
  };
  const posts = Array.isArray(collections.post) ? collections.post : [];
  const poems = config.showPoems === true && Array.isArray(collections.poem) ? collections.poem : [];
  const music = config.showMusic === true && Array.isArray(collections.music) ? collections.music : [];
  const latest = (entries) => entries[0]?.date ? sitemapDate(entries[0].date) : "";

  add(routeHref("/"), latest(posts));
  add(routeHref("/posts"), latest(posts));
  add(routeHref("/friends"), "");
  add(routeHref("/about"), "");
  if (config.showPoems === true) add(routeHref("/poems"), latest(poems));
  if (config.showMusic === true) add(routeHref("/music"), latest(music));
  posts.forEach((post) => add(postRoute(post.slug), sitemapDate(post.date)));
  poems.forEach((poem) => add(poemRoute(poem.slug), sitemapDate(poem.date)));
  music.forEach((review) => add(musicRoute(review.section, review.slug), sitemapDate(review.date)));

  const urls = [...records.entries()].sort(([left], [right]) => left.localeCompare(right));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(([location, lastmod]) => [
      "  <url>",
      `    <loc>${escapeXml(location)}</loc>`,
      lastmod ? `    <lastmod>${escapeXml(lastmod)}</lastmod>` : "",
      "  </url>",
    ].filter(Boolean).join("\n")),
    "</urlset>",
    "",
  ].join("\n");
}

/** @param {unknown} value @returns {string} */
export function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * Generate the repository-owned sitemap during dev/build. An empty siteUrl
 * removes any previous generated sitemap so no placeholder domain is served.
 * @param {{ root?: string, config?: Record<string, any> }} [options]
 */
export async function generateSitemap({ root: sourceRoot = root, config = siteConfig } = {}) {
  const base = normalizeSiteUrl(config.siteUrl);
  const destination = join(sourceRoot, "public", "sitemap.xml");
  if (!base) {
    await rm(destination, { force: true });
    console.log("Sitemap 未生成：siteUrl 为空。");
    return "";
  }
  const collections = await readSitemapEntries(sourceRoot);
  const sitemap = buildSitemap(collections, base, config);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, sitemap, "utf8");
  console.log(`Sitemap 已生成：${relative(sourceRoot, destination)}。`);
  return sitemap;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateSitemap();
}
