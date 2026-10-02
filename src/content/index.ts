import type { ContentEntry, ContentFacetByType, ContentManifest, ContentMetadataByType, ContentSearchEntry, ContentType, GenericContentMetadata, HomeContent, HomeMusic, HomePoem, HomePost, MusicReview, Poem, Post, PublishedFriend } from "../types.ts";

type CollectionMetadata<T extends string> = T extends keyof ContentMetadataByType ? ContentMetadataByType[T] : GenericContentMetadata;
type ContentParser<T> = (path: string, source: string) => T;
interface EntryMetadata {
  key?: string;
  source: string;
  body: string;
  responsiveImages?: unknown;
}

import friends from "./friends.json" with { type: "json" };
import { authorProfile, navItems, siteConfig } from "../siteConfig.ts";
import { parseMusicReview, parsePoem, parsePost, sortNewestFirst } from "./frontmatter.ts";
import { contentManifest } from "../../functions/_generated/content-metadata.js";
import { contentRoute as buildContentRoute } from "../routes.ts";
import { registerResponsiveImages } from "../responsiveImages.ts";

const descriptors: ContentManifest["collections"] = contentManifest?.collections && typeof contentManifest.collections === "object"
  ? contentManifest.collections
  : {};
const basePath = contentManifest?.basePath || "/fonscape/content/";
const pageRequests = new Map<string, Promise<unknown>>();
const facetRequests = new Map<string, Promise<unknown>>();
const searchRequests = new Map<string, Promise<unknown>>();
const entryRequests = new Map<string, Promise<unknown>>();
const collectionRequests = new Map<string, Promise<unknown>>();
const featuredRequests = new Map<string, Promise<unknown>>();
const searchIndexRequests = new Map<string, Promise<unknown>>();
const emptyCollection: readonly never[] = Object.freeze([]);
const emptyCollectionRequest = Promise.resolve(emptyCollection);

function pathFor(kind: string, type: string, value: unknown) {
  const suffix = value === undefined ? "" : `/${encodeURIComponent(String(value))}`;
  return `${basePath}${kind}/${encodeURIComponent(type)}${suffix}.json`;
}

function entryPath(type: string, key: string) {
  const encodedKey = String(key).split("/").map(encodeURIComponent).join("/");
  return `${basePath}entries/${encodeURIComponent(type)}/${encodedKey}.json`;
}

async function fetchJson<T>(path: string, label: string): Promise<T> {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    const error = Object.assign(new Error(`${label}加载失败：${response.status}。`), { status: response.status });
    throw error;
  }
  return response.json();
}

function cachedRequest<T>(cache: Map<string, Promise<unknown>>, key: string, request: () => T | Promise<T>): Promise<T> {
  if (!cache.has(key)) {
    const promise = Promise.resolve().then(request).catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, promise);
  }
  return cache.get(key) as Promise<T>;
}

export function getCollectionDescriptor(type: string) {
  const descriptor = descriptors[type];
  return descriptor ? Object.freeze({ ...descriptor }) : null;
}

export const contentCollectionTypes = Object.freeze(Object.keys(descriptors));

export function loadCollectionPageChunk<T extends ContentType>(type: T, index: number): Promise<readonly ContentMetadataByType[T][]>;
export function loadCollectionPageChunk(type: string, index: number): Promise<readonly GenericContentMetadata[]>;
export function loadCollectionPageChunk<T extends string>(type: T, index: number): Promise<readonly CollectionMetadata<T>[]> {
  const descriptor = descriptors[type];
  if (!descriptor || index < 0 || index >= descriptor.pageChunkCount) return emptyCollectionRequest;
  const key = `${type}:${index}`;
  return cachedRequest(pageRequests, key, () => fetchJson<CollectionMetadata<T>[]>(pathFor("pages", type, index), `${type} 内容分块`)
    .then((value) => {
      if (!Array.isArray(value)) throw new Error(`${type} 内容分块格式无效。`);
      value.forEach((entry) => registerResponsiveImages(entry?.responsiveImages));
      return Object.freeze(value.map((entry) => Object.freeze({ ...entry }) as CollectionMetadata<T>));
    }));
}

export function loadCollection<T extends string>(type: T): Promise<readonly CollectionMetadata<T>[]> {
  const descriptor = descriptors[type];
  if (!descriptor) return Promise.resolve([]);
  return cachedRequest(collectionRequests, type, () => Promise.all(
    Array.from({ length: descriptor.pageChunkCount }, (_, index) => loadCollectionPageChunk(type, index)),
  ).then((chunks) => Object.freeze(chunks.flat()) as readonly CollectionMetadata<T>[]));
}

function loadIndex<T>(type: string, kind: string, count: number, cache: Map<string, Promise<unknown>>): Promise<readonly T[]> {
  const descriptor = descriptors[type];
  if (!descriptor || !count) return Promise.resolve([]);
  return cachedRequest(cache, type, () => Promise.all(
    Array.from({ length: count }, (_, index) => fetchJson<T[]>(pathFor(kind, type, index), `${type} ${kind} 索引`)),
  ).then((chunks) => {
    if (chunks.some((chunk) => !Array.isArray(chunk))) throw new Error(`${type} ${kind} 索引格式无效。`);
    return Object.freeze(chunks.flat().map((entry) => Object.freeze({ ...entry })));
  }));
}

