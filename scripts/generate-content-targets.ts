import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { contentRepositoryConfig } from "../content-repository.config.mjs";
import type {
  ContentManifest,
  DatedEntry,
  GenericContentMetadata,
  HomeMusic,
  HomePoem,
  HomePost,
  MusicReview,
  Poem,
  Post,
  ResponsiveImageMetadata,
} from "../src/types.ts";
import type { MusicMetadata } from "./music-metadata.ts";
import {
  assertUniqueEntries,
  parseGenericContentMetadata,
  parseMarkdownSource,
  parseMusicReviewMetadata,
  parsePoemMetadata,
  parsePostMetadata,
  sortNewestFirst,
} from "../src/content/frontmatter.ts";
import { sortFeaturedPosts } from "../src/pages/homeContent.ts";
import { sortMusicLibrary } from "../src/pages/musicContent.ts";
import { markdownToPlainText } from "../src/content/markdown.ts";
import { extractLocalRasterSources, isLocalRasterSource } from "./generate-responsive-images.ts";
import { parseMetingLibraryUrl, parseMetingSongUrl } from "../src/musicSources.ts";
import { createMusicMetadataResolver, resolveMusicMetadata } from "./music-metadata.ts";

type GeneratedEntry = DatedEntry & GenericContentMetadata & Partial<Post & Poem & MusicReview>;
type ContentParser = (path: string, source: string) => GeneratedEntry;
type CollectionConfig = { directory: string; extension: string; parser?: string };
type CollectionDefinition = Omit<CollectionConfig, "parser"> & { type: string; parser: ContentParser };
type ContentRecord = { name: string; source: string; raw: string; entry: GeneratedEntry };
type CollectionRecords = [type: string, records: ContentRecord[]];
type GeneratedHomeEntry = HomePost | HomePoem | HomeMusic | GenericContentMetadata;
type GeneratedContentEntry = GeneratedEntry & {
  key: string;
  source: string;
  body: string;
  responsiveImages: Record<string, ResponsiveImageMetadata | undefined>;
};
type GeneratedContentFacet = {
  key: string;
  page: number;
  title: string;
  date: string;
  category?: string;
  tags?: string[];
  series?: string | null;
  seriesOrder?: number;
  section?: MusicReview["section"];
};
type GeneratedSearchEntry = {
  type: string;
  key: string;
  title: string;
  date: string;
  category?: string;
  section?: MusicReview["section"];
  sourceTitle?: string;
  noteTitle?: string;
  notePreview?: string;
};
type ImageCatalog = Record<string, ResponsiveImageMetadata | undefined>;
type PreparedGeneratedContentFile = { path: string; content: string; destination: string };
type GenerateContentArtifactsOptions = {
  check?: boolean;
  projectRoot?: string;
  resolveMetadata?: typeof resolveMusicMetadata;
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const CONTENT_SCHEMA_VERSION = 3;
export const CONTENT_PAGE_CHUNK_SIZE = 50;
export const CONTENT_INDEX_CHUNK_SIZE = 200;
export const HOME_LATEST_LIMIT = 5;
export const HOME_FEATURED_CHUNK_SIZE = 8;

const parserByType: Record<string, ContentParser> = {
  post: parsePostMetadata,
  poem: parsePoemMetadata,
  music: parseMusicReviewMetadata,
};

export function resolveCollectionDefinitions(collections: Readonly<Record<string, CollectionConfig>>): CollectionDefinition[] {
  return Object.entries(collections).map(([type, collection]) => {
    const parser = parserByType[collection.parser || type] || parseGenericContentMetadata;
    return { type, ...collection, parser };
  });
}

const definitions = resolveCollectionDefinitions(contentRepositoryConfig.collections);

function assertSafeRelativePath(path: string, label: string): string {
  if (typeof path !== "string"
    || !path
    || path.startsWith("/")
    || path.includes("\\")
    || path.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`${label}路径无效：${path}`);
  }
  return path;
}

function generatedContentDestination(directory: string, path: string): string {
  assertSafeRelativePath(path, "生成内容");
  const outputRoot = resolve(directory);
  const destination = resolve(outputRoot, ...path.split("/"));
  const relativeDestination = relative(outputRoot, destination);
  if (!relativeDestination
    || relativeDestination === ".."
    || relativeDestination.startsWith(`..${sep}`)
    || isAbsolute(relativeDestination)) {
    throw new Error(`生成内容路径超出输出目录：${path}`);
  }
  return destination;
}

