import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { contentRepositoryConfig } from "../content-repository.config.mjs";
import {
  assertUniqueEntries,
  parseGenericContentMetadata,
  parseMusicReviewMetadata,
  parsePoemMetadata,
  parsePostMetadata,
  sortNewestFirst,
} from "../src/content/frontmatter.js";
import { sortFeaturedPosts } from "../src/pages/homeContent.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = join(root, "functions", "_generated", "content-targets.js");
const metadataOutputPath = join(root, "functions", "_generated", "content-metadata.js");
const generatedContentRoot = join(root, "public", "fonscape", "content");

export const CONTENT_SCHEMA_VERSION = 2;
export const CONTENT_PAGE_CHUNK_SIZE = 50;
export const CONTENT_INDEX_CHUNK_SIZE = 200;
export const HOME_LATEST_LIMIT = 5;
export const HOME_FEATURED_CHUNK_SIZE = 8;

const parserByType = {
  post: parsePostMetadata,
  poem: parsePoemMetadata,
  music: parseMusicReviewMetadata,
};

export function resolveCollectionDefinitions(collections) {
  return Object.entries(collections).map(([type, collection]) => {
    const parser = parserByType[collection.parser || type] || parseGenericContentMetadata;
    return { type, ...collection, parser };
  });
}

const definitions = resolveCollectionDefinitions(contentRepositoryConfig.collections);

async function findMarkdownFiles(directory, extension, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith(".")) continue;
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`内容文件不能是符号链接：${name}`);
    if (entry.isDirectory()) files.push(...await findMarkdownFiles(path, extension, name));
    else if (entry.isFile() && entry.name.endsWith(extension)) files.push(name);
  }
  return files;
}

async function readCollection(definition) {
  const sourceDirectory = join(root, definition.directory);
  const names = await findMarkdownFiles(sourceDirectory, definition.extension);
  return Promise.all(names.map(async (name) => {
    const path = join(sourceDirectory, name);
    const sourcePath = relative(root, path).replaceAll("\\", "/");
    const raw = await readFile(path, "utf8");
    return {
      name,
      source: `./${definition.directory.replace(/^src\/content\//u, "")}/${name.replaceAll("\\", "/")}`,
      raw,
      entry: definition.parser(sourcePath, raw),
    };
  }));
}

