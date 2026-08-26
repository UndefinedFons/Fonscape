/**
 * Markdown-only derivations used by the build-time content manifest and the
 * runtime listing surfaces. Keeping these helpers independent from React
 * means the generated metadata stays small and the detail renderer can reuse
 * exactly the same rules after its source file is loaded.
 */

/**
 * @param {string} markdown
 * @returns {string}
 */
export function markdownToPlainText(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-+*]|\d+[.)])\s+/gm, "")
    .replace(/[|*_~`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} markdown
 * @returns {string}
 */
export function getFirstParagraph(markdown) {
  const blocks = markdown.split(/\n\s*\n/);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed || /^(?:```|~~~|!\[|\||#{1,6}\s|>)/.test(trimmed)) continue;
    const plainText = markdownToPlainText(trimmed);
    if (plainText) return plainText;
  }
  return "";
}

/**
 * Count the same visible Chinese characters and Latin words used by the UI.
 * @param {string} markdown
 * @returns {number}
 */
export function countWords(markdown) {
  const text = markdownToPlainText(markdown);
  const chineseCharacters = text.match(/[\u3400-\u9fff]/g)?.length || 0;
  const latinWords = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length || 0;
  return chineseCharacters + latinWords;
}

/**
 * @typedef {{ id: string, number: string, title: string, line?: number, prologue?: boolean }} ArticleOutlineItem
 */

/**
 * @param {string} markdown
 * @returns {ArticleOutlineItem[]}
 */
export function getArticleOutline(markdown) {
  const matches = [...markdown.matchAll(/^##\s+(.+)$/gm)];
  if (matches.length < 2) return [];
  /** @type {ArticleOutlineItem[]} */
  const outline = matches.map((match, index) => ({
    id: `article-section-${index + 1}`,
    number: String(index + 1).padStart(2, "0"),
    line: markdown.slice(0, match.index ?? 0).split("\n").length,
    title: (match[1] || "").replace(/[*_`~]/g, "").trim(),
  }));
  const preface = markdown
    .slice(0, matches[0]?.index ?? 0)
    .replace(/\[\[article-music\]\]/g, "");
  if (markdownToPlainText(preface)) {
    outline.unshift({ id: "article-prologue", number: "00", title: "序章", prologue: true });
  }
  return outline;
}

/**
 * @param {string} markdown
 * @returns {string[]}
 */
export function getPoemLines(markdown) {
  return markdown ? markdown.split(/\r?\n/u).map((line) => line.trimEnd()) : [];
}
