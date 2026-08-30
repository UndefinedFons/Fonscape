import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMarkdownSource, parseMusicReviewMetadata, parsePostMetadata } from "../src/content/frontmatter.js";
import { getHomeContent } from "../src/pages/homeContent.js";
import { siteConfig } from "../src/siteConfig.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = join(root, "public");
const generatedRoot = join(publicRoot, "fonscape", "generated-images");
const manifestPath = join(root, "functions", "_generated", "responsive-images.js");
const fullManifestPath = join(root, "functions", "_generated", "responsive-images-full.js");
export const RESPONSIVE_IMAGE_CACHE_VERSION = 1;
export const RESPONSIVE_IMAGE_CACHE_ROOT = join(root, ".fonscape-cache", "responsive-images");
const responsiveImageCacheManifestName = "manifest.json";
const fullManifestChunkPattern = /^responsive-images-full-(\d+)\.js$/u;
const fullManifestChunkSize = 100;
export const MAX_RESPONSIVE_CANDIDATES_PER_SOURCE = 5;
const supportedExtensions = new Set([".avif", ".jpeg", ".jpg", ".png", ".webp"]);
const roleWidths = {
  avatar: [128, 256, 384],
  card: [384, 640, 960, 1280],
  detail: [384, 640, 960, 1280, 1600],
  hero: [768, 960, 1600],
  thumbnail: [128, 256, 384],
};
const encoderVersion = "native-format-v2";

async function sourceFiles(path) {
  const info = await stat(path).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!info) return [];
  if (info.isFile()) return [path];
  if (!info.isDirectory()) return [];
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith(".")) continue;
    const child = join(path, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`图片引用扫描目录不能包含符号链接：${relative(root, child)}`);
    if (entry.isDirectory()) files.push(...await sourceFiles(child));
    else if (entry.isFile() && [".js", ".json", ".md"].includes(extname(entry.name).toLowerCase())) files.push(child);
  }
  return files;
}

