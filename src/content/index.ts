import friends from "./friends.json" with { type: "json" };
import { authorProfile, navItems, siteConfig } from "../siteConfig.js";
import { parseMusicReview, parsePoem, parsePost, sortNewestFirst } from "./frontmatter.js";
import { contentManifest } from "../../functions/_generated/content-metadata.js";
import { contentRoute as buildContentRoute } from "../routes.js";
import { registerResponsiveImages } from "../responsiveImages.ts";
import type {
  CollectionDescriptor,
  CollectionDescriptors,
  CollectionHome,
  MusicHomeEntry,
  CollectionHomeEntry,
  CollectionPageEntry,
  ContentFacetEntry,
  ContentParser,
  ContentRouteEntry,
  ContentSearchEntry,
  FriendLink,
  HomeContent,
  MusicCollectionDescriptor,
  MusicFacetEntry,
  MusicPageEntry,
  MusicSearchEntry,
  PoemCollectionDescriptor,
  PoemFacetEntry,
  PoemHomeEntry,
  PoemPageEntry,
  PoemSearchEntry,
  PostCollectionDescriptor,
  PostFacetEntry,
  PostHomeEntry,
  PostPageEntry,
  PostSearchEntry,
} from "./types.ts";
import type { GenericContentEntry, MusicReview, Poem, Post } from "./types.ts";

const descriptors: CollectionDescriptors = contentManifest?.collections && typeof contentManifest.collections === "object"
  ? contentManifest.collections as unknown as CollectionDescriptors
  : {};
const basePath = contentManifest?.basePath || "/fonscape/content/";
const pageRequests = new Map<string, Promise<readonly CollectionPageEntry[]>>();
const facetRequests = new Map<string, Promise<readonly ContentFacetEntry[]>>();
const searchRequests = new Map<string, Promise<readonly ContentSearchEntry[]>>();
const entryRequests = new Map<string, Promise<Record<string, unknown> | null>>();
const collectionRequests = new Map<string, Promise<readonly CollectionPageEntry[]>>();
const featuredRequests = new Map<string, Promise<readonly CollectionHomeEntry[]>>();
const searchIndexRequests = new Map<string, Promise<readonly ContentSearchEntry[]>>();
const emptyCollection: readonly CollectionPageEntry[] = Object.freeze([]);
const emptyCollectionRequest = Promise.resolve(emptyCollection);

interface HttpError extends Error {
  status: number;
}

function isHttpError(error: unknown): error is HttpError {
  return error instanceof Error && typeof (error as Partial<HttpError>).status === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function responsiveImagesOf(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  return (value as { responsiveImages?: unknown }).responsiveImages;
}

function frozenObject<T extends object>(value: unknown): Readonly<T> {
  return Object.freeze({ ...(value as object) }) as Readonly<T>;
}

function frozenObjects<T extends object>(value: unknown): readonly T[] {
  if (!Array.isArray(value)) throw new Error("内容分块格式无效。");
  return Object.freeze(value.map((entry) => frozenObject<T>(entry)));
}

function pathFor(kind: string, type: string, value?: number) {
  const suffix = value === undefined ? "" : `/${encodeURIComponent(String(value))}`;
  return `${basePath}${kind}/${encodeURIComponent(type)}${suffix}.json`;
}

function entryPath(type: string, key: string) {
  const encodedKey = String(key).split("/").map(encodeURIComponent).join("/");
  return `${basePath}entries/${encodeURIComponent(type)}/${encodedKey}.json`;
}

async function fetchJson(path: string, label: string): Promise<unknown> {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    const error = Object.assign(new Error(`${label}加载失败：${response.status}。`), { status: response.status }) as HttpError;
    throw error;
  }
  return (await response.json()) as unknown;
}

function cachedRequest<T>(cache: Map<string, Promise<T>>, key: string, request: () => Promise<T>): Promise<T> {
  const existing = cache.get(key);
  if (existing) return existing;
  const promise = Promise.resolve().then(request).catch((error: unknown) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, promise);
  return promise;
}

export function getCollectionDescriptor(type: "post"): Readonly<PostCollectionDescriptor> | null;
export function getCollectionDescriptor(type: "poem"): Readonly<PoemCollectionDescriptor> | null;
export function getCollectionDescriptor(type: "music"): Readonly<MusicCollectionDescriptor> | null;
export function getCollectionDescriptor(type: string): Readonly<CollectionDescriptor> | null;
export function getCollectionDescriptor(type: string): Readonly<CollectionDescriptor> | null {
  const descriptor = descriptors[type];
  return descriptor ? frozenObject<CollectionDescriptor>(descriptor) : null;
}

export const contentCollectionTypes: readonly string[] = Object.freeze(Object.keys(descriptors));

