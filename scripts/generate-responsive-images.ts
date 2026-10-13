import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PostMetadata, ResponsiveImageCandidate, ResponsiveImageMetadata } from "../src/types.ts";
import { parseMarkdownSource, parseMusicReviewMetadata, parsePostMetadata } from "../src/content/frontmatter.ts";
import { getHomeContent } from "../src/pages/homeContent.ts";
import { siteConfig } from "../src/siteConfig.ts";
import {
  chunkResponsiveEntries,
  renderManifest,
  responsiveImageChunkMap,
  writeBuildManifest,
} from "./responsive-images/manifests.ts";

type SharpFactory = typeof import("sharp").default;
type SupportedImageExtension = ".avif" | ".jpeg" | ".jpg" | ".png" | ".webp";
export type ResponsiveImageRole = "avatar" | "card" | "detail" | "hero" | "thumbnail";

export interface ResponsiveImageTargets {
  criticalSources: Set<string>;
  targets: Map<string, Set<ResponsiveImageRole>>;
}

interface ResponsiveImageCacheEntryBase {
  source: string;
  sourceHash: string;
  sourceBytes: number;
  width: number;
  extension: SupportedImageExtension;
  fileName: string;
  variantBytes: number;
}

export type ResponsiveImageCacheEntry = ResponsiveImageCacheEntryBase & (
  | { outcome: "accepted"; variantHash: string }
  | { outcome: "rejected"; variantHash?: null }
);

export interface ResponsiveImageCacheManifest {
  version: number;
  encoderFingerprint: string;
  entries: ResponsiveImageCacheEntry[];
}

export interface ResponsiveImageCache {
  available: boolean;
  cacheDirectory: string | null;
  encoderFingerprint: string | undefined;
  entries: Map<string, ResponsiveImageCacheEntry>;
}

export interface GenerateResponsiveImagesOptions {
  check?: boolean;
  manifestOnly?: boolean;
  cacheDirectory?: string;
  generatedDirectory?: string;
  manifestDirectory?: string;
  sourceTargets?: ResponsiveImageTargets | null;
  sharpLibrary?: SharpFactory | null;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = join(root, "public");
const generatedRoot = join(publicRoot, "fonscape", "generated-images");
const manifestPath = join(root, "functions", "_generated", "responsive-images.js");
export const RESPONSIVE_IMAGE_CACHE_VERSION = 2;
export const RESPONSIVE_IMAGE_CACHE_ROOT = join(root, ".fonscape-cache", "responsive-images");
const responsiveImageCacheManifestName = "manifest.json";
export const MAX_RESPONSIVE_CANDIDATES_PER_SOURCE = 2;
const supportedExtensions: ReadonlySet<string> = new Set([".avif", ".jpeg", ".jpg", ".png", ".webp"]);
const roleWidths: Record<ResponsiveImageRole, readonly [small: number, large: number]> = {
  avatar: [128, 384],
  card: [640, 1280],
  detail: [640, 1600],
  hero: [960, 1600],
  thumbnail: [128, 384],
};
export const RESPONSIVE_VARIANT_TARGET_BYTES = 1024 * 1024;
export const MAX_RESPONSIVE_VARIANT_BYTES = 2 * 1024 * 1024;
const responsiveWebpQualities = [96, 94, 92, 90, 88, 86, 84];
const encoderVersion = "two-size-webp-v6";

function hasErrorCode(error: unknown, code: string): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === code;
}

function isSupportedImageExtension(value: unknown): value is SupportedImageExtension {
  return typeof value === "string" && supportedExtensions.has(value);
}

async function sourceFiles(path: string): Promise<string[]> {
  const info = await stat(path).catch((error) => {
    if (hasErrorCode(error, "ENOENT")) return null;
    throw error;
  });
  if (!info) return [];
  if (info.isFile()) return [path];
  if (!info.isDirectory()) return [];
  const entries = await readdir(path, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith(".")) continue;
    const child = join(path, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`图片引用扫描目录不能包含符号链接：${relative(root, child)}`);
    if (entry.isDirectory()) files.push(...await sourceFiles(child));
    else if (entry.isFile() && [".js", ".json", ".md"].includes(extname(entry.name).toLowerCase())) files.push(child);
  }
  return files;
}