export function isLocalRasterSource(value) {
  return typeof value === "string"
    && /^\/(?:assets|fonscape)\/[^?#]+\.(?:avif|jpe?g|png|webp)(?:[?#].*)?$/iu.test(value);
}

function addTarget(targets, source, role) {
  if (!isLocalRasterSource(source)) return;
  if (!targets.has(source)) targets.set(source, new Set());
  targets.get(source).add(role);
}

export function selectResponsiveWidths(widths, { preferSmall = false, limit = MAX_RESPONSIVE_CANDIDATES_PER_SOURCE } = {}) {
  const available = [...new Set(widths)].filter(Number.isFinite).sort((left, right) => left - right);
  if (available.length <= limit) return available;
  const selected = new Set([available[0], available.at(-1)]);
  const priorities = preferSmall
    ? [384, 640, 960, 256, 1280, 768, 1600, 128]
    : [640, 960, 1280, 768, 384, 1600, 256, 128];
  for (const width of priorities) {
    if (selected.size >= limit) break;
    if (available.includes(width)) selected.add(width);
  }
  for (const width of available) {
    if (selected.size >= limit) break;
    selected.add(width);
  }
  return [...selected].sort((left, right) => left - right);
}

function stripMarkdownCode(markdown) {
  const lines = String(markdown || "").split(/\r?\n/u);
  let fence = null;
  return lines.map((line) => {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/u)?.[1];
    if (fence) {
      if (marker && marker[0] === fence.marker && marker.length >= fence.length) fence = null;
      return "";
    }
    if (marker) {
      fence = { marker: marker[0], length: marker.length };
      return "";
    }
    if (/^(?: {4}|\t)/u.test(line)) return "";
    return line.replace(/`+[^`\r\n]*`+/gu, "");
  }).join("\n");
}

/**
 * Find local raster sources that ReactMarkdown can render from a Markdown
 * body. Code blocks and inline code are ignored so examples do not create
 * build artifacts. The returned order follows the source and is deduplicated.
 *
 * @param {string} markdown
 * @returns {string[]}
 */
export function extractLocalRasterSources(markdown) {
  const body = stripMarkdownCode(markdown);
  const sources = new Set();
  const references = new Map();
  for (const match of body.matchAll(/^\s{0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))/gmu)) {
    references.set(match[1].trim().toLowerCase(), match[2] || match[3]);
  }
  const add = (source) => {
    const value = source?.trim();
    if (isLocalRasterSource(value)) sources.add(value);
  };
  for (const match of body.matchAll(/!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))/gu)) add(match[1] || match[2]);
  for (const match of body.matchAll(/!\[([^\]]*)\]\[([^\]]*)\]/gu)) {
    const reference = (match[2].trim() || match[1].trim()).toLowerCase();
    add(references.get(reference));
  }
  for (const match of body.matchAll(/!\[([^\]]+)\](?!\s*(?:\(|\[))/gu)) {
    add(references.get(match[1].trim().toLowerCase()));
  }
  return [...sources];
}

function addMarkdownTargets(targets, markdown) {
  for (const source of extractLocalRasterSources(markdown)) addTarget(targets, source, "detail");
}

async function referencedLocalImages() {
  const targets = new Map();
  const criticalSources = new Set();
  const addCriticalTarget = (source, role) => {
    addTarget(targets, source, role);
    if (isLocalRasterSource(source)) criticalSources.add(source);
  };
  addCriticalTarget(siteConfig.author?.avatar, "avatar");
  addCriticalTarget(siteConfig.author?.avatarSmall, "avatar");
  for (const hero of Object.values(siteConfig.heroes || {})) {
    addCriticalTarget(hero?.image, "hero");
    addCriticalTarget(hero?.mobileImage, "hero");
  }

  const contentRoot = join(root, "src", "content");
  const files = (await sourceFiles(contentRoot)).filter((path) => extname(path).toLowerCase() === ".md");
  const posts = [];
  for (const path of files) {
    const source = await readFile(path, "utf8");
    const sourcePath = relative(root, path).replaceAll("\\", "/");
    if (sourcePath.startsWith("src/content/posts/")) {
      const post = parsePostMetadata(sourcePath, source);
      const { content } = parseMarkdownSource(sourcePath, source);
      posts.push(post);
      addTarget(targets, post.cardImage || post.image, "card");
      if (post.coverMode !== "none") addTarget(targets, post.image, "detail");
      addTarget(targets, post.music?.cover, "thumbnail");
      for (const track of Array.isArray(post.musicBlocks) ? post.musicBlocks : []) addTarget(targets, track?.cover, "thumbnail");
      addMarkdownTargets(targets, content);
    } else if (sourcePath.startsWith("src/content/music/")) {
      const entry = parseMusicReviewMetadata(sourcePath, source);
      addTarget(targets, entry.cardImage || entry.image, "thumbnail");
      addTarget(targets, entry.image, "thumbnail");
      if (!entry.url) addTarget(targets, entry.image, "detail");
      addMarkdownTargets(targets, parseMarkdownSource(sourcePath, source).content);
    }
  }
  const { featuredPosts, recentPosts } = getHomeContent(posts, [], {});
  for (const post of new Set([...featuredPosts, ...recentPosts])) {
    const source = post.cardImage || post.image;
    if (isLocalRasterSource(source)) criticalSources.add(source);
  }
  return { criticalSources, targets };
}

export function sourceAssetPath(source) {
  const pathname = decodeURIComponent(source.split(/[?#]/u)[0]);
  const path = resolve(publicRoot, pathname.slice(1));
  const relativePath = relative(publicRoot, path);
  if (relativePath === ".." || relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) throw new Error(`图片路径越出 public 目录：${source}`);
  return path;
}

const responsiveImageCacheFilePattern = /^[a-z0-9_-]+-[0-9a-f]{12}-w\d+\.(?:avif|jpe?g|png|webp)$/iu;
const responsiveImageCacheDigestPattern = /^[0-9a-f]{64}$/u;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSafeResponsiveCacheFileName(value) {
  return typeof value === "string"
    && value.length <= 255
    && basename(value) === value
    && responsiveImageCacheFilePattern.test(value);
}

function responsiveImageCacheEntryKey({ source, sourceHash, width, extension, fileName }) {
  return JSON.stringify([source, sourceHash, width, extension, fileName]);
}

function responsiveImageCacheEntryMatches({ entry, source, sourceHash, sourceBytes, width, extension, fileName }) {
  return entry?.source === source
    && entry.sourceHash === sourceHash
    && entry.sourceBytes === sourceBytes
    && entry.width === width
    && entry.extension === extension
    && entry.fileName === fileName;
}

function emptyResponsiveImageCache(cacheDirectory, encoderFingerprint) {
  return {
    available: false,
    cacheDirectory,
    encoderFingerprint,
    entries: new Map(),
  };
}

function resolveResponsiveImageCacheDirectory(cacheDirectory) {
  if (typeof cacheDirectory !== "string" || !cacheDirectory) return null;
  const path = resolve(cacheDirectory);
  const relativePath = relative(root, path);
  if (path === root || relativePath === ".." || relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) return null;
  return path;
}

/**
 * Check/create a cache directory without following symlinks. The cache is a
 * disposable acceleration aid, so an unsafe or malformed cache is ignored.
 */
async function ensureSafeResponsiveCacheDirectory(cacheDirectory, { create = false } = {}) {
  const path = resolveResponsiveImageCacheDirectory(cacheDirectory);
  if (!path) return false;
  const pathParts = relative(root, path).split(/[\\/]/u).filter(Boolean);
  let currentPath = root;
  for (const part of pathParts) {
    currentPath = join(currentPath, part);
    let info = await lstat(currentPath).catch((error) => {
      if (error.code === "ENOENT") return null;
      return null;
    });
    if (!info) {
      if (!create) return false;
      try {
        await mkdir(currentPath);
      } catch (error) {
        if (error.code !== "EEXIST") return false;
      }
      info = await lstat(currentPath).catch(() => null);
    }
    if (!info || info.isSymbolicLink() || !info.isDirectory()) return false;
  }
  return true;
}

function responsiveImageCacheEntryIsValid(entry, encoderFingerprint) {
  if (!isPlainObject(entry)
    || !isLocalRasterSource(entry.source)
    || typeof entry.sourceHash !== "string"
    || !responsiveImageCacheDigestPattern.test(entry.sourceHash)
    || !Number.isSafeInteger(entry.sourceBytes)
    || entry.sourceBytes < 1
    || !Number.isSafeInteger(entry.width)
    || entry.width < 1
    || entry.width > 100_000
    || typeof entry.extension !== "string"
    || !supportedExtensions.has(entry.extension)
    || !isSafeResponsiveCacheFileName(entry.fileName)
    || extname(entry.fileName).toLowerCase() !== entry.extension
    || (entry.outcome !== "accepted" && entry.outcome !== "rejected")
    || !Number.isSafeInteger(entry.variantBytes)
    || entry.variantBytes < 1
    || (entry.outcome === "accepted" && entry.variantBytes >= entry.sourceBytes)
    || (entry.outcome === "rejected" && entry.variantBytes < entry.sourceBytes)
    || (entry.outcome === "accepted"
      && (typeof entry.variantHash !== "string" || !responsiveImageCacheDigestPattern.test(entry.variantHash)))
    || (entry.outcome === "rejected" && entry.variantHash !== undefined && entry.variantHash !== null)
    || typeof encoderFingerprint !== "string") return false;
  return true;
}

/**
 * Read the versioned responsive-image cache. Invalid, stale, or unsafe cache
 * data is treated as a miss so a disposable cache can never change output.
 *
 * @param {{ cacheDirectory?: string, encoderFingerprint: string }} options
 */
export async function loadResponsiveImageCache({
  cacheDirectory = RESPONSIVE_IMAGE_CACHE_ROOT,
  encoderFingerprint,
} = {}) {
  const path = resolveResponsiveImageCacheDirectory(cacheDirectory);
  const empty = emptyResponsiveImageCache(path || cacheDirectory, encoderFingerprint);
  if (!path || !(await ensureSafeResponsiveCacheDirectory(path))) return empty;
  const manifestPath = join(path, responsiveImageCacheManifestName);
  const manifestInfo = await lstat(manifestPath).catch(() => null);
  if (!manifestInfo || manifestInfo.isSymbolicLink() || !manifestInfo.isFile()) return empty;
  const manifest = await readFile(manifestPath, "utf8").then((source) => {
    try {
      return JSON.parse(source);
    } catch {
      return null;
    }
  }).catch(() => null);
  if (!isPlainObject(manifest)
    || manifest.version !== RESPONSIVE_IMAGE_CACHE_VERSION
    || manifest.encoderFingerprint !== encoderFingerprint
    || !Array.isArray(manifest.entries)) return empty;

  const entries = new Map();
  for (const entry of manifest.entries) {
    if (!responsiveImageCacheEntryIsValid(entry, encoderFingerprint)) return empty;
    const key = responsiveImageCacheEntryKey(entry);
    if (entries.has(key)) return empty;
    entries.set(key, entry);
  }
  return {
    available: true,
    cacheDirectory: path,
    encoderFingerprint,
    entries,
  };
}

function makeResponsiveImageCacheEntry({
  source,
  sourceHash,
  sourceBytes,
  width,
  extension,
  fileName,
  outcome,
  variantBytes,
  variantHash,
}) {
  const entry = {
    source,
    sourceHash,
    sourceBytes,
    width,
    extension,
    fileName,
    outcome,
    variantBytes,
  };
  if (outcome === "accepted") entry.variantHash = variantHash;
  return entry;
}

async function sha256File(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function writeResponsiveImageCacheManifest(cacheDirectory, manifest) {
  const manifestPath = join(cacheDirectory, responsiveImageCacheManifestName);
  const temporaryPath = join(cacheDirectory, `.${responsiveImageCacheManifestName}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(temporaryPath, manifestPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

/**
 * Persist generation outcomes and accepted-output metadata for the next run.
 * Cache failures are intentionally swallowed: generated output remains the
 * source of truth and the cache is never required for a successful build.
 *
 * @param {{ cacheDirectory?: string, encoderFingerprint: string, entries: Map }} options
 */
export async function saveResponsiveImageCache({
  cacheDirectory = RESPONSIVE_IMAGE_CACHE_ROOT,
  encoderFingerprint,
  entries,
} = {}) {
  try {
    const path = resolveResponsiveImageCacheDirectory(cacheDirectory);
    if (!path || !(await ensureSafeResponsiveCacheDirectory(path, { create: true }))) return false;
    const serializableEntries = [];
    const sortedEntries = [...(entries instanceof Map ? entries.values() : [])]
      .sort((left, right) => responsiveImageCacheEntryKey(left).localeCompare(responsiveImageCacheEntryKey(right)));
    for (const entry of sortedEntries) {
      if (!responsiveImageCacheEntryIsValid(entry, encoderFingerprint)) continue;
      serializableEntries.push(entry);
    }
    await writeResponsiveImageCacheManifest(path, {
      version: RESPONSIVE_IMAGE_CACHE_VERSION,
      encoderFingerprint,
      entries: serializableEntries,
    });
    return true;
  } catch {
    return false;
  }
}

export async function safeLocalSourcePath(source) {
  const sourcePath = sourceAssetPath(source);
  const pathParts = relative(publicRoot, sourcePath).split(/[\\/]/u);
  let currentPath = publicRoot;
  for (const part of pathParts) {
    currentPath = join(currentPath, part);
    const info = await lstat(currentPath).catch((error) => {
      if (error.code === "ENOENT") throw new Error(`找不到本地图片：${source}`);
      throw error;
    });
    if (info.isSymbolicLink()) throw new Error(`本地图片路径不能包含符号链接：${source}`);
  }
  const [resolvedPublicRoot, resolvedSourcePath] = await Promise.all([realpath(publicRoot), realpath(sourcePath)]);
  const relativePath = relative(resolvedPublicRoot, resolvedSourcePath);
  if (relativePath === ".." || relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new Error(`图片真实路径越出 public 目录：${source}`);
  }
  return sourcePath;
}

async function ensureSafeGeneratedRoot({ create = true } = {}, outputDirectory = generatedRoot) {
  const path = resolve(outputDirectory);
  const relativeDirectory = relative(publicRoot, path);
  if (path === publicRoot || relativeDirectory === ".." || relativeDirectory.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new Error(`响应式图片生成目录必须位于 public 目录内：${relative(root, path)}`);
  }
  const pathParts = relativeDirectory.split(/[\\/]/u).filter(Boolean);
  let currentPath = publicRoot;
  for (const part of pathParts) {
    currentPath = join(currentPath, part);
    let info = await lstat(currentPath).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!info) {
      if (!create) return false;
      await mkdir(currentPath);
      info = await lstat(currentPath);
    }
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error(`响应式图片生成目录必须是普通目录：${relative(root, currentPath)}`);
    }
  }
  return true;
}

async function createResponsiveVariantPipeline(sourceBuffer, outputPath, width, sharpLibrary) {
  const sharp = sharpLibrary || (await import("sharp")).default;
  const pipeline = sharp(sourceBuffer)
    .rotate()
    .resize({ width, withoutEnlargement: true, fit: "inside" })
    .keepIccProfile();
  const extension = extname(outputPath).toLowerCase();
  if (extension === ".png") pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
  else if (extension === ".jpg" || extension === ".jpeg") pipeline.jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true });
  else if (extension === ".avif") pipeline.avif({ quality: 75, effort: 4, chromaSubsampling: "4:4:4" });
  else pipeline.webp({ quality: 92, alphaQuality: 100, effort: 4, smartSubsample: true });
  return pipeline;
}

