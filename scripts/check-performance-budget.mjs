#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const DIST_ROOT = resolve(process.cwd(), "dist");
const ENTRY_HTML = resolve(DIST_ROOT, "index.html");
const ENTRY_JAVASCRIPT_GZIP_LIMIT = 112 * 1024;
const MAX_DYNAMIC_JAVASCRIPT_GZIP_LIMIT = 96 * 1024;
const ENTRY_CSS_GZIP_LIMIT = 42 * 1024;
const ENTRY_HTML_GZIP_LIMIT = 52 * 1024;
const LOCAL_FONT_CSS_GZIP_LIMIT = 48 * 1024;
const FULL_FONT_CSS_GZIP_LIMIT = 190 * 1024;
const HIGH_PRIORITY_IMAGE_LIMIT = 320 * 1024;
const GENERATED_RESPONSIVE_IMAGE_LIMIT = 512 * 1024;
const RESPONSIVE_MANIFEST_CHUNK_GZIP_LIMIT = 32 * 1024;
const CONTENT_PAGE_GZIP_LIMIT = 96 * 1024;
const CONTENT_INDEX_GZIP_LIMIT = 48 * 1024;
const CONTENT_ENTRY_GZIP_LIMIT = 48 * 1024;

function localAssetPath(url) {
  const pathname = decodeURIComponent(String(url).split(/[?#]/u)[0]);
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return null;
  return resolve(DIST_ROOT, pathname.slice(1));
}

function gzipSize(path) {
  return gzipSync(readFileSync(path), { level: 9 }).byteLength;
}

function collectJavaScriptFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return collectJavaScriptFiles(path);
      return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
    });
}

function collectFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return collectFiles(path);
      return entry.isFile() ? [path] : [];
    });
}

export function summarizeJavaScriptAssets(assets, entryPath) {
  const dynamicAssets = assets.filter(({ path }) => path !== entryPath);
  const largestDynamic = dynamicAssets.reduce((largest, asset) => !largest || asset.gzip > largest.gzip ? asset : largest, null);
  return {
    dynamicAssets,
    largestDynamic,
  };
}

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function formatAssetPath(path) {
  return relative(DIST_ROOT, path).split("\\").join("/");
}