function prepareGeneratedContentFiles(files: ReadonlyMap<string, string>, directory: string): PreparedGeneratedContentFile[] {
  const outputRoot = resolve(directory);
  return [...files].map(([path, content]) => ({
    path,
    content,
    destination: generatedContentDestination(outputRoot, path),
  }));
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === code;
}

function errorMessage(error: unknown): string {
  return error !== null && typeof error === "object" && "message" in error ? `${error.message}` : "undefined";
}

async function findMarkdownFiles(directory: string, extension: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (hasErrorCode(error, "ENOENT")) return [];
    throw error;
  });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith(".")) continue;
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    assertSafeRelativePath(name, "内容文件");
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`内容文件不能是符号链接：${name}`);
    if (entry.isDirectory()) files.push(...await findMarkdownFiles(path, extension, name));
    else if (entry.isFile() && entry.name.endsWith(extension)) files.push(name);
  }
  return files;
}

async function readCollection(definition: CollectionDefinition, projectRoot: string): Promise<ContentRecord[]> {
  const sourceDirectory = join(projectRoot, definition.directory);
  const names = await findMarkdownFiles(sourceDirectory, definition.extension);
  return Promise.all(names.map(async (name) => {
    const path = join(sourceDirectory, name);
    const sourcePath = relative(projectRoot, path).replaceAll("\\", "/");
    const raw = await readFile(path, "utf8");
    return {
      name,
      source: `./${definition.directory.replace(/^src\/content\//u, "")}/${name.replaceAll("\\", "/")}`,
      raw,
      entry: definition.parser(sourcePath, raw),
    };
  }));
}

async function resolveMusicRecords(
  records: ContentRecord[],
  resolveMetadata: ReturnType<typeof createMusicMetadataResolver>,
): Promise<void> {
  for (const record of records) {
    const target = parseMetingLibraryUrl(record.entry.url);
    if (!target) continue;
    const { data } = parseMarkdownSource(record.source, record.raw);
    const fields = (["sourceTitle", "sourceMeta", "image"] as const).filter((key) => !Object.hasOwn(data, key)
      || (key === "sourceTitle" && typeof data.sourceTitle === "string" && !data.sourceTitle.trim()));
    if (!fields.length) continue;
    let metadata: MusicMetadata;
    try { metadata = await resolveMetadata(target); }
    catch (error) {
      throw new Error(`${record.source} 无法读取 ${record.entry.url} 的音乐信息：${errorMessage(error)}。请重试，或手动填写 sourceTitle、sourceMeta 和 image。`, { cause: error });
    }
    const additions = fields.filter((key) => !Object.hasOwn(data, key)).map((key) => `${key}: ${JSON.stringify(metadata[key] || "")}`);
    const header = record.raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/u);
    if (!header) throw new Error(`${record.source} 缺少 Frontmatter。`);
    const lines = header[1].split(/\r?\n/u).map((line) => typeof data.sourceTitle === "string" && !data.sourceTitle.trim() && /^\s*sourceTitle:/u.test(line)
      ? `sourceTitle: ${JSON.stringify(metadata.sourceTitle)}` : line);
    record.raw = `---\n${[...lines, ...additions].join("\n")}\n---\n${record.raw.slice(header[0].length)}`;
    record.entry = parseMusicReviewMetadata(record.source, record.raw);
  }
}

async function readAudioAssetSizes(directory = join(root, "public", "audio"), prefix = ""): Promise<Record<string, number>> {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (hasErrorCode(error, "ENOENT")) return [];
    throw error;
  });
  const sizes: Record<string, number> = {};
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith(".")) continue;
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`音频资源不能是符号链接：public/audio/${relativePath}`);
    if (entry.isDirectory()) Object.assign(sizes, await readAudioAssetSizes(absolutePath, relativePath));
    else if (entry.isFile()) {
      const pathname = relativePath.split("/").map(encodeURIComponent).join("/");
      sizes[`/audio/${pathname}`] = (await stat(absolutePath)).size;
    }
  }
  return sizes;
}

export function chunkValues<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

function encodePath(value: string): string {
  return String(value).split("/").map(encodeURIComponent).join("/");
}