export async function renderResponsiveVariant(sourceBuffer, outputPath, width, sharpLibrary) {
  const pipeline = await createResponsiveVariantPipeline(sourceBuffer, outputPath, width, sharpLibrary);
  await pipeline.toFile(outputPath);
}

export async function renderResponsiveVariantBuffer(sourceBuffer, outputPath, width, sharpLibrary) {
  const pipeline = await createResponsiveVariantPipeline(sourceBuffer, outputPath, width, sharpLibrary);
  return pipeline.toBuffer();
}

export function shouldKeepResponsiveVariant(originalBytes, variantBytes) {
  return Number.isFinite(originalBytes) && Number.isFinite(variantBytes) && variantBytes < originalBytes;
}

function renderManifest(entries, exportName = "responsiveImages") {
  return `// Generated by scripts/generate-responsive-images.mjs. Do not edit by hand.\n`
    + `const ${exportName} = Object.freeze(${JSON.stringify(entries, null, 2)});\n\n`
    + `export { ${exportName} };\n`;
}

export function chunkResponsiveEntries(entries, chunkSize = fullManifestChunkSize) {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new Error("响应式图片清单分块大小必须是正整数。");
  const pairs = Array.isArray(entries) ? entries : Object.entries(entries || {});
  return Array.from({ length: Math.ceil(pairs.length / chunkSize) }, (_, index) => (
    Object.fromEntries(pairs.slice(index * chunkSize, (index + 1) * chunkSize))
  ));
}