export function loadCollectionPageChunk(type: "post", index: number): Promise<readonly PostPageEntry[]>;
export function loadCollectionPageChunk(type: "poem", index: number): Promise<readonly PoemPageEntry[]>;
export function loadCollectionPageChunk(type: "music", index: number): Promise<readonly MusicPageEntry[]>;
export function loadCollectionPageChunk(type: string, index: number): Promise<readonly CollectionPageEntry[]>;
export function loadCollectionPageChunk(type: string, index: number): Promise<readonly CollectionPageEntry[]> {
  const descriptor = descriptors[type];
  if (!descriptor || index < 0 || index >= descriptor.pageChunkCount) return emptyCollectionRequest;
  const key = `${type}:${index}`;
  return cachedRequest(pageRequests, key, () => fetchJson(pathFor("pages", type, index), `${type} 内容分块`)
    .then((value) => {
      if (!Array.isArray(value)) throw new Error(`${type} 内容分块格式无效。`);
      value.forEach((entry) => registerResponsiveImages(responsiveImagesOf(entry)));
      return frozenObjects<CollectionPageEntry>(value);
    }));
}

export function loadCollection(type: "post"): Promise<readonly PostPageEntry[]>;
export function loadCollection(type: "poem"): Promise<readonly PoemPageEntry[]>;
export function loadCollection(type: "music"): Promise<readonly MusicPageEntry[]>;
export function loadCollection(type: string): Promise<readonly CollectionPageEntry[]>;
export function loadCollection(type: string): Promise<readonly CollectionPageEntry[]> {
  const descriptor = descriptors[type];
  if (!descriptor) return Promise.resolve([]);
  return cachedRequest(collectionRequests, type, () => Promise.all(
    Array.from({ length: descriptor.pageChunkCount }, (_, index) => loadCollectionPageChunk(type, index)),
  ).then((chunks) => Object.freeze(chunks.flat())));
}

function loadIndex<T extends object>(
  type: string,
  kind: string,
  count: number,
  cache: Map<string, Promise<readonly T[]>>,
): Promise<readonly T[]> {
  const descriptor = descriptors[type];
  if (!descriptor || !count) return Promise.resolve([]);
  return cachedRequest(cache, type, () => Promise.all(
    Array.from({ length: count }, (_, index) => fetchJson(pathFor(kind, type, index), `${type} ${kind} 索引`)),
  ).then((chunks) => {
    if (chunks.some((chunk) => !Array.isArray(chunk))) throw new Error(`${type} ${kind} 索引格式无效。`);
    return frozenObjects<T>(chunks.flat());
  }));
}

export function loadCollectionFacets(type: "post"): Promise<readonly PostFacetEntry[]>;
export function loadCollectionFacets(type: "poem"): Promise<readonly PoemFacetEntry[]>;
export function loadCollectionFacets(type: "music"): Promise<readonly MusicFacetEntry[]>;
export function loadCollectionFacets(type: string): Promise<readonly ContentFacetEntry[]>;
export function loadCollectionFacets(type: string): Promise<readonly ContentFacetEntry[]> {
  return loadIndex(type, "facets", descriptors[type]?.facetChunkCount || 0, facetRequests);
}

export function loadCollectionSearch(type: "post"): Promise<readonly PostSearchEntry[]>;
export function loadCollectionSearch(type: "poem"): Promise<readonly PoemSearchEntry[]>;
export function loadCollectionSearch(type: "music"): Promise<readonly MusicSearchEntry[]>;
export function loadCollectionSearch(type: string): Promise<readonly ContentSearchEntry[]>;
export function loadCollectionSearch(type: string): Promise<readonly ContentSearchEntry[]> {
  return loadIndex(type, "search", descriptors[type]?.searchChunkCount || 0, searchRequests);
}

export function loadSearchIndex(types?: readonly string[]): Promise<readonly ContentSearchEntry[]> {
  const normalizedTypes = [...new Set((types || contentCollectionTypes).map(String))];
  const key = normalizedTypes.join("|");
  return cachedRequest(searchIndexRequests, key, () => Promise.all(normalizedTypes.map((type) => loadCollectionSearch(type)))
    .then((collections) => Object.freeze(collections.flat().sort(sortNewestFirst))));
}

const parsers: Partial<Record<string, ContentParser>> = {
  post: parsePost,
  poem: parsePoem,
  music: parseMusicReview,
};
const keyFor: Partial<Record<string, (entry: GenericContentEntry) => string>> = {
  post: (entry) => String(entry.slug),
  poem: (entry) => String(entry.slug),
  music: (entry) => `${String(entry.section)}/${String(entry.slug)}`,
};

