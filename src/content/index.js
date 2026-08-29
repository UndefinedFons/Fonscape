import friends from "./friends.json" with { type: "json" };
import { authorProfile, navItems, siteConfig } from "../siteConfig.js";
import { parseMusicReview, parsePoem, parsePost, sortNewestFirst } from "./frontmatter.js";
import { contentManifest } from "../../functions/_generated/content-metadata.js";

const descriptors = contentManifest?.collections && typeof contentManifest.collections === "object"
  ? contentManifest.collections
  : {};
const basePath = contentManifest?.basePath || "/fonscape/content/";
const pageRequests = new Map();
const facetRequests = new Map();
const searchRequests = new Map();
const entryRequests = new Map();
const collectionRequests = new Map();
const featuredRequests = new Map();
const searchIndexRequests = new Map();

function pathFor(kind, type, value) {
  const suffix = value === undefined ? "" : `/${encodeURIComponent(String(value))}`;
  return `${basePath}${kind}/${encodeURIComponent(type)}${suffix}.json`;
}

function entryPath(type, key) {
  const encodedKey = String(key).split("/").map(encodeURIComponent).join("/");
  return `${basePath}entries/${encodeURIComponent(type)}/${encodedKey}.json`;
}

async function fetchJson(path, label) {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    const error = Object.assign(new Error(`${label}加载失败：${response.status}。`), { status: response.status });
    throw error;
  }
  return response.json();
}

function cachedRequest(cache, key, request) {
  if (!cache.has(key)) {
    const promise = Promise.resolve().then(request).catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, promise);
  }
  return cache.get(key);
}

export function getCollectionDescriptor(type) {
  const descriptor = descriptors[type];
  return descriptor ? Object.freeze({ ...descriptor }) : null;
}

export const contentCollectionTypes = Object.freeze(Object.keys(descriptors));

export function loadCollectionPageChunk(type, index) {
  const descriptor = descriptors[type];
  if (!descriptor || index < 0 || index >= descriptor.pageChunkCount) return Promise.resolve([]);
  const key = `${type}:${index}`;
  return cachedRequest(pageRequests, key, () => fetchJson(pathFor("pages", type, index), `${type} 内容分块`)
    .then((value) => {
      if (!Array.isArray(value)) throw new Error(`${type} 内容分块格式无效。`);
      return Object.freeze(value.map((entry) => Object.freeze({ ...entry })));
    }));
}

export function loadCollection(type) {
  const descriptor = descriptors[type];
  if (!descriptor) return Promise.resolve([]);
  return cachedRequest(collectionRequests, type, () => Promise.all(
    Array.from({ length: descriptor.pageChunkCount }, (_, index) => loadCollectionPageChunk(type, index)),
  ).then((chunks) => Object.freeze(chunks.flat())));
}

function loadIndex(type, kind, count, cache) {
  const descriptor = descriptors[type];
  if (!descriptor || !count) return Promise.resolve([]);
  return cachedRequest(cache, type, () => Promise.all(
    Array.from({ length: count }, (_, index) => fetchJson(pathFor(kind, type, index), `${type} ${kind} 索引`)),
  ).then((chunks) => {
    if (chunks.some((chunk) => !Array.isArray(chunk))) throw new Error(`${type} ${kind} 索引格式无效。`);
    return Object.freeze(chunks.flat().map((entry) => Object.freeze({ ...entry })));
  }));
}

export function loadCollectionFacets(type) {
  return loadIndex(type, "facets", descriptors[type]?.facetChunkCount || 0, facetRequests);
}

export function loadCollectionSearch(type) {
  return loadIndex(type, "search", descriptors[type]?.searchChunkCount || 0, searchRequests);
}

export function loadSearchIndex(types = contentCollectionTypes) {
  const normalizedTypes = [...new Set(types.map(String))];
  const key = normalizedTypes.join("|");
  return cachedRequest(searchIndexRequests, key, () => Promise.all(normalizedTypes.map((type) => loadCollectionSearch(type)))
    .then((collections) => Object.freeze(collections.flat().sort(sortNewestFirst))));
}

const parsers = { post: parsePost, poem: parsePoem, music: parseMusicReview };
const keyFor = {
  post: (entry) => String(entry.slug),
  poem: (entry) => String(entry.slug),
  music: (entry) => `${String(entry.section)}/${String(entry.slug)}`,
};

export function loadContentEntry(type, key, parser = parsers[type]) {
  const normalizedKey = String(key);
  const cacheKey = `${type}:${normalizedKey}`;
  return cachedRequest(entryRequests, cacheKey, async () => {
    let metadata;
    try {
      metadata = await fetchJson(entryPath(type, normalizedKey), `${type} 内容`);
    } catch (error) {
      if (error?.status === 404) return null;
      throw error;
    }
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) || typeof metadata.body !== "string") {
      throw new Error(`${type} 内容 metadata 无效。`);
    }
    const response = await fetch(metadata.body, { headers: { Accept: "text/markdown, text/plain" } });
    if (!response.ok) throw new Error(`${type} 内容正文加载失败：${response.status}。`);
    const source = await response.text();
    if (typeof parser !== "function") return Object.freeze({ ...metadata, content: source });
    const entry = parser(metadata.source, source);
    if (keyFor[type]?.(entry) !== normalizedKey) throw new Error(`${type} 内容 metadata 与正文不一致。`);
    const { key: _key, source: _source, body: _body, ...lightweight } = metadata;
    return Object.freeze({ ...lightweight, ...entry });
  });
}

export function loadPost(slug) {
  return loadContentEntry("post", slug, parsePost);
}

export function loadPoem(slug) {
  return loadContentEntry("poem", slug, parsePoem);
}

export function loadMusicReview(section, slug) {
  return loadContentEntry("music", `${section}/${slug}`, parseMusicReview);
}

export function loadFeaturedChunk(type, index) {
  const descriptor = descriptors[type];
  if (!descriptor || index < 0 || index >= descriptor.featuredChunkCount) return Promise.resolve([]);
  const key = `${type}:${index}`;
  return cachedRequest(featuredRequests, key, () => fetchJson(pathFor("featured", type, index), `${type} 置顶内容`)
    .then((value) => {
      if (!Array.isArray(value)) throw new Error(`${type} 置顶内容格式无效。`);
      return Object.freeze(value.map((entry) => Object.freeze({ ...entry })));
    }));
}

const postHome = descriptors.post?.home || { latest: [], featured: [] };
const poemHome = descriptors.poem?.home || { latest: [] };
const musicHome = descriptors.music?.home || { latest: [] };
export const homeContent = Object.freeze({
  featuredPosts: Object.freeze(postHome.featured || []),
  featuredCount: Number(descriptors.post?.featuredCount || 0),
  featuredChunkSize: Number(descriptors.post?.featuredChunkSize || 8),
  recentPosts: Object.freeze(postHome.latest || []),
  latestPoems: Object.freeze(poemHome.latest || []),
  latestMusic: Object.freeze(musicHome.latest || []),
  counts: Object.freeze(Object.fromEntries(Object.entries(descriptors).map(([type, descriptor]) => [type, Number(descriptor.count || 0)]))),
});

export function contentRoute(type, entry) {
  if (type === "post") return `#/post/${entry.slug || entry.key}`;
  if (type === "poem") return `#/poem/${entry.slug || entry.key}`;
  if (type === "music") return `#/music/${entry.key || `${entry.section}/${entry.slug}`}`;
  return "#/";
}

const friendLinks = friends;
export { authorProfile, friendLinks, navItems, siteConfig };