function renderFullManifestIndex(chunkCount) {
  const loaders = Array.from(
    { length: chunkCount },
    (_, index) => `  () => import("./responsive-images-full-${index}.js"),`,
  ).join("\n");
  return `// Generated by scripts/generate-responsive-images.mjs. Do not edit by hand.\n`
    + `/** @type {ReadonlyArray<() => Promise<{ responsiveImageChunk: Record<string, any> }>>} */\n`
    + `const responsiveImageChunkLoaders = Object.freeze([\n${loaders}${loaders ? "\n" : ""}]);\n\n`
    + "export { responsiveImageChunkLoaders };\n";
}

async function existingFullManifestChunks(manifestDirectory = dirname(fullManifestPath)) {
  const names = await readdir(manifestDirectory).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  return names.filter((name) => fullManifestChunkPattern.test(name)).sort((left, right) => left.localeCompare(right));
}

async function writeFullManifest(entries, {
  check = false,
  manifestDirectory = dirname(fullManifestPath),
} = {}) {
  const outputPath = join(manifestDirectory, "responsive-images-full.js");
  const chunks = chunkResponsiveEntries(entries);
  const renderedIndex = renderFullManifestIndex(chunks.length);
  const renderedChunks = chunks.map((chunk, index) => ({
    name: `responsive-images-full-${index}.js`,
    source: renderManifest(chunk, "responsiveImageChunk"),
  }));
  const expectedNames = new Set(renderedChunks.map(({ name }) => name));
  const currentNames = await existingFullManifestChunks(manifestDirectory);
  const staleNames = currentNames.filter((name) => !expectedNames.has(name));
  if (check) {
    const currentIndex = await readFile(outputPath, "utf8").catch(() => "");
    if (currentIndex !== renderedIndex || staleNames.length > 0) return false;
    const matches = await Promise.all(renderedChunks.map(async ({ name, source }) => (
      await readFile(join(manifestDirectory, name), "utf8").catch(() => "") === source
    )));
    return matches.every(Boolean);
  }
  await mkdir(manifestDirectory, { recursive: true });
  await Promise.all([
    writeFile(outputPath, renderedIndex),
    ...renderedChunks.map(({ name, source }) => writeFile(join(manifestDirectory, name), source)),
    ...staleNames.map((name) => unlink(join(manifestDirectory, name))),
  ]);
  return true;
}