export function loadContentEntry(type: "post", key: unknown, parser?: typeof parsePost): Promise<Post | null>;
export function loadContentEntry(type: "poem", key: unknown, parser?: typeof parsePoem): Promise<Poem | null>;
export function loadContentEntry(type: "music", key: unknown, parser?: typeof parseMusicReview): Promise<MusicReview | null>;
export function loadContentEntry<T extends GenericContentEntry>(type: string, key: unknown, parser: ContentParser<T>): Promise<T | null>;
export function loadContentEntry(type: string, key: unknown, parser?: ContentParser): Promise<Record<string, unknown> | null>;
export function loadContentEntry(type: string, key: unknown, parser?: ContentParser): Promise<Record<string, unknown> | null> {
  const normalizedKey = String(key);
  const cacheKey = `${type}:${normalizedKey}`;
  return cachedRequest(entryRequests, cacheKey, async () => {
    let metadata: Record<string, unknown>;
    try {
      const value = await fetchJson(entryPath(type, normalizedKey), `${type} 内容`);
      if (!isRecord(value)) throw new Error(`${type} 内容 metadata 无效。`);
      metadata = value;
    } catch (error: unknown) {
      if (isHttpError(error) && error.status === 404) return null;
      throw error;
    }
    if (typeof metadata.body !== "string") throw new Error(`${type} 内容 metadata 无效。`);
    registerResponsiveImages(metadata.responsiveImages);
    const response = await fetch(metadata.body, { headers: { Accept: "text/markdown, text/plain" } });
    if (!response.ok) throw new Error(`${type} 内容正文加载失败：${response.status}。`);
    const source = await response.text();
    const parserToUse = parser || parsers[type];
    if (typeof parserToUse !== "function") return Object.freeze({ ...metadata, content: source });
    const entry = parserToUse(metadata.source as string, source);
    if (keyFor[type]?.(entry) !== normalizedKey) throw new Error(`${type} 内容 metadata 与正文不一致。`);
    const { key: _key, source: _source, body: _body, ...lightweight } = metadata;
    return Object.freeze({ ...lightweight, ...entry });
  });
}

export function loadPost(slug: unknown) {
  return loadContentEntry("post", slug, parsePost);
}

export function loadPoem(slug: unknown) {
  return loadContentEntry("poem", slug, parsePoem);
}

export function loadMusicReview(section: unknown, slug: unknown) {
  return loadContentEntry("music", `${section}/${slug}`, parseMusicReview);
}

export function loadFeaturedChunk(type: "post", index: number): Promise<readonly PostHomeEntry[]>;
export function loadFeaturedChunk(type: "poem", index: number): Promise<readonly PoemHomeEntry[]>;
export function loadFeaturedChunk(type: "music", index: number): Promise<readonly CollectionHomeEntry[]>;
export function loadFeaturedChunk(type: string, index: number): Promise<readonly CollectionHomeEntry[]>;
export function loadFeaturedChunk(type: string, index: number): Promise<readonly CollectionHomeEntry[]> {
  const descriptor = descriptors[type];
  if (!descriptor || index < 0 || index >= descriptor.featuredChunkCount) return Promise.resolve([]);
  const key = `${type}:${index}`;
  return cachedRequest(featuredRequests, key, () => fetchJson(pathFor("featured", type, index), `${type} 置顶内容`)
    .then((value) => {
      if (!Array.isArray(value)) throw new Error(`${type} 置顶内容格式无效。`);
      return frozenObjects<CollectionHomeEntry>(value);
    }));
}

const postHome: CollectionHome<PostHomeEntry> = descriptors.post?.home || { latest: [], featured: [] };
const poemHome: CollectionHome<PoemHomeEntry> = descriptors.poem?.home || { latest: [] };
const musicHome: CollectionHome<MusicHomeEntry> = descriptors.music?.home || { latest: [] };
[...(postHome.featured || []), ...(postHome.latest || []), ...(poemHome.latest || []), ...(musicHome.latest || [])]
  .forEach((entry) => registerResponsiveImages(responsiveImagesOf(entry)));
const counts = Object.fromEntries(Object.entries(descriptors).map(([type, descriptor]) => [type, Number(descriptor.count || 0)]));
export const homeContent: Readonly<HomeContent> = Object.freeze({
  featuredPosts: Object.freeze(postHome.featured || []),
  featuredCount: Number(descriptors.post?.featuredCount || 0),
  featuredChunkSize: Number(descriptors.post?.featuredChunkSize || 8),
  recentPosts: Object.freeze(postHome.latest || []),
  latestPoems: Object.freeze(poemHome.latest || []),
  latestMusic: Object.freeze(musicHome.latest || []),
  counts: Object.freeze(counts),
});

export function contentRoute(type: string, entry?: ContentRouteEntry) {
  return buildContentRoute(type, entry);
}

const friendLinks: readonly FriendLink[] = friends;
export { authorProfile, friendLinks, navItems, siteConfig };
