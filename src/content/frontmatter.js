import { countWords, getArticleOutline, getFirstParagraph, getPoemLines } from "./markdown.js";
import { parseMetingSongUrl } from "../musicSources.js";
import { parseContentDate } from "./date.js";

export { parseContentDate, sortNewestFirst } from "./date.js";

const SLUG_SEGMENT_PATTERN = /^[a-z0-9][a-z0-9_-]*$/u;

/** @param {unknown} value @returns {boolean} */
function isValidContentSlug(value) {
  const slug = String(value ?? "");
  return slug.length > 0 && slug.length <= 120 && slug.split("/").every((segment) => SLUG_SEGMENT_PATTERN.test(segment));
}

/**
 * @param {string} rawValue
 * @param {string} path
 * @param {string} key
 * @returns {unknown}
 */
function parseFrontmatterValue(rawValue, path, key) {
  const value = rawValue.trim();
  if (value === "null" || value === "~") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/u.test(value)) return Number(value);
  if (/^[[{"']/u.test(value)) {
    try {
      if (value.startsWith("'") && value.endsWith("'")) {
        return value.slice(1, -1).replace(/''/gu, "'");
      }
      return JSON.parse(value);
    } catch {
      throw new Error(`${path} 的 Frontmatter 字段 ${key} 格式无效。`);
    }
  }
  return value;
}

/**
 * @param {string} path
 * @param {string} source
 * @returns {{ data: Record<string, any>, filename: string, content: string }}
 */
export function parseMarkdownSource(path, source) {
  const frontmatter = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/u);
  if (!frontmatter) throw new Error(`${path} 缺少 Frontmatter。`);
  /** @type {Record<string, any>} */
  const data = {};
  frontmatter[1].split(/\r?\n/u).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separator = trimmed.indexOf(":");
    if (separator < 1) throw new Error(`${path} 的 Frontmatter 第 ${index + 2} 行格式无效。`);
    const key = trimmed.slice(0, separator).trim();
    if (Object.hasOwn(data, key)) throw new Error(`${path} 的 Frontmatter 字段 ${key} 重复。`);
    data[key] = parseFrontmatterValue(trimmed.slice(separator + 1), path, key);
  });
  return {
    data,
    filename: (path.split("/").pop() || "").replace(/\.md$/u, ""),
    content: source.slice(frontmatter[0].length).trim(),
  };
}

/**
 * @param {Record<string, any>} entry
 * @param {string[]} fields
 * @param {string} path
 */
function requireFields(entry, fields, path) {
  fields.forEach((key) => {
    if (!entry[key]) throw new Error(`${path} 的 Frontmatter 缺少 ${key}。`);
  });
}

/**
 * @template {import("../types.js").DatedEntry} T
 * @param {T} entry
 * @param {string} path
 * @returns {T}
 */
function validateCommonEntry(entry, path) {
  if (!isValidContentSlug(entry.slug)) throw new Error(`${path} 的 slug 格式无效。`);
  if (!parseContentDate(entry.date)) throw new Error(`${path} 的 date 格式无效。`);
  return entry;
}

/** @param {unknown} track @param {string} path @param {string} field */
function validateMusicSource(track, path, field) {
  if (!track || Array.isArray(track) || typeof track !== "object") {
    throw new Error(`${path} 的 ${field} 必须是对象。`);
  }
  const music = /** @type {Record<string, any>} */ (track);
  const hasUrl = typeof music.url === "string" && music.url.trim() !== "";
  const hasSource = typeof music.src === "string" && music.src.trim() !== "";
  if (hasUrl === hasSource) throw new Error(`${path} 的 ${field} 必须且只能配置 url 或 src。`);
  if (hasUrl && !parseMetingSongUrl(music.url)) {
    throw new Error(`${path} 的 ${field}.url 必须是网易云音乐或 QQ 音乐的单曲链接。`);
  }
  if (hasSource && (!music.title || !music.artist)) {
    throw new Error(`${path} 的本地 ${field} 必须配置 title 和 artist。`);
  }
}

/**
 * @param {string} path
 * @param {string} source
 * @param {{ includeContent?: boolean }} [options]
 * @returns {import("../types.js").Post}
 */
