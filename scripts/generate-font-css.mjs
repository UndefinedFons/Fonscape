import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseMusicReviewMetadata,
  parsePoemMetadata,
  parsePostMetadata,
} from "../src/content/frontmatter.js";
import { getHomeContent } from "../src/pages/homeContent.js";
import { authorProfile, siteConfig } from "../src/siteConfig.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(root, "scripts", "vendor", "google-fonts.css");
const outputDirectory = join(root, "public", "fonscape");
const criticalOutputPath = join(outputDirectory, "google-fonts.css");
const fullOutputPath = join(outputDirectory, "google-fonts-full.css");
const scannedExtensions = new Set([".html", ".js", ".jsx", ".json", ".md"]);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith(".") || ["dist", "node_modules"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`字体子集扫描不接受符号链接：${relative(root, path)}`);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (entry.isFile() && scannedExtensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

function codePoints(value) {
  return new Set([...value].map((character) => character.codePointAt(0)));
}

async function criticalContentSources(files) {
  const posts = [];
  const poems = [];
  const music = [];
  for (const path of files.filter((file) => extname(file) === ".md")) {
    const source = await readFile(path, "utf8");
    const sourcePath = relative(root, path).replaceAll("\\", "/");
    if (sourcePath.startsWith("src/content/posts/")) posts.push(parsePostMetadata(sourcePath, source));
    else if (sourcePath.startsWith("src/content/poems/")) poems.push(parsePoemMetadata(sourcePath, source));
    else if (sourcePath.startsWith("src/content/music/")) music.push(parseMusicReviewMetadata(sourcePath, source));
  }
  const musicReviews = Object.fromEntries(["songs", "artists", "albums"].map((section) => [
    section,
    music.filter((entry) => entry.section === section),
  ]));
  const { featuredPosts, recentPosts, latestPoems, latestMusic } = getHomeContent(posts, poems, musicReviews);
  const homePosts = [...new Set([...featuredPosts, ...recentPosts])];
  return {
    noto: JSON.stringify({
      posts: homePosts.map(({ title, category, excerpt, firstParagraph }) => ({ title, category, excerpt, firstParagraph })),
      poems: latestPoems.map(({ title, previewLines }) => ({ title, previewLines })),
      music: latestMusic.map(({ title, kind }) => ({ title, kind })),
    }),
    zen: JSON.stringify({
      posts: homePosts.map(({ title }) => title),
      poems: latestPoems.map(({ title }) => title),
      music: latestMusic.map(({ title }) => title),
    }),
  };
}

function rangeContainsCodePoint(range, points) {
  const normalized = range.trim().replace(/^U\+/iu, "");
  let lower;
  let upper;
  if (normalized.includes("?")) {
    lower = Number.parseInt(normalized.replaceAll("?", "0"), 16);
    upper = Number.parseInt(normalized.replaceAll("?", "F"), 16);
  } else {
    const [start, end = start] = normalized.split("-");
    lower = Number.parseInt(start, 16);
    upper = Number.parseInt(end, 16);
  }
  for (const point of points) {
    if (point >= lower && point <= upper) return true;
  }
  return false;
}

function blockMatches(block, points) {
  const ranges = block.match(/unicode-range:\s*([^;]+);/iu)?.[1];
  return !ranges || ranges.split(",").some((range) => rangeContainsCodePoint(range, points));
}

async function renderFontStylesheets() {
  const [catalog, srcFiles, indexSource] = await Promise.all([
    readFile(catalogPath, "utf8"),
    sourceFiles(join(root, "src")),
    readFile(join(root, "index.html"), "utf8"),
  ]);
  const criticalUiSources = await Promise.all([
    "src/pages/HomePage.jsx",
    "src/components/Header.jsx",
    "src/components/Footer.jsx",
    "src/components/PageHero.jsx",
    "src/siteConfig.js",
  ].map((path) => readFile(join(root, path), "utf8")));
  const contentSources = await criticalContentSources(srcFiles);
  const sharedSource = [indexSource, ...criticalUiSources, JSON.stringify({ home: siteConfig.home, author: {
    name: authorProfile.name,
    tagline: authorProfile.tagline,
    introduction: authorProfile.introduction,
  }, footer: siteConfig.footer })].join("\n");
  const notoPoints = codePoints(`${sharedSource}\n${contentSources.noto}`);
  const zenPoints = codePoints(`${sharedSource}\n${contentSources.zen}`);
  const blocks = [...catalog.matchAll(/@font-face\s*\{[\s\S]*?\}/gu)].map((match) => match[0]);
  if (!blocks.length) throw new Error("字体目录中没有 @font-face 声明。");
  const criticalBlocks = blocks.filter((block) => {
    if (block.includes("font-family: 'Noto Sans SC'")) return blockMatches(block, notoPoints);
    if (block.includes("font-family: 'Zen Maru Gothic'") && block.includes("font-weight: 700;")) return blockMatches(block, zenPoints);
    return false;
  });
  if (!criticalBlocks.some((block) => block.includes("font-family: 'Noto Sans SC'"))) {
    throw new Error("字体目录未覆盖站点使用的 Noto Sans SC 字符。");
  }
  if (!criticalBlocks.some((block) => block.includes("font-family: 'Zen Maru Gothic'"))) {
    throw new Error("字体目录未覆盖首页使用的 Zen Maru Gothic 字符。");
  }
  return {
    critical: `${criticalBlocks.join("\n")}\n`,
    full: catalog.endsWith("\n") ? catalog : `${catalog}\n`,
  };
}

export async function generateFontStylesheets({ check = false } = {}) {
  const rendered = await renderFontStylesheets();
  if (check) {
    const [critical, full] = await Promise.all([
      readFile(criticalOutputPath, "utf8").catch(() => ""),
      readFile(fullOutputPath, "utf8").catch(() => ""),
    ]);
    if (critical !== rendered.critical || full !== rendered.full) {
      throw new Error("本地字体样式不存在或已过期；pnpm dev/build/test/check 会自动重建。");
    }
    return;
  }
  const directoryState = await lstat(outputDirectory).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
  if (directoryState?.isSymbolicLink()) throw new Error("字体输出目录不能是符号链接：public/fonscape");
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(criticalOutputPath, rendered.critical),
    writeFile(fullOutputPath, rendered.full),
  ]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateFontStylesheets({ check: process.argv.includes("--check") });
}
