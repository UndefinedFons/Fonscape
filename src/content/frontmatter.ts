import type { DatedEntry, GenericContentMetadata, MusicReview, MusicReviewMetadata, Poem, PoemMetadata, Post, PostMetadata } from "../types.ts";

type ParserOptions = { includeContent?: boolean };

import { countWords, getArticleOutline, getFirstParagraph, getPoemLines } from "./markdown.ts";
import { parseMetingLibraryUrl, parseMetingSongUrl } from "../musicSources.ts";
import { parseContentDate } from "./date.ts";

export { parseContentDate, sortNewestFirst } from "./date.ts";

const SLUG_SEGMENT_PATTERN = /^[a-z0-9][a-z0-9_-]*$/u;

function isValidContentSlug(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 120
    && value.split("/").every((segment) => SLUG_SEGMENT_PATTERN.test(segment));
}

function parseFrontmatterValue(rawValue: string, path: string, key: string): unknown {
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

export function parseMarkdownSource(path: string, source: string) {
  const frontmatter = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/u);
  if (!frontmatter) throw new Error(`${path} 缺少 Frontmatter。`);
  const data: Record<string, unknown> = {};
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

function requireFields<T extends string>(entry: Record<string, unknown>, fields: T[], path: string): asserts entry is Record<string, unknown> & Record<T, string> {
  fields.forEach((key) => {
    if (entry[key] === undefined || entry[key] === null || entry[key] === "") {
      throw new Error(`${path} 的 Frontmatter 缺少 ${key}。`);
    }
    if (typeof entry[key] !== "string" || !entry[key].trim()) {
      throw new Error(`${path} 的 Frontmatter ${key} 必须是非空字符串。`);
    }
  });
}

function validateCommonEntry<T extends DatedEntry>(entry: T, path: string): T {
  if (!isValidContentSlug(entry.slug)) throw new Error(`${path} 的 slug 格式无效。`);
  if (!parseContentDate(entry.date)) throw new Error(`${path} 的 date 格式无效。`);
  return entry;
}

function validateOptionalStrings(data: Record<string, unknown>, fields: string[], path: string): void {
  for (const key of fields) {
    if (Object.hasOwn(data, key) && typeof data[key] !== "string") {
      throw new Error(`${path} 的 Frontmatter ${key} 必须是字符串。`);
    }
  }
}

function validateMusicSource(track: unknown, path: string, field: string): void {
  if (!track || Array.isArray(track) || typeof track !== "object") {
    throw new Error(`${path} 的 ${field} 必须是对象。`);
  }
  const music = (track) as Record<string, unknown>;
  validateOptionalStrings(music, ["url", "src", "title", "artist", "cover", "id"], `${path} 的 ${field}`);
  if (Object.hasOwn(music, "autoplay") && typeof music.autoplay !== "boolean") {
    throw new Error(`${path} 的 ${field}.autoplay 必须是布尔值。`);
  }
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

export function parsePost(path: string, source: string, options: { includeContent: false }): PostMetadata;
export function parsePost(path: string, source: string, options?: { includeContent?: true }): Post;
export function parsePost(path: string, source: string, options: ParserOptions): Post | PostMetadata;
export function parsePost(path: string, source: string, options: ParserOptions = {}): Post | PostMetadata {
  const { data, filename, content } = parseMarkdownSource(path, source);
  const { content: _frontmatterContent, coverPosition: _coverPosition, ...frontmatter } = data;
  validateOptionalStrings(data, ["slug", "excerpt", "image", "cardPosition"], path);
  if (Object.hasOwn(data, "featured") && typeof data.featured !== "boolean") {
    throw new Error(`${path} 的 Frontmatter featured 必须是布尔值。`);
  }
  if (Object.hasOwn(data, "musicPlacement") && data.musicPlacement !== "inline") {
    throw new Error(`${path} 的 Frontmatter musicPlacement 必须是 inline。`);
  }
  if (Object.hasOwn(data, "tags") && (!Array.isArray(data.tags) || !data.tags.every((tag) => typeof tag === "string"))) {
    throw new Error(`${path} 的 Frontmatter tags 必须是字符串数组。`);
  }
  if (Object.hasOwn(data, "series") && data.series !== null && typeof data.series !== "string") {
    throw new Error(`${path} 的 Frontmatter series 必须是字符串。`);
  }
  if (Object.hasOwn(data, "coverAlt")) throw new Error(`${path} 的文章封面无需配置 coverAlt，系统会自动生成替代文字。`);
  if (Object.hasOwn(data, "coverSide")) throw new Error(`${path} 的文章封面不支持 coverSide。`);
  if (Object.hasOwn(data, "coverMode") && !["wide", "none"].includes(data.coverMode as string)) {
    throw new Error(`${path} 的 coverMode 必须是 wide 或 none。`);
  }
  if (!data.featured && Object.hasOwn(data, "featuredOrder")) throw new Error(`${path} 未置顶，不能配置 featuredOrder。`);
  if (Object.hasOwn(data, "featuredOrder") && (!Number.isInteger(data.featuredOrder) || (data.featuredOrder as number) < 1)) {
    throw new Error(`${path} 的 featuredOrder 必须是正整数。`);
  }
  if (Object.hasOwn(data, "seriesOrder") && (!Number.isInteger(data.seriesOrder) || (data.seriesOrder as number) < 1)) {
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
  return validateCommonEntry((post) as Post | PostMetadata, path);
}

export function parsePoem(path: string, source: string, options: { includeContent: false }): PoemMetadata;
export function parsePoem(path: string, source: string, options?: { includeContent?: true }): Poem;
export function parsePoem(path: string, source: string, options: ParserOptions): Poem | PoemMetadata;
export function parsePoem(path: string, source: string, options: ParserOptions = {}): Poem | PoemMetadata {
  const { data, filename, content } = parseMarkdownSource(path, source);
  const { lines: _frontmatterLines, ...frontmatter } = data;
  validateOptionalStrings(data, ["slug", "note"], path);
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
  return validateCommonEntry((poem) as Poem | PoemMetadata, path);
}

export function parseMusicReview(path: string, source: string, options: { includeContent: false }): MusicReviewMetadata;
export function parseMusicReview(path: string, source: string, options?: { includeContent?: true }): MusicReview;
export function parseMusicReview(path: string, source: string, options: ParserOptions): MusicReview | MusicReviewMetadata;
export function parseMusicReview(path: string, source: string, options: ParserOptions = {}): MusicReview | MusicReviewMetadata {
  const { data, filename, content } = parseMarkdownSource(path, source);
  const { content: _frontmatterContent, reading: _reading, kind: _kind, ...frontmatter } = data;
  validateOptionalStrings(data, ["title", "slug", "section", "excerpt", "image", "url", "sourceTitle", "sourceMeta", "action"], path);
  if (Object.hasOwn(data, "featured") && typeof data.featured !== "boolean") {
    throw new Error(`${path} 的 Frontmatter featured 必须是布尔值。`);
  }
  if (!data.featured && Object.hasOwn(data, "featuredOrder")) throw new Error(`${path} 未置顶，不能配置 featuredOrder。`);
  if (Object.hasOwn(data, "featuredOrder") && (!Number.isInteger(data.featuredOrder) || (data.featuredOrder as number) < 1)) {
    throw new Error(`${path} 的 featuredOrder 必须是正整数。`);
  }
  if (data.section && !["songs", "albums", "playlists"].includes(data.section as string)) {
    throw new Error(`${path} 的 section 必须是 songs、albums 或 playlists。`);
  }
  const target = parseMetingLibraryUrl(data.url);
  const section = target ? { song: "songs", album: "albums", playlist: "playlists" }[target.type] : data.section;
  if (!target && (!section || typeof data.sourceTitle !== "string" || !data.sourceTitle.trim())) {
    throw new Error(`${path} 的音乐链接无法自动识别，请填写 section（songs、albums 或 playlists）和 sourceTitle（音乐名称）。`);
  }
  const review = {
    ...frontmatter,
    title: content && typeof data.title === "string" ? data.title.trim() : "",
    sourceTitle: typeof data.sourceTitle === "string" ? data.sourceTitle.trim() : "",
    slug: data.slug || filename,
    section,
    featured: Boolean(data.featured),
    firstParagraph: getFirstParagraph(content),
    wordCount: countWords(content),
    ...(options.includeContent === false ? {} : { content }),
  };
  requireFields(review, ["date"], path);
  return validateCommonEntry((review) as MusicReview | MusicReviewMetadata, path);
}

export function parsePostMetadata(path: string, source: string): PostMetadata {
  return parsePost(path, source, { includeContent: false });
}

export function parsePoemMetadata(path: string, source: string): PoemMetadata {
  return parsePoem(path, source, { includeContent: false });
}

export function parseMusicReviewMetadata(path: string, source: string): MusicReviewMetadata {
  return parseMusicReview(path, source, { includeContent: false });
}

export function parseGenericContentMetadata(path: string, source: string): GenericContentMetadata {
  const { data, filename } = parseMarkdownSource(path, source);
  const entry = { ...data, slug: data.slug || filename };
  requireFields(entry, ["title", "date"], path);
  return validateCommonEntry((entry) as GenericContentMetadata, path);
}

export function assertUniqueEntries<T extends DatedEntry>(entries: T[], label: string, keyOf: (entry: T) => string = (entry) => entry.slug): T[] {
  const keys = new Set<string>();
  for (const entry of entries) {
    const key = String(keyOf(entry));
    if (keys.has(key)) throw new Error(`${label} 中存在重复 slug：${key}`);
    keys.add(key);
  }
  return entries;
}