export function contentKey(type: string, entry: GeneratedEntry): string {
  return type === "music" ? `${String(entry.section)}/${String(entry.slug)}` : String(entry.slug);
}

export function collectMetingSongTargets(collections: readonly CollectionRecords[]): string[] {
  const targets = new Set<string>();
  for (const [, records] of collections) {
    for (const { entry } of records) {
      const tracks = [entry.music, ...(Array.isArray(entry.musicBlocks) ? entry.musicBlocks : [])];
      for (const track of tracks) {
        if (!track?.url) continue;
        const target = parseMetingSongUrl(track.url);
        if (target) targets.add(`${target.source}:${target.id}`);
      }
    }
  }
  return [...targets].sort();
}

export function collectMetingLibraryTargets(collections: readonly CollectionRecords[]): string[] {
  const targets = new Set<string>();
  for (const [type, records] of collections) {
    if (type !== "music") continue;
    for (const { entry } of records) {
      const target = parseMetingLibraryUrl(entry.url);
      if (target) targets.add(`${target.source}:${target.type}:${target.id}`);
    }
  }
  return [...targets].sort();
}

function collectEntryImageSources(value: unknown, sources = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    if (isLocalRasterSource(value)) sources.add(value);
    return sources;
  }
  if (Array.isArray(value)) value.forEach((item) => collectEntryImageSources(item, sources));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectEntryImageSources(item, sources));
  return sources;
}