export function loadCollectionFacets<T extends ContentType>(type: T): Promise<readonly ContentFacetByType[T][]> {
  return loadIndex<ContentFacetByType[T]>(type, "facets", descriptors[type]?.facetChunkCount || 0, facetRequests);
}

export function loadCollectionSearch(type: string): Promise<readonly ContentSearchEntry[]> {
  return loadIndex<ContentSearchEntry>(type, "search", descriptors[type]?.searchChunkCount || 0, searchRequests);
}

export function loadSearchIndex(types: readonly string[] = contentCollectionTypes): Promise<readonly ContentSearchEntry[]> {
  const normalizedTypes = [...new Set(types.map(String))];
  const key = normalizedTypes.join("|");
  return cachedRequest(searchIndexRequests, key, () => Promise.all(normalizedTypes.map((type) => loadCollectionSearch(type)))
    .then((collections) => Object.freeze(collections.flat().sort(sortNewestFirst))));
}

const parsers: Record<string, ContentParser<ContentEntry>> = { post: parsePost, poem: parsePoem, music: parseMusicReview };
const keyFor: Record<string, (entry: ContentEntry) => string> = {
  post: (entry) => String(entry.slug),
  poem: (entry) => String(entry.slug),
  music: (entry) => `${String((entry as MusicReview).section)}/${String(entry.slug)}`,
};

export function loadContentEntry<T extends ContentEntry>(type: string, key: string, parser: ContentParser<T>): Promise<Readonly<T> | null>;
export function loadContentEntry(type: string, key: string, parser?: ContentParser<ContentEntry>): Promise<Readonly<ContentEntry> | Readonly<EntryMetadata & { content: string }> | null>;
export function loadContentEntry(type: string, key: string, parser: ContentParser<ContentEntry> | undefined = parsers[type]) {
  const normalizedKey = String(key);
  const cacheKey = `${type}:${normalizedKey}`;
  return cachedRequest(entryRequests, cacheKey, async () => {
    let metadata: EntryMetadata;
    try {
      metadata = await fetchJson<EntryMetadata>(entryPath(type, normalizedKey), `${type} 内容`);
    } catch (error) {
      if ((error as { status?: number } | null)?.status === 404) return null;
      throw error;
    }
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) || typeof metadata.body !== "string") {
      throw new Error(`${type} 内容 metadata 无效。`);
    }
    registerResponsiveImages(metadata.responsiveImages);
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

export function loadPost(slug: string) {
  return loadContentEntry<Post>("post", slug, parsePost);
}

export function loadPoem(slug: string) {
  return loadContentEntry<Poem>("poem", slug, parsePoem);
}

export function loadMusicReview(section: string, slug: string) {
  return loadContentEntry<MusicReview>("music", `${section}/${slug}`, parseMusicReview);
}

export function loadFeaturedChunk<T extends string>(type: T, index: number): Promise<readonly CollectionMetadata<T>[]> {
  const descriptor = descriptors[type];
  if (!descriptor || index < 0 || index >= descriptor.featuredChunkCount) return Promise.resolve([]);
  const key = `${type}:${index}`;
  return cachedRequest(featuredRequests, key, () => fetchJson<CollectionMetadata<T>[]>(pathFor("featured", type, index), `${type} 置顶内容`)
    .then((value) => {
      if (!Array.isArray(value)) throw new Error(`${type} 置顶内容格式无效。`);
      value.forEach((entry) => registerResponsiveImages(entry?.responsiveImages));
      return Object.freeze(value.map((entry) => Object.freeze({ ...entry }) as CollectionMetadata<T>));
    }));
}

const postHome = (descriptors.post?.home || { latest: [], featured: [] }) as { latest: HomePost[]; featured?: HomePost[] };
const poemHome = (descriptors.poem?.home || { latest: [] }) as { latest: HomePoem[] };
const musicHome = (descriptors.music?.home || { latest: [] }) as { latest: HomeMusic[] };
[...(postHome.featured || []), ...(postHome.latest || []), ...(poemHome.latest || []), ...(musicHome.latest || [])]
  .forEach((entry) => registerResponsiveImages(entry?.responsiveImages));
export const homeContent: Readonly<HomeContent> = Object.freeze({
  featuredPosts: Object.freeze(postHome.featured || []),
  featuredCount: Number(descriptors.post?.featuredCount || 0),
  featuredChunkSize: Number(descriptors.post?.featuredChunkSize || 8),
  recentPosts: Object.freeze(postHome.latest || []),
  latestPoems: Object.freeze(poemHome.latest || []),
  latestMusic: Object.freeze(musicHome.latest || []),
  counts: Object.freeze(Object.fromEntries(Object.entries(descriptors).map(([type, descriptor]) => [type, Number(descriptor.count || 0)]))),
});

export function contentRoute(type: string, entry: { key?: string; slug?: string; section?: string }) {
  return buildContentRoute(type, entry);
}

const friendLinks = friends as PublishedFriend[];
export { authorProfile, friendLinks, navItems, siteConfig };