export function isLocalRasterSource(value: unknown): value is string {
  return typeof value === "string"
    && /^\/(?:assets|fonscape)\/[^?#]+\.(?:avif|jpe?g|png|webp)(?:[?#].*)?$/iu.test(value);
}

export function responsiveVariantExtension(sourcePath: string): ".webp" | null {
  return isSupportedImageExtension(extname(sourcePath).toLowerCase()) ? ".webp" : null;
}

function addTarget(targets: Map<string, Set<ResponsiveImageRole>>, source: unknown, role: ResponsiveImageRole): void {
  if (!isLocalRasterSource(source)) return;
  const roles = targets.get(source) ?? new Set<ResponsiveImageRole>();
  roles.add(role);
  targets.set(source, roles);
}

export function selectResponsiveWidths(
  widths: readonly number[],
  { preferSmall = false, limit = MAX_RESPONSIVE_CANDIDATES_PER_SOURCE, sourceWidth = Infinity }: {
    preferSmall?: boolean;
    limit?: number;
    sourceWidth?: number;
  } = {},
): number[] {
  const available = [...new Set(widths
    .filter(Number.isFinite)
    .map((width) => Math.min(width, sourceWidth)))]
    .filter((width) => width > 0)
    .sort((left, right) => left - right);
  if (available.length <= limit) return available;
  const firstWidth = available.at(0);
  const lastWidth = available.at(-1);
  if (firstWidth === undefined || lastWidth === undefined) return available;
  const selected = new Set([firstWidth, lastWidth]);
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

function stripMarkdownCode(markdown: string): string {
  const lines = String(markdown || "").split(/\r?\n/u);
  let fence: { marker: string; length: number } | null = null;
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
export function extractLocalRasterSources(markdown: string): string[] {
  const body = stripMarkdownCode(markdown);
  const sources = new Set<string>();
  const references = new Map<string, string>();
  for (const match of body.matchAll(/^\s{0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))/gmu)) {
    const target = match[2] ?? match[3];
    if (target !== undefined) references.set(match[1].trim().toLowerCase(), target);
  }
  const add = (source: string | undefined): void => {
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

function addMarkdownTargets(targets: Map<string, Set<ResponsiveImageRole>>, markdown: string): void {
  for (const source of extractLocalRasterSources(markdown)) addTarget(targets, source, "detail");
}

async function referencedLocalImages(): Promise<ResponsiveImageTargets> {
  const targets = new Map<string, Set<ResponsiveImageRole>>();
  const criticalSources = new Set<string>();
  const addCriticalTarget = (source: unknown, role: ResponsiveImageRole): void => {
    addTarget(targets, source, role);
    if (isLocalRasterSource(source)) criticalSources.add(source);
  };
  addCriticalTarget(siteConfig.author?.avatar, "avatar");
  addCriticalTarget(siteConfig.author?.avatarSmall, "avatar");
  for (const hero of Object.values(siteConfig.heroes || {})) {
    addCriticalTarget(hero?.image, "hero");
    addCriticalTarget(hero?.mobileImage, "hero");
    addCriticalTarget(hero?.glassImage, "hero");
  }

  const contentRoot = join(root, "src", "content");
  const files = (await sourceFiles(contentRoot)).filter((path) => extname(path).toLowerCase() === ".md");
  const posts: PostMetadata[] = [];
  for (const path of files) {
    const source = await readFile(path, "utf8");
    const sourcePath = relative(root, path).replaceAll("\\", "/");
    if (sourcePath.startsWith("src/content/posts/")) {
      const post = parsePostMetadata(sourcePath, source);
      const { content } = parseMarkdownSource(sourcePath, source);
      posts.push(post);
      addTarget(targets, post.image, "card");
      if (post.coverMode !== "none") addTarget(targets, post.image, "detail");
      if (post.music && "cover" in post.music) addTarget(targets, post.music.cover, "thumbnail");
      for (const track of Array.isArray(post.musicBlocks) ? post.musicBlocks : []) {
        if (track && "cover" in track) addTarget(targets, track.cover, "thumbnail");
      }
      addMarkdownTargets(targets, content);
    } else if (sourcePath.startsWith("src/content/music/")) {
      const entry = parseMusicReviewMetadata(sourcePath, source);
      addTarget(targets, entry.image, "card");
      addTarget(targets, entry.image, "detail");
      addMarkdownTargets(targets, parseMarkdownSource(sourcePath, source).content);
    }
  }
  const { featuredPosts, recentPosts } = getHomeContent(posts, [], {});
  for (const post of new Set([...featuredPosts, ...recentPosts])) {
    const source = post.image;
    if (isLocalRasterSource(source)) criticalSources.add(source);
  }
  return { criticalSources, targets };
}

export function sourceAssetPath(source: string): string {
  const pathname = decodeURIComponent(source.split(/[?#]/u)[0]);
  const path = resolve(publicRoot, pathname.slice(1));
  const relativePath = relative(publicRoot, path);
  if (relativePath === ".." || relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) throw new Error(`图片路径越出 public 目录：${source}`);
  return path;
}

const responsiveImageCacheFilePattern = /^[a-z0-9_-]+-[0-9a-f]{12}-w\d+\.(?:avif|jpe?g|png|webp)$/iu;
const responsiveImageCacheDigestPattern = /^[0-9a-f]{64}$/u;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSafeResponsiveCacheFileName(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= 255
    && basename(value) === value
    && responsiveImageCacheFilePattern.test(value);
}

type ResponsiveImageCacheKeyFields = Pick<ResponsiveImageCacheEntryBase, "source" | "sourceHash" | "width" | "extension" | "fileName">;

function responsiveImageCacheEntryKey({ source, sourceHash, width, extension, fileName }: ResponsiveImageCacheKeyFields): string {
  return JSON.stringify([source, sourceHash, width, extension, fileName]);
}

function responsiveImageCacheEntryMatches({
  entry,
  source,
  sourceHash,
  sourceBytes,
  width,
  extension,
  fileName,
}: {
  entry: ResponsiveImageCacheEntry | undefined;
  source: string;
  sourceHash: string;
  sourceBytes: number;
  width: number;
  extension: SupportedImageExtension;
  fileName: string;
}): boolean {
  return entry?.source === source
    && entry.sourceHash === sourceHash
    && entry.sourceBytes === sourceBytes
    && entry.width === width
    && entry.extension === extension
    && entry.fileName === fileName;
}

function emptyResponsiveImageCache(cacheDirectory: string | null, encoderFingerprint: string | undefined): ResponsiveImageCache {
  return {
    available: false,
    cacheDirectory,
    encoderFingerprint,
    entries: new Map<string, ResponsiveImageCacheEntry>(),
  };
}

function resolveResponsiveImageCacheDirectory(cacheDirectory: unknown): string | null {
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
async function ensureSafeResponsiveCacheDirectory(cacheDirectory: string, { create = false }: { create?: boolean } = {}): Promise<boolean> {
  const path = resolveResponsiveImageCacheDirectory(cacheDirectory);
  if (!path) return false;
  const pathParts = relative(root, path).split(/[\\/]/u).filter(Boolean);
  let currentPath = root;
  for (const part of pathParts) {
    currentPath = join(currentPath, part);
    let info = await lstat(currentPath).catch(() => null);
    if (!info) {
      if (!create) return false;
      try {
        await mkdir(currentPath);
      } catch (error) {
        if (!hasErrorCode(error, "EEXIST")) return false;
      }
      info = await lstat(currentPath).catch(() => null);
    }
    if (!info || info.isSymbolicLink() || !info.isDirectory()) return false;
  }
  return true;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function responsiveImageCacheEntryIsValid(entry: unknown, encoderFingerprint: string | undefined): entry is ResponsiveImageCacheEntry {
  if (!isPlainObject(entry)) return false;
  const source = entry.source;
  const sourceHash = entry.sourceHash;
  const sourceBytes = entry.sourceBytes;
  const width = entry.width;
  const extension = entry.extension;
  const fileName = entry.fileName;
  const outcome = entry.outcome;
  const variantBytes = entry.variantBytes;
  const variantHash = entry.variantHash;
  if (!isLocalRasterSource(source)
    || typeof sourceHash !== "string"
    || !responsiveImageCacheDigestPattern.test(sourceHash)
    || !isPositiveSafeInteger(sourceBytes)
    || !isPositiveSafeInteger(width)
    || width > 100_000
    || !isSupportedImageExtension(extension)
    || !isSafeResponsiveCacheFileName(fileName)
    || extname(fileName).toLowerCase() !== extension
    || (outcome !== "accepted" && outcome !== "rejected")
    || !isPositiveSafeInteger(variantBytes)
    || typeof encoderFingerprint !== "string") return false;
  if (outcome === "accepted") {
    return shouldKeepResponsiveVariant(sourceBytes, variantBytes)
      && typeof variantHash === "string"
      && responsiveImageCacheDigestPattern.test(variantHash);
  }
  return !shouldKeepResponsiveVariant(sourceBytes, variantBytes)
    && (variantHash === undefined || variantHash === null);
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
}: { cacheDirectory?: string; encoderFingerprint?: string } = {}): Promise<ResponsiveImageCache> {
  const path = resolveResponsiveImageCacheDirectory(cacheDirectory);
  const empty = emptyResponsiveImageCache(path || cacheDirectory, encoderFingerprint);
  if (!path || !(await ensureSafeResponsiveCacheDirectory(path))) return empty;
  const manifestPath = join(path, responsiveImageCacheManifestName);
  const manifestInfo = await lstat(manifestPath).catch(() => null);
  if (!manifestInfo || manifestInfo.isSymbolicLink() || !manifestInfo.isFile()) return empty;
  const manifest: unknown = await readFile(manifestPath, "utf8").then((source): unknown => {
    try {
      const parsed: unknown = JSON.parse(source);
      return parsed;
    } catch {
      return null;
    }
  }).catch(() => null);
  if (!isPlainObject(manifest)
    || manifest.version !== RESPONSIVE_IMAGE_CACHE_VERSION
    || manifest.encoderFingerprint !== encoderFingerprint
    || !Array.isArray(manifest.entries)) return empty;

  const entries = new Map<string, ResponsiveImageCacheEntry>();
  const rawEntries: unknown[] = manifest.entries;
  for (const entry of rawEntries) {
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

function makeResponsiveImageCacheEntry(entry: ResponsiveImageCacheEntry): ResponsiveImageCacheEntry {
  const base = {
    source: entry.source,
    sourceHash: entry.sourceHash,
    sourceBytes: entry.sourceBytes,
    width: entry.width,
    extension: entry.extension,
    fileName: entry.fileName,
    variantBytes: entry.variantBytes,
  };
  if (entry.outcome === "accepted") {
    return { ...base, outcome: "accepted", variantHash: entry.variantHash };
  }
  return { ...base, outcome: "rejected" };
}

async function sha256File(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function writeResponsiveImageCacheManifest(
  cacheDirectory: string,
  manifest: { version: number; encoderFingerprint: string | undefined; entries: ResponsiveImageCacheEntry[] },
): Promise<void> {
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
}: {
  cacheDirectory?: string;
  encoderFingerprint?: string;
  entries?: Map<string, ResponsiveImageCacheEntry>;
} = {}): Promise<boolean> {
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

export async function safeLocalSourcePath(source: string): Promise<string> {
  const sourcePath = sourceAssetPath(source);
  const pathParts = relative(publicRoot, sourcePath).split(/[\\/]/u);
  let currentPath = publicRoot;
  for (const part of pathParts) {
    currentPath = join(currentPath, part);
    const info = await lstat(currentPath).catch((error) => {
      if (hasErrorCode(error, "ENOENT")) throw new Error(`找不到本地图片：${source}`);
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

async function ensureSafeGeneratedRoot(
  { create = true }: { create?: boolean } = {},
  outputDirectory = generatedRoot,
): Promise<boolean> {
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
      if (hasErrorCode(error, "ENOENT")) return null;
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

async function createResponsiveVariantPipeline(
  sourceBuffer: Buffer,
  outputPath: string,
  width: number,
  sharpLibrary: SharpFactory | null | undefined,
  webpQuality: number = responsiveWebpQualities[0],
): Promise<ReturnType<SharpFactory>> {
  const sharp = sharpLibrary || (await import("sharp")).default;
  const pipeline = sharp(sourceBuffer)
    .rotate()
    .resize({ width, withoutEnlargement: true, fit: "inside" })
    .keepIccProfile();
  const extension = extname(outputPath).toLowerCase();
  if (extension === ".png") pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
  else if (extension === ".jpg" || extension === ".jpeg") pipeline.jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true });
  else if (extension === ".avif") pipeline.avif({ quality: 75, effort: 4, chromaSubsampling: "4:4:4" });
  else pipeline.webp({ quality: webpQuality, alphaQuality: 100, effort: 4, smartSubsample: true });
  return pipeline;
}

export async function renderResponsiveVariant(
  sourceBuffer: Buffer,
  outputPath: string,
  width: number,
  sharpLibrary?: SharpFactory | null,
): Promise<void> {
  await writeFile(outputPath, await renderResponsiveVariantBuffer(sourceBuffer, outputPath, width, sharpLibrary));
}

export async function renderResponsiveVariantBuffer(
  sourceBuffer: Buffer,
  outputPath: string,
  width: number,
  sharpLibrary?: SharpFactory | null,
): Promise<Buffer> {
  const extension = extname(outputPath).toLowerCase();
  if (extension !== ".webp") {
    const pipeline = await createResponsiveVariantPipeline(sourceBuffer, outputPath, width, sharpLibrary);
    return pipeline.toBuffer();
  }
  let output: Buffer | undefined;
  for (const quality of responsiveWebpQualities) {
    const pipeline = await createResponsiveVariantPipeline(sourceBuffer, outputPath, width, sharpLibrary, quality);
    output = await pipeline.toBuffer();
    if (output.byteLength <= RESPONSIVE_VARIANT_TARGET_BYTES) return output;
    if (quality <= 92 && output.byteLength <= MAX_RESPONSIVE_VARIANT_BYTES) return output;
  }
  if (!output) throw new Error("响应式图片编码没有生成候选。");
  if (output.byteLength > MAX_RESPONSIVE_VARIANT_BYTES) {
    throw new Error(`响应式图片候选超过 ${MAX_RESPONSIVE_VARIANT_BYTES / 1024 / 1024} MiB 上限：${outputPath}`);
  }
  return output;
}

export function shouldKeepResponsiveVariant(originalBytes: number, variantBytes: number): boolean {
  return Number.isFinite(originalBytes) && Number.isFinite(variantBytes) && variantBytes <= originalBytes * .9;
}

async function renderInlineLqip(sourceBuffer: Buffer, sharpLibrary: SharpFactory | null | undefined): Promise<string> {
  const sharp = sharpLibrary || (await import("sharp")).default;
  const buffer = await sharp(sourceBuffer).rotate().resize({ width: 32, withoutEnlargement: true, fit: "inside" }).blur(.6).webp({ quality: 34, effort: 4 }).toBuffer();
  return `data:image/webp;base64,${buffer.toString("base64")}`;
}

export { chunkResponsiveEntries, responsiveImageChunkMap };

/**
 * Generate responsive derivatives for every local raster image referenced
 * by site configuration or repository content. Site authors keep one original;
 * generated files are disposable build artifacts and never replace it.
 *
 */
export async function generateResponsiveImages({
  check = false,
  manifestOnly = false,
  cacheDirectory = RESPONSIVE_IMAGE_CACHE_ROOT,
  generatedDirectory = generatedRoot,
  manifestDirectory = dirname(manifestPath),
  sourceTargets = null,
  sharpLibrary = null,
}: GenerateResponsiveImagesOptions = {}): Promise<{ sourceCount: number; variantCount: number }> {
  if (check && manifestOnly) throw new Error("响应式图片生成不能同时使用 --check 和 --manifest-only。");
  const outputManifestPath = join(manifestDirectory, "responsive-images.js");
  if (manifestOnly) {
    await mkdir(manifestDirectory, { recursive: true });
    await Promise.all([writeFile(outputManifestPath, renderManifest({})), writeBuildManifest({}, { manifestDirectory })]);
    return { sourceCount: 0, variantCount: 0 };
  }

  const sharp = sharpLibrary || (await import("sharp")).default;
  const encoderFingerprint = `${encoderVersion}-sharp-${sharp.versions.sharp}-vips-${sharp.versions.vips}`;
  const cache = await loadResponsiveImageCache({ cacheDirectory, encoderFingerprint });
  const { criticalSources, targets } = sourceTargets || await referencedLocalImages();
  const sources = [...targets.keys()].sort();
  const entries: Record<string, ResponsiveImageMetadata> = {};
  const expectedFiles = new Set<string>();
  const cacheEntries = new Map<string, ResponsiveImageCacheEntry>();
  let variantCount = 0;
  await ensureSafeGeneratedRoot({ create: !check }, generatedDirectory);

  for (const source of sources) {
    const sourcePath = await safeLocalSourcePath(source);
    const sourceExtension = extname(sourcePath).toLowerCase();
    if (!isSupportedImageExtension(sourceExtension)) continue;
    const extension = responsiveVariantExtension(sourcePath);
    if (!extension) continue;
    const sourceBuffer = await readFile(sourcePath);
    const metadata = await sharp(sourceBuffer).metadata();
    const imageWidth = metadata.width;
    const imageHeight = metadata.height;
    if (!imageWidth || !imageHeight || (metadata.pages !== undefined && metadata.pages > 1)) continue;
    const sourceHash = createHash("sha256").update(sourceBuffer).digest("hex");
    const digest = createHash("sha256").update(encoderFingerprint).update(sourceBuffer).digest("hex").slice(0, 12);
    const stem = basename(sourcePath, sourceExtension).replaceAll(/[^a-z0-9_-]+/giu, "-").replaceAll(/^-|-$/gu, "") || "image";
    const roles = targets.get(source);
    if (!roles) continue;
    const roleTargets = [...roles].map((role) => roleWidths[role] || []).filter((widths) => widths.length);
    const widths = selectResponsiveWidths([
      Math.max(...roleTargets.map((widths) => widths[0])),
      Math.max(...roleTargets.map((widths) => widths[1])),
    ], {
      preferSmall: roles.has("avatar") || roles.has("thumbnail"),
      sourceWidth: imageWidth,
    });
    const candidates: ResponsiveImageCandidate[] = [];
    for (const width of widths) {
      const fileName = `${stem}-${digest}-w${width}${extension}`;
      const outputPath = join(generatedDirectory, fileName);
      const cacheKey = responsiveImageCacheEntryKey({ source, sourceHash, width, extension, fileName });
      const cached = cache.entries.get(cacheKey);
      const usableCache = cached && responsiveImageCacheEntryMatches({
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
          variantHash: cachedOutputValid && usableCache?.outcome === "accepted"
            ? usableCache.variantHash
            : await sha256File(outputPath),
        }));
      }
    }
    if ((candidates.at(-1)?.width || 0) < imageWidth) {
      candidates.push({ src: source, width: imageWidth });
    }
    entries[source] = {
      width: imageWidth,
      height: imageHeight,
      candidates,
      ...(criticalSources.has(source) ? { lqip: await renderInlineLqip(sourceBuffer, sharp) } : {}),
    };
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
      writeBuildManifest(entries, { check: true, manifestDirectory }),
    ]);
    if (current !== rendered || !fullManifestMatches) throw new Error("响应式图片清单不存在或已过期；pnpm dev/build/test/check 会自动重建。");
    return { sourceCount: Object.keys(entries).length, variantCount };
  }
  await mkdir(manifestDirectory, { recursive: true });
  await Promise.all([writeFile(outputManifestPath, rendered), writeBuildManifest(entries, { manifestDirectory })]);
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