function responsiveImagesFor(entry: GeneratedEntry, raw: string, imageCatalog: ImageCatalog): ImageCatalog {
  const sources = collectEntryImageSources(entry);
  for (const source of extractLocalRasterSources(raw || "")) sources.add(source);
  return Object.fromEntries([...sources].sort().flatMap((source) => imageCatalog[source] ? [[source, imageCatalog[source]]] : []));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isResponsiveImageMetadata(value: unknown): value is ResponsiveImageMetadata {
  if (!isRecord(value)
    || typeof value.width !== "number"
    || typeof value.height !== "number"
    || !Array.isArray(value.candidates)
    || (value.lqip !== undefined && typeof value.lqip !== "string")) return false;
  return value.candidates.every((candidate: unknown) => isRecord(candidate)
    && typeof candidate.src === "string"
    && typeof candidate.width === "number");
}

function parseImageCatalog(value: unknown): ImageCatalog {
  if (!isRecord(value)) throw new Error("响应式图片构建清单格式无效。");
  const catalog: ImageCatalog = {};
  for (const [source, metadata] of Object.entries(value)) {
    if (!isResponsiveImageMetadata(metadata)) throw new Error(`响应式图片元数据格式无效：${source}`);
    catalog[source] = metadata;
  }
  return catalog;
}

function homeEntry(type: string, entry: GeneratedEntry, imageCatalog: ImageCatalog = {}): GeneratedHomeEntry {
  const common = { slug: String(entry.slug), title: String((type === "music" ? entry.sourceTitle : entry.title) || ""), date: String(entry.date || "") };
  const responsiveImages = responsiveImagesFor(entry, "", imageCatalog);
  const withImages = Object.keys(responsiveImages).length ? { responsiveImages } : {};
  if (type === "post") return {
    ...common,
    ...withImages,
    category: String(entry.category || ""),
    featured: Boolean(entry.featured),
    ...(Number.isInteger(entry.featuredOrder) ? { featuredOrder: entry.featuredOrder } : {}),
    ...(entry.excerpt ? { excerpt: String(entry.excerpt) } : {}),
    ...(entry.firstParagraph ? { firstParagraph: String(entry.firstParagraph) } : {}),
    wordCount: Number(entry.wordCount) || 0,
    ...(entry.image ? { image: String(entry.image) } : {}),
    ...(entry.cardPosition ? { cardPosition: String(entry.cardPosition) } : {}),
  };
  if (type === "poem") return {
    ...common,
    ...withImages,
    previewLines: Array.isArray(entry.previewLines) ? entry.previewLines.slice(0, 3).map(String) : [],
    lineCount: Number(entry.lineCount) || 0,
  };
  if (type === "music") return {
    ...common,
    ...(entry.url ? { url: String(entry.url) } : {}),
    ...withImages,
    section: String(entry.section || "songs"),
    ...(entry.image ? { image: String(entry.image) } : {}),
    ...(entry.sourceTitle ? { sourceTitle: String(entry.sourceTitle) } : {}),
    ...(entry.sourceMeta ? { sourceMeta: String(entry.sourceMeta) } : {}),
    featured: Boolean(entry.featured),
    ...(Number.isInteger(entry.featuredOrder) ? { featuredOrder: entry.featuredOrder } : {}),
  };
  return common;
}

export function contentFacet(type: string, entry: GeneratedEntry, page: number): GeneratedContentFacet {
  return {
    key: contentKey(type, entry),
    page,
    title: String((type === "music" ? entry.sourceTitle : entry.title) || ""),
    date: String(entry.date || ""),
    ...(type === "post" ? {
      category: String(entry.category || ""),
      tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
      series: entry.series ? String(entry.series) : null,
      seriesOrder: Number(entry.seriesOrder) || 0,
    } : {}),
    ...(type === "music" ? { section: entry.section || "songs" } : {}),
  };
}

export function contentSearchEntry(type: string, entry: GeneratedEntry, raw = ""): GeneratedSearchEntry {
  const notePreview = type === "music" && !entry.title
    ? markdownToPlainText(entry.excerpt || entry.firstParagraph || (raw ? parseMarkdownSource(entry.slug, raw).content : "")) : "";
  return {
    type,
    key: contentKey(type, entry),
    title: String((type === "music" ? entry.sourceTitle : entry.title) || ""),
    date: String(entry.date || ""),
    ...(type === "post" ? { category: String(entry.category || "") } : {}),
    ...(type === "music" ? {
      section: entry.section || "songs",
      ...(entry.sourceTitle ? { sourceTitle: String(entry.sourceTitle) } : {}),
      ...(entry.title ? { noteTitle: String(entry.title) } : {}),
      ...(notePreview ? { notePreview: Array.from(notePreview).slice(0, 160).join("") + (Array.from(notePreview).length > 160 ? "…" : "") } : {}),
    } : {}),
  };
}

function sortMusicRecords(records: readonly ContentRecord[]): ContentRecord[] {
  return sortMusicLibrary(records.map((record) => ({
    record,
    date: record.entry.date,
    featured: Boolean(record.entry.featured),
    ...(record.entry.featuredOrder === undefined ? {} : { featuredOrder: record.entry.featuredOrder }),
  }))).map(({ record }) => record);
}

export function buildContentDistribution(
  collections: readonly CollectionRecords[],
  imageCatalog: ImageCatalog = {},
): { manifest: ContentManifest; files: Map<string, string> } {
  const files = new Map<string, string>();
  const descriptors: ContentManifest["collections"] = {};
  const addJson = (path: string, value: unknown): void => { files.set(path, `${JSON.stringify(value)}\n`); };
  for (const [type, records] of collections) {
    records.forEach(({ name }) => assertSafeRelativePath(name, "内容文件"));
    const ordered = records.slice().sort((left, right) => sortNewestFirst(left.entry, right.entry));
    const pageOrdered = type === "music"
      ? sortMusicRecords(ordered)
      : ordered;
    const pageNumberByKey = new Map(pageOrdered.map((record, index) => [
      contentKey(type, record.entry),
      Math.floor(index / CONTENT_PAGE_CHUNK_SIZE),
    ]));
    const metadata: GeneratedContentEntry[] = pageOrdered.map((record) => {
      const { content: _content, lines: _lines, outline: _outline, source: _source, ...lightweight } = record.entry;
      const key = contentKey(type, record.entry);
      return {
        ...lightweight,
        key,
        source: record.source,
        body: `/fonscape/content/bodies/${encodeURIComponent(type)}/${encodePath(record.name)}`,
        responsiveImages: responsiveImagesFor(record.entry, record.raw, imageCatalog),
      };
    });
    const pageChunks = chunkValues(metadata, CONTENT_PAGE_CHUNK_SIZE);
    pageChunks.forEach((chunk, index) => addJson(`pages/${encodeURIComponent(type)}/${index}.json`, chunk));
    metadata.forEach((entry, index) => {
      addJson(`entries/${encodeURIComponent(type)}/${encodePath(entry.key)}.json`, entry);
      const record = pageOrdered[index];
      files.set(`bodies/${encodeURIComponent(type)}/${record.name.replaceAll("\\", "/")}`, record.raw);
    });
    const facets = ordered.map((record) => contentFacet(type, record.entry, pageNumberByKey.get(contentKey(type, record.entry)) ?? 0));
    const search = ordered.map((record) => contentSearchEntry(type, record.entry, record.raw));
    chunkValues(facets, CONTENT_INDEX_CHUNK_SIZE).forEach((chunk, index) => addJson(`facets/${encodeURIComponent(type)}/${index}.json`, chunk));
    chunkValues(search, CONTENT_INDEX_CHUNK_SIZE).forEach((chunk, index) => addJson(`search/${encodeURIComponent(type)}/${index}.json`, chunk));
    const featured = type === "post"
      ? sortFeaturedPosts(ordered.map(({ entry }) => ({ ...entry, featured: Boolean(entry.featured) })))
        .map((entry) => homeEntry(type, entry, imageCatalog))
      : [];
    chunkValues(featured, HOME_FEATURED_CHUNK_SIZE).forEach((chunk, index) => addJson(`featured/${encodeURIComponent(type)}/${index}.json`, chunk));
    const latestEntries = type === "music"
      ? sortMusicLibrary(ordered.map(({ entry }) => ({ ...entry, featured: Boolean(entry.featured) })))
      : ordered.map(({ entry }) => entry);
    const latest = latestEntries.slice(0, HOME_LATEST_LIMIT).map((entry) => homeEntry(type, entry, imageCatalog));
    descriptors[type] = {
      count: ordered.length,
      pageChunkSize: CONTENT_PAGE_CHUNK_SIZE,
      pageChunkCount: pageChunks.length,
      facetChunkSize: CONTENT_INDEX_CHUNK_SIZE,
      facetChunkCount: Math.ceil(facets.length / CONTENT_INDEX_CHUNK_SIZE),
      searchChunkSize: CONTENT_INDEX_CHUNK_SIZE,
      searchChunkCount: Math.ceil(search.length / CONTENT_INDEX_CHUNK_SIZE),
      featuredChunkSize: HOME_FEATURED_CHUNK_SIZE,
      featuredChunkCount: Math.ceil(featured.length / HOME_FEATURED_CHUNK_SIZE),
      featuredCount: featured.length,
      home: {
        latest,
        ...(type === "post" ? { featured: featured.slice(0, HOME_FEATURED_CHUNK_SIZE) } : {}),
      },
    };
  }
  return {
    manifest: {
      schemaVersion: CONTENT_SCHEMA_VERSION,
      basePath: "/fonscape/content/",
      collections: descriptors,
    },
    files,
  };
}

async function generatedFiles(directory = join(root, "public", "fonscape", "content"), prefix = ""): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (hasErrorCode(error, "ENOENT")) return [];
    throw error;
  });
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`内容生成目录不能包含符号链接：${relativePath}`);
    if (entry.isDirectory()) files.push(...await generatedFiles(path, relativePath));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files.sort();
}