async function readAudioAssetSizes(directory = join(root, "public", "audio"), prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const sizes = {};
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

export function chunkValues(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

function encodePath(value) {
  return String(value).split("/").map(encodeURIComponent).join("/");
}

export function contentKey(type, entry) {
  return type === "music" ? `${String(entry.section)}/${String(entry.slug)}` : String(entry.slug);
}

function homeEntry(type, entry) {
  const common = { slug: String(entry.slug), title: String(entry.title || ""), date: String(entry.date || "") };
  if (type === "post") return {
    ...common,
    category: String(entry.category || ""),
    featured: Boolean(entry.featured),
    ...(Number.isInteger(entry.featuredOrder) ? { featuredOrder: entry.featuredOrder } : {}),
    ...(entry.excerpt ? { excerpt: String(entry.excerpt) } : {}),
    ...(entry.firstParagraph ? { firstParagraph: String(entry.firstParagraph) } : {}),
    wordCount: Number(entry.wordCount) || 0,
    ...(entry.image ? { image: String(entry.image) } : {}),
    ...(entry.cardImage ? { cardImage: String(entry.cardImage) } : {}),
    ...(entry.cardPosition ? { cardPosition: String(entry.cardPosition) } : {}),
  };
  if (type === "poem") return {
    ...common,
    previewLines: Array.isArray(entry.previewLines) ? entry.previewLines.slice(0, 3).map(String) : [],
    lineCount: Number(entry.lineCount) || 0,
  };
  if (type === "music") return {
    ...common,
    section: String(entry.section || "songs"),
    kind: String(entry.kind || ""),
  };
  return common;
}

export function contentFacet(type, entry, page) {
  return {
    key: contentKey(type, entry),
    page,
    title: String(entry.title || ""),
    date: String(entry.date || ""),
    ...(type === "post" ? {
      category: String(entry.category || ""),
      tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
      series: entry.series ? String(entry.series) : null,
      seriesOrder: Number(entry.seriesOrder) || 0,
    } : {}),
    ...(type === "music" ? { section: String(entry.section || "songs"), kind: String(entry.kind || "") } : {}),
  };
}

export function contentSearchEntry(type, entry) {
  return {
    type,
    key: contentKey(type, entry),
    title: String(entry.title || ""),
    date: String(entry.date || ""),
    ...(type === "post" ? { category: String(entry.category || "") } : {}),
    ...(type === "music" ? { section: String(entry.section || "songs"), kind: String(entry.kind || "") } : {}),
  };
}

export function buildContentDistribution(collections) {
  const files = new Map();
  const descriptors = {};
  const addJson = (path, value) => files.set(path, `${JSON.stringify(value)}\n`);
  for (const [type, records] of collections) {
    const ordered = records.slice().sort((left, right) => sortNewestFirst(left.entry, right.entry));
    const metadata = ordered.map((record) => {
      const { content: _content, lines: _lines, outline: _outline, source: _source, ...lightweight } = record.entry;
      const key = contentKey(type, record.entry);
      return {
        ...lightweight,
        key,
        source: record.source,
        body: `/fonscape/content/bodies/${encodeURIComponent(type)}/${encodePath(record.name)}`,
      };
    });
    const pageChunks = chunkValues(metadata, CONTENT_PAGE_CHUNK_SIZE);
    pageChunks.forEach((chunk, index) => addJson(`pages/${encodeURIComponent(type)}/${index}.json`, chunk));
    metadata.forEach((entry, index) => {
      addJson(`entries/${encodeURIComponent(type)}/${encodePath(entry.key)}.json`, entry);
      const record = ordered[index];
      files.set(`bodies/${encodeURIComponent(type)}/${record.name.replaceAll("\\", "/")}`, record.raw);
    });
    const facets = ordered.map((record, index) => contentFacet(type, record.entry, Math.floor(index / CONTENT_PAGE_CHUNK_SIZE)));
    const search = ordered.map((record) => contentSearchEntry(type, record.entry));
    chunkValues(facets, CONTENT_INDEX_CHUNK_SIZE).forEach((chunk, index) => addJson(`facets/${encodeURIComponent(type)}/${index}.json`, chunk));
    chunkValues(search, CONTENT_INDEX_CHUNK_SIZE).forEach((chunk, index) => addJson(`search/${encodeURIComponent(type)}/${index}.json`, chunk));
    const featured = type === "post" ? sortFeaturedPosts(ordered.map(({ entry }) => entry)).map((entry) => homeEntry(type, entry)) : [];
    chunkValues(featured, HOME_FEATURED_CHUNK_SIZE).forEach((chunk, index) => addJson(`featured/${encodeURIComponent(type)}/${index}.json`, chunk));
    const latest = ordered.slice(0, HOME_LATEST_LIMIT).map(({ entry }) => homeEntry(type, entry));
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

async function generatedFiles(directory = generatedContentRoot, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`内容生成目录不能包含符号链接：${relativePath}`);
    if (entry.isDirectory()) files.push(...await generatedFiles(path, relativePath));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files.sort();
}

export async function generateContentArtifacts({ check = false } = {}) {
  const collections = await Promise.all(definitions.map(async (definition) => [definition.type, await readCollection(definition)]));
  collections.forEach(([type, entries]) => {
    assertUniqueEntries(entries.map(({ entry }) => entry), type === "music" ? "音乐" : type === "poem" ? "小诗" : "文章");
  });
  const targets = Object.fromEntries(collections.map(([type, entries]) => [type, entries.map(({ entry }) => contentKey(type, entry))]));
  if (targets.post) targets.post.push("site-about", "site-friends");
  for (const values of Object.values(targets)) values.sort();
  const audioAssetSizes = await readAudioAssetSizes();
  const { manifest, files } = buildContentDistribution(collections);
  const renderedTargets = `// Generated by scripts/generate-content-targets.mjs. Do not edit by hand.\n`
    + `const targets = ${JSON.stringify(targets, null, 2)};\n\n`
    + `const targetSets = Object.fromEntries(\n`
    + `  Object.entries(targets).map(([type, slugs]) => [type, new Set(slugs)]),\n`
    + `);\n\n`
    + `const audioAssetSizes = Object.freeze(${JSON.stringify(audioAssetSizes, null, 2)});\n\n`
    + `export function isStaticContentTarget(type, slug) {\n`
    + `  return targetSets[type]?.has(slug) || false;\n`
    + `}\n\n`
    + `export { audioAssetSizes, targets as staticContentTargets };\n`;
  const renderedMetadata = `// Generated by scripts/generate-content-targets.mjs. Do not edit by hand.\n`
    + `const contentManifest = Object.freeze(${JSON.stringify(manifest, null, 2)});\n\n`
    + `export { contentManifest };\n`;
  if (check) {
    const [currentTargets, currentMetadata, existing] = await Promise.all([
      readFile(outputPath, "utf8").catch(() => ""),
      readFile(metadataOutputPath, "utf8").catch(() => ""),
      generatedFiles(),
    ]);
    const expected = [...files.keys()].sort();
    const contentMatches = await Promise.all(expected.map(async (path) => (
      await readFile(join(generatedContentRoot, path), "utf8").catch(() => "")
    ) === files.get(path)));
    if (currentTargets !== renderedTargets
      || currentMetadata !== renderedMetadata
      || JSON.stringify(existing) !== JSON.stringify(expected)
      || contentMatches.includes(false)) {
      throw new Error("内容目标或分块数据不存在、过期或含有陈旧文件；pnpm dev/build/test/check 会自动重建。");
    }
    return;
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await rm(generatedContentRoot, { recursive: true, force: true });
  await Promise.all([
    writeFile(outputPath, renderedTargets),
    writeFile(metadataOutputPath, renderedMetadata),
    ...[...files].map(async ([path, content]) => {
      const destination = join(generatedContentRoot, path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, content);
    }),
  ]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateContentArtifacts({ check: process.argv.includes("--check") });
}