/**
 * Generate responsive derivatives for every local raster image referenced
 * by site configuration or repository content. Site authors keep one original;
 * generated files are disposable build artifacts and never replace it.
 *
 * @param {{
 *   check?: boolean,
 *   manifestOnly?: boolean,
 *   cacheDirectory?: string,
 *   generatedDirectory?: string,
 *   manifestDirectory?: string,
 *   sourceTargets?: { criticalSources: Set<string>, targets: Map<string, Set<string>> },
 *   sharpLibrary?: Function,
 * }} [options]
 */
export async function generateResponsiveImages({
  check = false,
  manifestOnly = false,
  cacheDirectory = RESPONSIVE_IMAGE_CACHE_ROOT,
  generatedDirectory = generatedRoot,
  manifestDirectory = dirname(manifestPath),
  sourceTargets = null,
  sharpLibrary = null,
} = {}) {
  if (check && manifestOnly) throw new Error("响应式图片生成不能同时使用 --check 和 --manifest-only。");
  const outputManifestPath = join(manifestDirectory, "responsive-images.js");
  if (manifestOnly) {
    await mkdir(manifestDirectory, { recursive: true });
    await Promise.all([writeFile(outputManifestPath, renderManifest({})), writeFullManifest({}, { manifestDirectory })]);
    return { sourceCount: 0, variantCount: 0 };
  }

  const sharp = sharpLibrary || (await import("sharp")).default;
  const encoderFingerprint = `${encoderVersion}-sharp-${sharp.versions.sharp}-vips-${sharp.versions.vips}`;
  const cache = await loadResponsiveImageCache({ cacheDirectory, encoderFingerprint });
  const { criticalSources, targets } = sourceTargets || await referencedLocalImages();
  const sources = [...targets.keys()].sort();
  const entries = {};
  const expectedFiles = new Set();
  const cacheEntries = new Map();
  let variantCount = 0;
  await ensureSafeGeneratedRoot({ create: !check }, generatedDirectory);

  for (const source of sources) {
    const sourcePath = await safeLocalSourcePath(source);
    const extension = extname(sourcePath).toLowerCase();
    if (!supportedExtensions.has(extension)) continue;
    const sourceBuffer = await readFile(sourcePath);
    const metadata = await sharp(sourceBuffer).metadata();
    if (!metadata.width || !metadata.height || metadata.pages > 1) continue;
    const sourceHash = createHash("sha256").update(sourceBuffer).digest("hex");
    const digest = createHash("sha256").update(encoderFingerprint).update(sourceBuffer).digest("hex").slice(0, 12);
    const stem = basename(sourcePath, extension).replaceAll(/[^a-z0-9_-]+/giu, "-").replaceAll(/^-|-$/gu, "") || "image";
    const roles = targets.get(source);
    const widths = selectResponsiveWidths([...new Set([...roles].flatMap((role) => roleWidths[role] || []))]
      .sort((left, right) => left - right)
      .filter((width) => width < metadata.width), {
      preferSmall: roles.has("avatar") || roles.has("thumbnail"),
    });
    const candidates = [];
    for (const width of widths) {
      const fileName = `${stem}-${digest}-w${width}${extension}`;
      const outputPath = join(generatedDirectory, fileName);
      const cacheKey = responsiveImageCacheEntryKey({ source, sourceHash, width, extension, fileName });
      const cached = cache.entries.get(cacheKey);
      const usableCache = responsiveImageCacheEntryMatches({
        entry: cached,
        source,
        sourceHash,
        sourceBytes: sourceBuffer.byteLength,
        width,
        extension,
        fileName,
      }) ? cached : null;
      let outputInfo = await lstat(outputPath).catch((error) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (outputInfo?.isSymbolicLink() || (outputInfo && !outputInfo.isFile())) {
        throw new Error(`响应式图片候选必须是普通文件：${relative(root, outputPath)}`);
      }
      if (!outputInfo && usableCache?.outcome === "rejected") {
        if (!check) cacheEntries.set(cacheKey, usableCache);
        continue;
      }
      let outputWasFreshlyRendered = false;
      if (!outputInfo) {
        if (check) {
          if (usableCache?.outcome === "accepted") {
            throw new Error(`缺少响应式图片候选：${relative(root, outputPath)}`);
          }
          const outputBuffer = await renderResponsiveVariantBuffer(sourceBuffer, outputPath, width, sharp);
          if (!shouldKeepResponsiveVariant(sourceBuffer.byteLength, outputBuffer.byteLength)) continue;
          throw new Error(`缺少响应式图片候选：${relative(root, outputPath)}`);
        }
        const temporaryPath = join(generatedDirectory, `.${fileName}.${process.pid}.${randomUUID()}.tmp${extension}`);
        try {
          await renderResponsiveVariant(sourceBuffer, temporaryPath, width, sharp);
          await rename(temporaryPath, outputPath);
        } catch (error) {
          await unlink(temporaryPath).catch(() => {});
          throw error;
        }
        outputInfo = await lstat(outputPath);
        outputWasFreshlyRendered = true;
      }
      let cachedOutputValid = false;
      if (usableCache?.outcome === "accepted" && !outputWasFreshlyRendered) {
        const outputHash = outputInfo.size === usableCache.variantBytes
          ? await sha256File(outputPath).catch(() => "")
          : "";
        cachedOutputValid = outputInfo.size === usableCache.variantBytes && outputHash === usableCache.variantHash;
        if (!cachedOutputValid) {
          if (check) throw new Error(`响应式图片候选已损坏：${relative(root, outputPath)}`);
          const temporaryPath = join(generatedDirectory, `.${fileName}.${process.pid}.${randomUUID()}.tmp${extension}`);
          try {
            await renderResponsiveVariant(sourceBuffer, temporaryPath, width, sharp);
            await rename(temporaryPath, outputPath);
          } catch (error) {
            await unlink(temporaryPath).catch(() => {});
            throw error;
          }
          outputInfo = await lstat(outputPath);
          outputWasFreshlyRendered = true;
        }
      }
      if (outputInfo && !outputWasFreshlyRendered && usableCache?.outcome !== "accepted") {
        if (check) {
          const expectedOutput = await renderResponsiveVariantBuffer(sourceBuffer, outputPath, width, sharp);
          if (!shouldKeepResponsiveVariant(sourceBuffer.byteLength, expectedOutput.byteLength)) continue;
          const actualOutput = await readFile(outputPath);
          if (!actualOutput.equals(expectedOutput)) {
            throw new Error(`响应式图片候选已损坏：${relative(root, outputPath)}`);
          }
        } else {
          const temporaryPath = join(generatedDirectory, `.${fileName}.${process.pid}.${randomUUID()}.tmp${extension}`);
          try {
            await renderResponsiveVariant(sourceBuffer, temporaryPath, width, sharp);
            await rename(temporaryPath, outputPath);
          } catch (error) {
            await unlink(temporaryPath).catch(() => {});
            throw error;
          }
          outputInfo = await lstat(outputPath);
        }
      }
      const outputBytes = outputInfo.size;
      if (!shouldKeepResponsiveVariant(sourceBuffer.byteLength, outputBytes)) {
        if (!check) await unlink(outputPath);
        if (!check) {
          cacheEntries.set(cacheKey, makeResponsiveImageCacheEntry({
            source,
            sourceHash,
            sourceBytes: sourceBuffer.byteLength,
            width,
            extension,
            fileName,
            outcome: "rejected",
            variantBytes: outputBytes,
          }));
        }
        continue;
      }
      expectedFiles.add(fileName);
      candidates.push({ src: `/fonscape/generated-images/${fileName}`, width });
      variantCount += 1;
      if (!check) {
        cacheEntries.set(cacheKey, makeResponsiveImageCacheEntry({
          source,
          sourceHash,
          sourceBytes: sourceBuffer.byteLength,
          width,
          extension,
          fileName,
          outcome: "accepted",
          variantBytes: outputBytes,
          variantHash: cachedOutputValid ? usableCache.variantHash : await sha256File(outputPath),
        }));
      }
    }
    candidates.push({ src: source, width: metadata.width });
    entries[source] = { width: metadata.width, height: metadata.height, candidates };
  }

  const staleFiles = await readdir(generatedDirectory).catch(() => []);
  const staleNames = staleFiles.filter((name) => !expectedFiles.has(name));
  if (check && staleNames.length > 0) throw new Error(`响应式图片生成目录包含 ${staleNames.length} 个过期文件。`);
  await Promise.all(staleNames.map(async (name) => {
    const path = join(generatedDirectory, name);
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error(`响应式图片生成目录包含异常条目：${relative(root, path)}`);
    await unlink(path);
  }));
  const criticalEntries = Object.fromEntries(Object.entries(entries).filter(([source]) => criticalSources.has(source)));
  const rendered = renderManifest(criticalEntries);
  if (check) {
    const [current, fullManifestMatches] = await Promise.all([
      readFile(outputManifestPath, "utf8").catch(() => ""),
      writeFullManifest(entries, { check: true, manifestDirectory }),
    ]);
    if (current !== rendered || !fullManifestMatches) throw new Error("响应式图片清单不存在或已过期；pnpm dev/build/test/check 会自动重建。");
    return { sourceCount: Object.keys(entries).length, variantCount };
  }
  await mkdir(manifestDirectory, { recursive: true });
  await Promise.all([writeFile(outputManifestPath, rendered), writeFullManifest(entries, { manifestDirectory })]);
  await saveResponsiveImageCache({ cacheDirectory, encoderFingerprint, entries: cacheEntries });
  return { sourceCount: Object.keys(entries).length, variantCount };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await generateResponsiveImages({
    check: process.argv.includes("--check"),
    manifestOnly: process.argv.includes("--manifest-only"),
  });
  if (!process.argv.includes("--check") && !process.argv.includes("--manifest-only")) {
    console.log(`响应式图片已生成：${result.sourceCount} 张原图，${result.variantCount} 个衍生尺寸。`);
  }
}