export async function writeGeneratedContentFiles(files: ReadonlyMap<string, string>, directory: string): Promise<void> {
  const outputs = prepareGeneratedContentFiles(files, directory);
  await writePreparedGeneratedContentFiles(outputs, directory);
}

async function writePreparedGeneratedContentFiles(
  outputs: readonly PreparedGeneratedContentFile[],
  directory: string,
): Promise<void> {
  const outputRoot = resolve(directory);
  await rm(outputRoot, { recursive: true, force: true });
  await Promise.all(outputs.map(async ({ destination, content }) => {
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }));
}

export async function generateContentArtifacts({
  check = false,
  projectRoot = root,
  resolveMetadata = resolveMusicMetadata,
}: GenerateContentArtifactsOptions = {}): Promise<void> {
  const outputPath = join(projectRoot, "functions", "_generated", "content-targets.js");
  const metadataOutputPath = join(projectRoot, "functions", "_generated", "content-metadata.js");
  const generatedContentRoot = join(projectRoot, "public", "fonscape", "content");
  const responsiveImageBuildPath = join(projectRoot, "functions", "_generated", "responsive-images-build.json");
  const collections: CollectionRecords[] = await Promise.all(definitions.map(async (definition) => (
    [definition.type, await readCollection(definition, projectRoot)]
  )));
  const musicRecords = collections.find(([type]) => type === "music")?.[1] || [];
  await resolveMusicRecords(musicRecords, createMusicMetadataResolver(projectRoot, resolveMetadata));
  collections.forEach(([type, entries]) => {
    assertUniqueEntries(
      entries.map(({ entry }) => entry),
      type === "music" ? "音乐" : type === "poem" ? "小诗" : "文章",
      type === "music" ? (entry) => contentKey(type, entry) : undefined,
    );
  });
  const targets: Record<string, string[]> = Object.fromEntries(collections.map(([type, entries]) => [
    type,
    entries.map(({ entry }) => contentKey(type, entry)),
  ]));
  if (targets.post) targets.post.push("site-about", "site-friends");
  for (const values of Object.values(targets)) values.sort();
  const audioAssetSizes = await readAudioAssetSizes(join(projectRoot, "public", "audio"));
  const metingSongTargets = collectMetingSongTargets(collections);
  const metingLibraryTargets = collectMetingLibraryTargets(collections);
  const imageCatalog = parseImageCatalog(await readFile(responsiveImageBuildPath, "utf8")
    .then((content): unknown => JSON.parse(content))
    .catch(() => ({})));
  const { manifest, files } = buildContentDistribution(collections, imageCatalog);
  const renderedTargets = `// Generated by scripts/generate-content-targets.ts. Do not edit by hand.\n`
    + `const targets = ${JSON.stringify(targets, null, 2)};\n\n`
    + `const targetSets = Object.fromEntries(\n`
    + `  Object.entries(targets).map(([type, slugs]) => [type, new Set(slugs)]),\n`
    + `);\n\n`
    + `const audioAssetSizes = Object.freeze(${JSON.stringify(audioAssetSizes, null, 2)});\n\n`
    + `/** @type {readonly string[]} */\n`
    + `const metingSongTargets = Object.freeze(${JSON.stringify(metingSongTargets, null, 2)});\n`
    + `const metingSongTargetSet = new Set(metingSongTargets);\n\n`
    + `/** @type {readonly string[]} */\n`
    + `const metingLibraryTargets = Object.freeze(${JSON.stringify(metingLibraryTargets, null, 2)});\n`
    + `const metingLibraryTargetSet = new Set(metingLibraryTargets);\n\n`
    + `/** @param {string} type @param {string} slug */\n`
    + `export function isStaticContentTarget(type, slug) {\n`
    + `  return targetSets[type]?.has(slug) || false;\n`
    + `}\n\n`
    + `/** @param {string} source @param {string} id */\n`
    + `export function isMetingSongTarget(source, id) {\n`
    + `  return metingSongTargetSet.has(\`\${source}:\${id}\`);\n`
    + `}\n\n`
    + `/** @param {string} source @param {string} type @param {string} id */\n`
    + `export function isMetingLibraryTarget(source, type, id) {\n`
    + `  return metingLibraryTargetSet.has(\`\${source}:\${type}:\${id}\`);\n`
    + `}\n\n`
    + `export { audioAssetSizes, metingLibraryTargets, metingSongTargets, targets as staticContentTargets };\n`;
  const renderedMetadata = `// Generated by scripts/generate-content-targets.ts. Do not edit by hand.\n`
    + `const contentManifest = Object.freeze(${JSON.stringify(manifest, null, 2)});\n\n`
    + `export { contentManifest };\n`;
  const preparedContentFiles = prepareGeneratedContentFiles(files, generatedContentRoot);
  if (check) {
    const [currentTargets, currentMetadata, existing] = await Promise.all([
      readFile(outputPath, "utf8").catch(() => ""),
      readFile(metadataOutputPath, "utf8").catch(() => ""),
      generatedFiles(generatedContentRoot),
    ]);
    const expected = preparedContentFiles.map(({ path }) => path).sort();
    const contentMatches = await Promise.all(preparedContentFiles.map(async ({ destination, content }) => (
      await readFile(destination, "utf8").catch(() => "")
    ) === content));
    if (currentTargets !== renderedTargets
      || currentMetadata !== renderedMetadata
      || JSON.stringify(existing) !== JSON.stringify(expected)
      || contentMatches.includes(false)) {
      throw new Error("内容目标或分块数据不存在、过期或含有陈旧文件；pnpm dev/build/test/check 会自动重建。");
    }
    return;
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await Promise.all([
    writeFile(outputPath, renderedTargets),
    writeFile(metadataOutputPath, renderedMetadata),
    writePreparedGeneratedContentFiles(preparedContentFiles, generatedContentRoot),
  ]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateContentArtifacts({ check: process.argv.includes("--check") });
}
