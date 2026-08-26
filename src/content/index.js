import friends from "./friends.json" with { type: "json" };
import { authorProfile, navItems, siteConfig } from "../siteConfig.js";
import {
  parseMusicReview,
  parsePoem,
  parsePost,
  sortNewestFirst,
} from "./frontmatter.js";
import { contentMetadata } from "../../functions/_generated/content-metadata.js";

// Vite keeps these raw Markdown modules behind async functions. Only the
// generated metadata manifest is part of the initial graph; a detail route
// invokes one loader for its own source file.
const postSources = import.meta.glob("./posts/**/*.md", {
  query: "?raw",
  import: "default",
});
const poemSources = import.meta.glob("./poems/**/*.md", {
  query: "?raw",
  import: "default",
});
const musicSources = import.meta.glob("./music/**/*.md", {
  query: "?raw",
  import: "default",
});

/**
 * @typedef {() => Promise<unknown>} SourceLoader
 */

/**
 * @template {Record<string, unknown>} T
 * @param {unknown} value
 * @param {string} label
 * @returns {Array<{ source: string, metadata: T }>}
 */
function metadataEntries(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} 内容 metadata 无效。`);
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || typeof entry.source !== "string") {
      throw new Error(`${label} 内容 metadata 缺少 source。`);
    }
    const { source, ...metadata } = entry;
    if (!Object.hasOwn(metadata, "slug")) throw new Error(`${label} 内容 metadata 缺少 slug。`);
    return { source, metadata: Object.freeze(metadata) };
  });
}

/**
 * @template {Record<string, unknown>} T
 * @param {unknown} value
 * @param {Record<string, SourceLoader>} sources
 * @param {(path: string, source: string) => T} parser
 * @param {string} label
 * @param {(entry: T) => string} keyFor
 * @returns {{ entries: T[], loaders: Map<string, () => Promise<T>> }}
 */
function createCollection(value, sources, parser, label, keyFor) {
  const loaders = new Map();
  const entries = metadataEntries(value, label).map(({ source, metadata }) => {
    const loadSource = sources[source];
    if (typeof loadSource !== "function") throw new Error(`${label} 内容源不存在：${source}`);
    let loaded;
    const load = () => {
      if (!loaded) {
        loaded = Promise.resolve(loadSource()).then((raw) => {
          const entry = parser(source, String(raw));
          if (keyFor(entry) !== keyFor(/** @type {T} */ (metadata))) {
            throw new Error(`${label} 内容 metadata 与正文不一致：${source}`);
          }
          return Object.freeze({ ...metadata, ...entry });
        }).catch((error) => {
          loaded = null;
          throw error;
        });
      }
      return loaded;
    };
    const key = keyFor(/** @type {T} */ (metadata));
    if (loaders.has(key)) throw new Error(`${label} 中存在重复 slug：${key}`);
    loaders.set(key, load);
    return /** @type {T} */ (metadata);
  }).sort(sortNewestFirst);
  return { entries, loaders };
}

const postCollection = createCollection(
  contentMetadata.post,
  postSources,
  parsePost,
  "文章",
  (entry) => String(entry.slug),
);
const poemCollection = createCollection(
  contentMetadata.poem,
  poemSources,
  parsePoem,
  "小诗",
  (entry) => String(entry.slug),
);
const musicCollection = createCollection(
  contentMetadata.music,
  musicSources,
  parseMusicReview,
  "音乐",
  (entry) => `${String(entry.section)}/${String(entry.slug)}`,
);

export const posts = postCollection.entries;
export const poems = poemCollection.entries;
const allMusicReviews = musicCollection.entries;
export const musicReviews = Object.fromEntries(
  ["songs", "artists", "albums"].map((section) => [
    section,
    allMusicReviews.filter((review) => review.section === section),
  ]),
);

/** @param {string} slug */
export function loadPost(slug) {
  return postCollection.loaders.get(slug)?.() || Promise.resolve(null);
}

/** @param {string} slug */
export function loadPoem(slug) {
  return poemCollection.loaders.get(slug)?.() || Promise.resolve(null);
}

/**
 * @param {string} section
 * @param {string} slug
 */
export function loadMusicReview(section, slug) {
  return musicCollection.loaders.get(`${section}/${slug}`)?.() || Promise.resolve(null);
}

/** @param {string} slug */
export function preloadPost(slug) {
  return loadPost(slug);
}

/** @param {string} slug */
export function preloadPoem(slug) {
  return loadPoem(slug);
}

/**
 * @param {string} section
 * @param {string} slug
 */
export function preloadMusicReview(section, slug) {
  return loadMusicReview(section, slug);
}

const friendLinks = friends;
export { authorProfile, friendLinks, navItems, siteConfig };