export function checkPerformanceBudget() {
  if (!existsSync(ENTRY_HTML)) throw new Error("缺少 dist/index.html，请先运行生产构建。");
  const html = readFileSync(ENTRY_HTML, "utf8");
  const scriptUrls = [...html.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"[^>]*>/giu)].map((match) => match[1]);
  const styleUrls = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/giu)].map((match) => match[1]);
  const criticalFontStyles = [...html.matchAll(/<style\b[^>]*\bdata-fonscape-critical-fonts[^>]*>([\s\S]*?)<\/style>/giu)];
  const preloadImageUrls = [...html.matchAll(/<link\b[^>]*\brel="preload"[^>]*\bas="image"[^>]*>/giu)]
    .map((match) => match[0].match(/\bhref="([^"]+)"/iu)?.[1])
    .filter(Boolean);
  const responsiveImageUrls = [...html.matchAll(/\bimagesrcset="([^"]+)"/giu)]
    .flatMap((match) => match[1].split(",").map((candidate) => candidate.trim().split(/\s+/u)[0]))
    .filter(Boolean);
  if (scriptUrls.length !== 1) throw new Error(`首页入口脚本数量异常：${scriptUrls.length}。`);
  const entryStyleUrls = styleUrls;
  if (entryStyleUrls.length !== 1) throw new Error(`首页入口样式数量异常：${entryStyleUrls.length}。`);
  if (criticalFontStyles.length !== 1) throw new Error(`内联首屏字体样式数量异常：${criticalFontStyles.length}。`);
  if (html.includes("google-fonts-full.css")) throw new Error("完整字体目录不应进入首页请求链。");

  const scriptPath = localAssetPath(scriptUrls[0]);
  const stylePath = localAssetPath(entryStyleUrls[0]);
  const fontStylePath = resolve(DIST_ROOT, "fonscape/google-fonts.css");
  const fullFontStylePath = resolve(DIST_ROOT, "fonscape/google-fonts-full.css");
  if (!scriptPath || !existsSync(scriptPath)) throw new Error(`找不到首页入口脚本：${scriptUrls[0]}`);
  if (!stylePath || !existsSync(stylePath)) throw new Error(`找不到首页入口样式：${entryStyleUrls[0]}`);
  if (!existsSync(fontStylePath)) throw new Error("找不到本地字体样式：/fonscape/google-fonts.css");
  if (!existsSync(fullFontStylePath)) throw new Error("找不到完整字体样式：/fonscape/google-fonts-full.css");
  const htmlGzip = gzipSize(ENTRY_HTML);
  const scriptGzip = gzipSize(scriptPath);
  const javascriptAssets = collectJavaScriptFiles(DIST_ROOT).map((path) => ({ path, gzip: gzipSize(path) }));
  const { largestDynamic } = summarizeJavaScriptAssets(javascriptAssets, scriptPath);
  const styleGzip = gzipSize(stylePath);
  const fontStyleGzip = gzipSize(fontStylePath);
  const fullFontStyleGzip = gzipSize(fullFontStylePath);
  const failures = [];
  if (htmlGzip > ENTRY_HTML_GZIP_LIMIT) failures.push(`首页 HTML gzip ${formatKiB(htmlGzip)} 超过 ${formatKiB(ENTRY_HTML_GZIP_LIMIT)}`);
  if (scriptGzip > ENTRY_JAVASCRIPT_GZIP_LIMIT) failures.push(`首页 JS gzip ${formatKiB(scriptGzip)} 超过 ${formatKiB(ENTRY_JAVASCRIPT_GZIP_LIMIT)}`);
  if (largestDynamic && largestDynamic.gzip > MAX_DYNAMIC_JAVASCRIPT_GZIP_LIMIT) {
    failures.push(`最大非入口动态 JS ${formatAssetPath(largestDynamic.path)} gzip ${formatKiB(largestDynamic.gzip)} 超过 ${formatKiB(MAX_DYNAMIC_JAVASCRIPT_GZIP_LIMIT)} 长期预算`);
  }
  if (styleGzip > ENTRY_CSS_GZIP_LIMIT) failures.push(`首页 CSS gzip ${formatKiB(styleGzip)} 超过 ${formatKiB(ENTRY_CSS_GZIP_LIMIT)}`);
  if (fontStyleGzip > LOCAL_FONT_CSS_GZIP_LIMIT) failures.push(`本地字体 CSS gzip ${formatKiB(fontStyleGzip)} 超过 ${formatKiB(LOCAL_FONT_CSS_GZIP_LIMIT)}`);
  if (fullFontStyleGzip > FULL_FONT_CSS_GZIP_LIMIT) failures.push(`完整字体 CSS gzip ${formatKiB(fullFontStyleGzip)} 超过 ${formatKiB(FULL_FONT_CSS_GZIP_LIMIT)}`);

  const highPriorityImages = preloadImageUrls.map((url) => ({ url, path: localAssetPath(url) }));
  for (const image of highPriorityImages) {
    if (!image.path && /^https?:\/\//iu.test(image.url)) continue;
    if (!image.path || !existsSync(image.path)) {
      failures.push(`找不到首屏高优先级图片：${image.url}`);
      continue;
    }
    const bytes = statSync(image.path).size;
    if (bytes > HIGH_PRIORITY_IMAGE_LIMIT) failures.push(`首屏高优先级图片 ${image.url} 为 ${formatKiB(bytes)}，超过 ${formatKiB(HIGH_PRIORITY_IMAGE_LIMIT)}`);
  }
  const generatedResponsiveImageUrls = new Set(responsiveImageUrls.filter((url) => url.startsWith("/fonscape/generated-images/")));
  for (const url of generatedResponsiveImageUrls) {
    const path = localAssetPath(url);
    if (!path || !existsSync(path)) {
      failures.push(`找不到响应式图片候选：${url}`);
      continue;
    }
    const bytes = statSync(path).size;
    if (bytes > GENERATED_RESPONSIVE_IMAGE_LIMIT) failures.push(`响应式图片候选 ${url} 为 ${formatKiB(bytes)}，超过 ${formatKiB(GENERATED_RESPONSIVE_IMAGE_LIMIT)}`);
  }
  const generatedImageRoot = resolve(DIST_ROOT, "fonscape/generated-images");
  const generatedImageFiles = existsSync(generatedImageRoot) ? readdirSync(generatedImageRoot, { withFileTypes: true }).filter((entry) => entry.isFile()) : [];
  const generatedImageBytes = generatedImageFiles.reduce((total, entry) => total + statSync(resolve(generatedImageRoot, entry.name)).size, 0);
  const responsiveManifestAssets = javascriptAssets.filter(({ path }) => /^responsive-images-full-.*\.js$/u.test(path.split(/[\\/]/u).at(-1) || ""));
  if (responsiveManifestAssets.length === 0) failures.push("找不到按需加载的响应式图片清单索引。");
  for (const asset of responsiveManifestAssets.filter(({ path }) => /^responsive-images-full-\d+-/u.test(path.split(/[\\/]/u).at(-1) || ""))) {
    if (asset.gzip > RESPONSIVE_MANIFEST_CHUNK_GZIP_LIMIT) {
      failures.push(`响应式图片清单分块 ${formatAssetPath(asset.path)} gzip ${formatKiB(asset.gzip)} 超过 ${formatKiB(RESPONSIVE_MANIFEST_CHUNK_GZIP_LIMIT)} 分块预算`);
    }
  }

  const contentRoot = resolve(DIST_ROOT, "fonscape/content");
  const contentDataFiles = collectFiles(contentRoot).filter((path) => path.endsWith(".json"));
  for (const path of contentDataFiles) {
    const relativePath = relative(contentRoot, path).split("\\").join("/");
    const limit = relativePath.startsWith("pages/")
      ? CONTENT_PAGE_GZIP_LIMIT
      : relativePath.startsWith("entries/")
        ? CONTENT_ENTRY_GZIP_LIMIT
        : CONTENT_INDEX_GZIP_LIMIT;
    const bytes = gzipSize(path);
    if (bytes > limit) failures.push(`内容数据分块 ${relativePath} gzip ${formatKiB(bytes)} 超过 ${formatKiB(limit)} 分块预算`);
  }
  if (failures.length) throw new Error(`性能预算未通过：\n- ${failures.join("\n- ")}`);
  const dynamicSummary = largestDynamic ? `最大非入口动态 JS ${formatAssetPath(largestDynamic.path)} ${formatKiB(largestDynamic.gzip)} gzip` : "无非入口动态 JS";
  console.log(`性能预算通过：首页 HTML ${formatKiB(htmlGzip)} gzip；入口 JS ${formatKiB(scriptGzip)} gzip；非入口 JS ${javascriptAssets.length - 1} 个文件（${dynamicSummary}）；CSS ${formatKiB(styleGzip)} gzip；首屏字体 CSS ${formatKiB(fontStyleGzip)} gzip；检查 ${highPriorityImages.length} 张首屏高优先级图片；自动生成 ${generatedImageFiles.length} 个候选，共 ${formatKiB(generatedImageBytes)}；内容数据 ${contentDataFiles.length} 个固定分块。`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    checkPerformanceBudget();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
