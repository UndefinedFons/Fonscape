import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMusicReviewMetadata, parsePostMetadata } from "../src/content/frontmatter.js";
import { getHomeContent } from "../src/pages/homeContent.js";
import { siteConfig } from "../src/siteConfig.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = join(root, "public");
const generatedRoot = join(publicRoot, "fonscape", "generated-images");
const manifestPath = join(root, "functions", "_generated", "responsive-images.js");
const fullManifestPath = join(root, "functions", "_generated", "responsive-images-full.js");
const supportedExtensions = new Set([".avif", ".jpeg", ".jpg", ".png", ".webp"]);
const roleWidths = {
  avatar: [128, 256, 384],
  card: [384, 576, 640, 768, 960, 1280],
  hero: [768, 960, 1600],
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
      posts.push(post);
      addTarget(targets, post.cardImage || post.image, "card");
    } else if (sourcePath.startsWith("src/content/music/")) {
      const entry = parseMusicReviewMetadata(sourcePath, source);
      addTarget(targets, entry.cardImage || entry.image, "card");
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

async function ensureSafeGeneratedRoot() {
  const pathParts = relative(publicRoot, generatedRoot).split(/[\\/]/u);
  let currentPath = publicRoot;
  for (const part of pathParts) {
    currentPath = join(currentPath, part);
    let info = await lstat(currentPath).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!info) {
      await mkdir(currentPath);
      info = await lstat(currentPath);
    }
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error(`响应式图片生成目录必须是普通目录：${relative(root, currentPath)}`);
    }
  }
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

/**
 * Generate responsive derivatives for every local raster image referenced
 * by site configuration or repository content. Site authors keep one original;
 * generated files are disposable build artifacts and never replace it.
 *
 * @param {{ check?: boolean, manifestOnly?: boolean }} [options]
 */
export async function generateResponsiveImages({ check = false, manifestOnly = false } = {}) {
  if (manifestOnly) {
    await mkdir(dirname(manifestPath), { recursive: true });
    await Promise.all([
      writeFile(manifestPath, renderManifest({})),
      writeFile(fullManifestPath, renderManifest({}, "fullResponsiveImages")),
    ]);
    return { sourceCount: 0, variantCount: 0 };
  }

  const sharp = (await import("sharp")).default;
  const encoderFingerprint = `${encoderVersion}-sharp-${sharp.versions.sharp}-vips-${sharp.versions.vips}`;
  const { criticalSources, targets } = await referencedLocalImages();
  const sources = [...targets.keys()].sort();
  const entries = {};
  const expectedFiles = new Set();
  let variantCount = 0;
  await ensureSafeGeneratedRoot();

  for (const source of sources) {
    const sourcePath = await safeLocalSourcePath(source);
    const extension = extname(sourcePath).toLowerCase();
    if (!supportedExtensions.has(extension)) continue;
    const sourceBuffer = await readFile(sourcePath);
    const metadata = await sharp(sourceBuffer).metadata();
    if (!metadata.width || !metadata.height || metadata.pages > 1) continue;
    const digest = createHash("sha256").update(encoderFingerprint).update(sourceBuffer).digest("hex").slice(0, 12);
    const stem = basename(sourcePath, extension).replaceAll(/[^a-z0-9_-]+/giu, "-").replaceAll(/^-|-$/gu, "") || "image";
    const widths = [...new Set([...targets.get(source)].flatMap((role) => roleWidths[role] || []))]
      .sort((left, right) => left - right)
      .filter((width) => width < metadata.width);
    const candidates = [];
    for (const width of widths) {
      const fileName = `${stem}-${digest}-w${width}${extension}`;
      const outputPath = join(generatedRoot, fileName);
      const outputInfo = await lstat(outputPath).catch((error) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (outputInfo?.isSymbolicLink() || (outputInfo && !outputInfo.isFile())) {
        throw new Error(`响应式图片候选必须是普通文件：${relative(root, outputPath)}`);
      }
      const outputExists = Boolean(outputInfo);
      if (!outputExists) {
        if (check) {
          const outputBuffer = await renderResponsiveVariantBuffer(sourceBuffer, outputPath, width, sharp);
          if (!shouldKeepResponsiveVariant(sourceBuffer.byteLength, outputBuffer.byteLength)) continue;
          throw new Error(`缺少响应式图片候选：${relative(root, outputPath)}`);
        }
        const temporaryPath = join(generatedRoot, `.${fileName}.${process.pid}.${randomUUID()}.tmp${extension}`);
        try {
          await renderResponsiveVariant(sourceBuffer, temporaryPath, width, sharp);
          await rename(temporaryPath, outputPath);
        } catch (error) {
          await unlink(temporaryPath).catch(() => {});
          throw error;
        }
      }
      const outputBytes = (await lstat(outputPath)).size;
      if (!shouldKeepResponsiveVariant(sourceBuffer.byteLength, outputBytes)) {
        if (!check) await unlink(outputPath);
        continue;
      }
      expectedFiles.add(fileName);
      candidates.push({ src: `/fonscape/generated-images/${fileName}`, width });
      variantCount += 1;
    }
    candidates.push({ src: source, width: metadata.width });
    entries[source] = { width: metadata.width, height: metadata.height, candidates };
  }

  const staleFiles = await readdir(generatedRoot).catch(() => []);
  const staleNames = staleFiles.filter((name) => !expectedFiles.has(name));
  if (check && staleNames.length > 0) throw new Error(`响应式图片生成目录包含 ${staleNames.length} 个过期文件。`);
  await Promise.all(staleNames.map(async (name) => {
    const path = join(generatedRoot, name);
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error(`响应式图片生成目录包含异常条目：${relative(root, path)}`);
    await unlink(path);
  }));
  const criticalEntries = Object.fromEntries(Object.entries(entries).filter(([source]) => criticalSources.has(source)));
  const rendered = renderManifest(criticalEntries);
  const renderedFull = renderManifest(entries, "fullResponsiveImages");
  if (check) {
    const [current, currentFull] = await Promise.all([
      readFile(manifestPath, "utf8").catch(() => ""),
      readFile(fullManifestPath, "utf8").catch(() => ""),
    ]);
    if (current !== rendered || currentFull !== renderedFull) throw new Error("响应式图片清单不存在或已过期；pnpm dev/build/test/check 会自动重建。");
    return { sourceCount: Object.keys(entries).length, variantCount };
  }
  await mkdir(dirname(manifestPath), { recursive: true });
  await Promise.all([
    writeFile(manifestPath, rendered),
    writeFile(fullManifestPath, renderedFull),
  ]);
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
