const SLUG_PATTERN = /^[a-z0-9][a-z0-9/_-]{0,119}$/u;

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
  if (/^[\[{"']/u.test(value)) {
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
  if (!SLUG_PATTERN.test(entry.slug)) throw new Error(`${path} 的 slug 格式无效。`);
  if (Number.isNaN(new Date(entry.date).getTime())) throw new Error(`${path} 的 date 格式无效。`);
  return entry;
}

/**
 * @param {string} path
 * @param {string} source
 * @returns {import("../types.js").Post}
 */
export function parsePost(path, source) {
  const { data, filename, content } = parseMarkdownSource(path, source);
  if (Object.hasOwn(data, "coverAlt")) throw new Error(`${path} 的文章封面无需配置 coverAlt，系统会自动生成替代文字。`);
  if (Object.hasOwn(data, "coverSide")) throw new Error(`${path} 的文章封面不支持 coverSide。`);
  if (Object.hasOwn(data, "coverMode") && !["wide", "none"].includes(data.coverMode)) {
    throw new Error(`${path} 的 coverMode 必须是 wide 或 none。`);
  }
  if (!data.featured && Object.hasOwn(data, "featuredOrder")) throw new Error(`${path} 未置顶，不能配置 featuredOrder。`);
  if (Object.hasOwn(data, "featuredOrder") && (!Number.isInteger(data.featuredOrder) || data.featuredOrder < 1)) {
    throw new Error(`${path} 的 featuredOrder 必须是正整数。`);
  }
  const post = {
    ...data,
    slug: data.slug || filename,
    series: data.series || null,
    tags: Array.isArray(data.tags) ? data.tags : [],
    featured: Boolean(data.featured),
    content,
  };
  requireFields(post, ["title", "category", "date"], path);
  return validateCommonEntry(/** @type {import("../types.js").Post} */ (post), path);
}

/**
 * @param {string} path
 * @param {string} source
 * @returns {import("../types.js").Poem}
 */
export function parsePoem(path, source) {
  const { data, filename, content } = parseMarkdownSource(path, source);
  const poem = {
    ...data,
    slug: data.slug || filename,
    lines: content ? content.split(/\r?\n/u).map((line) => line.trimEnd()) : [],
  };
  requireFields(poem, ["title", "date"], path);
  if (!poem.lines.some(Boolean)) throw new Error(`${path} 的小诗正文为空。`);
  return validateCommonEntry(/** @type {import("../types.js").Poem} */ (poem), path);
}

/**
 * @param {string} path
 * @param {string} source
 * @returns {import("../types.js").MusicReview}
 */
export function parseMusicReview(path, source) {
  const { data, filename, content } = parseMarkdownSource(path, source);
  const review = {
    ...data,
    slug: data.slug || filename,
    section: data.section || "songs",
    reading: data.reading || `${Math.max(1, Math.ceil(content.length / 500))} 分钟`,
    content,
  };
  requireFields(review, ["title", "kind", "date"], path);
  if (!["songs", "artists", "albums"].includes(review.section)) {
    throw new Error(`${path} 的 section 必须是 songs、artists 或 albums。`);
  }
  return validateCommonEntry(/** @type {import("../types.js").MusicReview} */ (review), path);
}

/**
 * @param {import("../types.js").DatedEntry} left
 * @param {import("../types.js").DatedEntry} right
 */
export function sortNewestFirst(left, right) {
  return new Date(right.date).getTime() - new Date(left.date).getTime() || left.slug.localeCompare(right.slug);
}

/**
 * @template {import("../types.js").DatedEntry} T
 * @param {T[]} entries
 * @param {string} label
 * @returns {T[]}
 */
export function assertUniqueEntries(entries, label) {
  const slugs = new Set();
  for (const entry of entries) {
    if (slugs.has(entry.slug)) throw new Error(`${label} 中存在重复 slug：${entry.slug}`);
    slugs.add(entry.slug);
  }
  return entries;
}
