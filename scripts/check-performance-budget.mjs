#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const DIST_ROOT = resolve(process.cwd(), "dist");
const ENTRY_HTML = resolve(DIST_ROOT, "index.html");
const ENTRY_JAVASCRIPT_GZIP_LIMIT = 112 * 1024;
const ENTRY_CSS_GZIP_LIMIT = 42 * 1024;
const LOCAL_FONT_CSS_GZIP_LIMIT = 36 * 1024;
const FULL_FONT_CSS_GZIP_LIMIT = 190 * 1024;
const HIGH_PRIORITY_IMAGE_LIMIT = 320 * 1024;

function localAssetPath(url) {
  const pathname = decodeURIComponent(String(url).split(/[?#]/u)[0]);
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return null;
  return resolve(DIST_ROOT, pathname.slice(1));
}

function gzipSize(path) {
  return gzipSync(readFileSync(path), { level: 9 }).byteLength;
}

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

export function checkPerformanceBudget() {
  if (!existsSync(ENTRY_HTML)) throw new Error("缺少 dist/index.html，请先运行生产构建。");
  const html = readFileSync(ENTRY_HTML, "utf8");
  const scriptUrls = [...html.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"[^>]*>/giu)].map((match) => match[1]);
  const styleUrls = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/giu)].map((match) => match[1]);
  const preloadImageUrls = [...html.matchAll(/<link\b[^>]*\brel="preload"[^>]*\bas="image"[^>]*>/giu)]
    .map((match) => match[0].match(/\bhref="([^"]+)"/iu)?.[1])
    .filter(Boolean);
  if (scriptUrls.length !== 1) throw new Error(`首页入口脚本数量异常：${scriptUrls.length}。`);
  const fontStyleUrls = styleUrls.filter((url) => url === "/fonscape/google-fonts.css");
  const fullFontStyleUrls = styleUrls.filter((url) => url === "/fonscape/google-fonts-full.css");
  const entryStyleUrls = styleUrls.filter((url) => !fontStyleUrls.includes(url) && !fullFontStyleUrls.includes(url));
  if (entryStyleUrls.length !== 1) throw new Error(`首页入口样式数量异常：${entryStyleUrls.length}。`);
  if (fontStyleUrls.length !== 1) throw new Error(`本地字体样式数量异常：${fontStyleUrls.length}。`);
  if (fullFontStyleUrls.length !== 1) throw new Error(`完整字体样式数量异常：${fullFontStyleUrls.length}。`);

  const scriptPath = localAssetPath(scriptUrls[0]);
  const stylePath = localAssetPath(entryStyleUrls[0]);
  const fontStylePath = localAssetPath(fontStyleUrls[0]);
  const fullFontStylePath = localAssetPath(fullFontStyleUrls[0]);
  if (!scriptPath || !existsSync(scriptPath)) throw new Error(`找不到首页入口脚本：${scriptUrls[0]}`);
  if (!stylePath || !existsSync(stylePath)) throw new Error(`找不到首页入口样式：${entryStyleUrls[0]}`);
  if (!fontStylePath || !existsSync(fontStylePath)) throw new Error(`找不到本地字体样式：${fontStyleUrls[0]}`);
  if (!fullFontStylePath || !existsSync(fullFontStylePath)) throw new Error(`找不到完整字体样式：${fullFontStyleUrls[0]}`);
  const scriptGzip = gzipSize(scriptPath);
  const styleGzip = gzipSize(stylePath);
  const fontStyleGzip = gzipSize(fontStylePath);
  const fullFontStyleGzip = gzipSize(fullFontStylePath);
  const failures = [];
  if (scriptGzip > ENTRY_JAVASCRIPT_GZIP_LIMIT) failures.push(`首页 JS gzip ${formatKiB(scriptGzip)} 超过 ${formatKiB(ENTRY_JAVASCRIPT_GZIP_LIMIT)}`);
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
  if (failures.length) throw new Error(`性能预算未通过：\n- ${failures.join("\n- ")}`);
  console.log(`性能预算通过：首页 JS ${formatKiB(scriptGzip)} gzip；CSS ${formatKiB(styleGzip)} gzip；首屏字体 CSS ${formatKiB(fontStyleGzip)} gzip；检查 ${highPriorityImages.length} 张首屏高优先级图片。`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    checkPerformanceBudget();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
