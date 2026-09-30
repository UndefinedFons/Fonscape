/**
 * Markdown-only derivations used by the build-time content manifest and the
 * runtime listing surfaces. Keeping these helpers independent from React
 * means the generated metadata stays small and the detail renderer can reuse
 * exactly the same rules after its source file is loaded.
 */

export function markdownToPlainText(markdown: string): string {
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

export function getFirstParagraph(markdown: string): string {
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
 */
export function countWords(markdown: string): number {
  const text = markdownToPlainText(markdown);
  const chineseCharacters = text.match(/[\u3400-\u9fff]/g)?.length || 0;
  const latinWords = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length || 0;
  return chineseCharacters + latinWords;
}

export function getArticleOutline(markdown: string): ArticleOutlineItem[] {
  const lines = markdown.split(/\r?\n/u);
  const headings: Array<{ line: number; title: string }> = [];
  const prefaceLines: string[] = [];
  let fence: { character: string; length: number } | null = null;

  lines.forEach((line, index) => {
    if (fence) {
      if (headings.length === 0) prefaceLines.push(line);
      const closingFence = line.match(/^ {0,3}(`+|~+)[ \t]*$/u)?.[1];
      if (closingFence && closingFence[0] === fence.character && closingFence.length >= fence.length) fence = null;
      return;
    }

    const openingFence = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/u);
    if (openingFence && !(openingFence[1][0] === "`" && openingFence[2].includes("`"))) {
      if (headings.length === 0) prefaceLines.push(line);
      fence = { character: openingFence[1][0], length: openingFence[1].length };
      return;
    }

    const heading = line.match(/^##\s+(.+)$/u);
    if (heading) {
      headings.push({ line: index + 1, title: heading[1] });
    } else if (headings.length === 0) {
      prefaceLines.push(line);
    }
  });

  if (headings.length < 2) return [];
  const outline: ArticleOutlineItem[] = headings.map((heading, index) => ({
    id: `article-section-${index + 1}`,
    number: String(index + 1).padStart(2, "0"),
    line: heading.line,
    title: heading.title.replace(/[*_`~]/g, "").trim(),
  }));
  const preface = prefaceLines.join("\n").replace(/\[\[article-music\]\]/g, "");
  if (markdownToPlainText(preface)) {
    outline.unshift({ id: "article-prologue", number: "00", title: "序章", prologue: true });
  }
  return outline;
}

export function getPoemLines(markdown: string): string[] {
  return markdown ? markdown.split(/\r?\n/u).map((line) => line.trimEnd()) : [];
}
import type { ArticleOutlineItem } from "../types.ts";