export function parsePost(path, source, options = {}) {
  const { data, filename, content } = parseMarkdownSource(path, source);
  const { content: _frontmatterContent, coverPosition: _coverPosition, ...frontmatter } = data;
  if (Object.hasOwn(data, "coverAlt")) throw new Error(`${path} 的文章封面无需配置 coverAlt，系统会自动生成替代文字。`);
  if (Object.hasOwn(data, "coverSide")) throw new Error(`${path} 的文章封面不支持 coverSide。`);
  if (Object.hasOwn(data, "coverMode") && !["wide", "none"].includes(data.coverMode)) {
    throw new Error(`${path} 的 coverMode 必须是 wide 或 none。`);
  }
  if (!data.featured && Object.hasOwn(data, "featuredOrder")) throw new Error(`${path} 未置顶，不能配置 featuredOrder。`);
  if (Object.hasOwn(data, "featuredOrder") && (!Number.isInteger(data.featuredOrder) || data.featuredOrder < 1)) {
    throw new Error(`${path} 的 featuredOrder 必须是正整数。`);
  }
  if (Object.hasOwn(data, "seriesOrder") && (!Number.isInteger(data.seriesOrder) || data.seriesOrder < 1)) {
    throw new Error(`${path} 的 seriesOrder 必须是正整数。`);
  }
  if (Object.hasOwn(data, "music")) validateMusicSource(data.music, path, "music");
  if (Object.hasOwn(data, "musicBlocks")) {
    if (!Array.isArray(data.musicBlocks)) throw new Error(`${path} 的 musicBlocks 必须是数组。`);
    data.musicBlocks.forEach((track, index) => validateMusicSource(track, path, `musicBlocks[${index}]`));
  }
  const post = {
    ...frontmatter,
    slug: data.slug || filename,
    series: data.series || null,
    tags: Array.isArray(data.tags) ? data.tags : [],
    featured: Boolean(data.featured),
    firstParagraph: getFirstParagraph(content),
    wordCount: countWords(content),
    outline: getArticleOutline(content),
    ...(options.includeContent === false ? {} : { content }),
  };
  requireFields(post, ["title", "category", "date"], path);
  return validateCommonEntry(/** @type {import("../types.js").Post} */ (post), path);
}

/**
 * @param {string} path
 * @param {string} source
 * @param {{ includeContent?: boolean }} [options]
 * @returns {import("../types.js").Poem}
 */
export function parsePoem(path, source, options = {}) {
  const { data, filename, content } = parseMarkdownSource(path, source);
  const { lines: _frontmatterLines, ...frontmatter } = data;
  const lines = getPoemLines(content);
  const poem = {
    ...frontmatter,
    slug: data.slug || filename,
    previewLines: lines.slice(0, 3),
    lineCount: lines.length,
    ...(options.includeContent === false ? {} : { lines }),
  };
  requireFields(poem, ["title", "date"], path);
  if (!lines.some(Boolean)) throw new Error(`${path} 的小诗正文为空。`);
  return validateCommonEntry(/** @type {import("../types.js").Poem} */ (poem), path);
}

/**
 * @param {string} path
 * @param {string} source
 * @param {{ includeContent?: boolean }} [options]
 * @returns {import("../types.js").MusicReview}
 */
export function parseMusicReview(path, source, options = {}) {
  const { data, filename, content } = parseMarkdownSource(path, source);
  const { content: _frontmatterContent, reading: _reading, ...frontmatter } = data;
  const review = {
    ...frontmatter,
    slug: data.slug || filename,
    section: data.section || "songs",
    firstParagraph: getFirstParagraph(content),
    wordCount: countWords(content),
    ...(options.includeContent === false ? {} : { content }),
  };
  requireFields(review, ["title", "kind", "date"], path);
  if (!["songs", "artists", "albums"].includes(review.section)) {
    throw new Error(`${path} 的 section 必须是 songs、artists 或 albums。`);
  }
  return validateCommonEntry(/** @type {import("../types.js").MusicReview} */ (review), path);
}

/**
 * Build-time parsers intentionally omit the Markdown body. The generated
 * manifest is shipped as user-owned build output, while the body remains in
 * Vite's per-file async raw modules.
 *
 * @param {string} path
 * @param {string} source
 */
export function parsePostMetadata(path, source) {
  return parsePost(path, source, { includeContent: false });
}

/**
 * @param {string} path
 * @param {string} source
 */
export function parsePoemMetadata(path, source) {
  return parsePoem(path, source, { includeContent: false });
}

/**
 * @param {string} path
 * @param {string} source
 */
export function parseMusicReviewMetadata(path, source) {
  return parseMusicReview(path, source, { includeContent: false });
}

/**
 * Minimal metadata contract for future repository-owned content collections.
 * A collection can opt into a richer parser later without changing the
 * distribution pipeline.
 *
 * @param {string} path
 * @param {string} source
 */
export function parseGenericContentMetadata(path, source) {
  const { data, filename } = parseMarkdownSource(path, source);
  const entry = { ...data, slug: data.slug || filename };
  requireFields(entry, ["title", "date"], path);
  return validateCommonEntry(/** @type {import("../types.js").DatedEntry & Record<string, any>} */ (entry), path);
}

/**
 * @template {import("../types.js").DatedEntry} T
 * @param {T[]} entries
 * @param {string} label
 * @param {(entry: T) => string} [keyOf]
 * @returns {T[]}
 */
export function assertUniqueEntries(entries, label, keyOf = (entry) => entry.slug) {
  const keys = new Set();
  for (const entry of entries) {
    const key = String(keyOf(entry));
    if (keys.has(key)) throw new Error(`${label} 中存在重复 slug：${key}`);
    keys.add(key);
  }
  return entries;
}
