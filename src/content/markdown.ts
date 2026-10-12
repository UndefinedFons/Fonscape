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

export function getArticleOutline(markdown: string, numbered = false): ArticleOutlineItem[] {
  const lines = markdown.split(/\r?\n/u);
  type Heading = {
    line: number;
    title: string;
    level: number;
    depth: number;
    id: string;
    number: string;
    numberPath: string[];
    parentId?: string;
    childCount: number;
  };
  const headings: Heading[] = [];
  const prefaceLines: string[] = [];
  const stack: Heading[] = [];
  let fence: { character: string; length: number } | null = null;
  let h2Count = 0;
  let rootCount = 0;
  let orphanCount = 0;

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

    if (/^(?: {4,}|\t)/u.test(line)) return;

    const heading = line.match(/^ {0,3}(#{2,6})(?:[ \t]+(.*?))?[ \t]*$/u);
    const headingTitle = heading?.[2]?.replace(/[ \t]+#+[ \t]*$/u, "").trim() || "";
    if (heading && headingTitle) {
      const level = heading[1].length;
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      const parent = stack[stack.length - 1];
      const depth = parent ? parent.depth + 1 : 0;
      const childIndex = parent ? ++parent.childCount : 0;
      let id: string;
      let numberPath: string[];
      if (parent) {
        id = `${parent.id}-${childIndex}`;
        numberPath = [...parent.numberPath, String(childIndex)];
      } else {
        rootCount += 1;
        if (level === 2) {
          h2Count += 1;
          id = `article-section-${h2Count}`;
        } else {
          orphanCount += 1;
          id = `article-section-orphan-${level}-${orphanCount}`;
        }
        numberPath = [String(rootCount)];
      }
      const item: Heading = {
        line: index + 1,
        title: headingTitle,
        level,
        depth,
        id,
        number: numbered
          ? (parent ? numberPath.join(".") : String(rootCount).padStart(2, "0"))
          : "",
        numberPath,
        ...(parent ? { parentId: parent.id } : {}),
        childCount: 0,
      };
      headings.push(item);
      stack.push(item);
    } else if (headings.length === 0) {
      prefaceLines.push(line);
    }
  });

  if (headings.length === 0) return [];
  const outline: ArticleOutlineItem[] = headings.map((heading) => ({
    id: heading.id,
    number: heading.number,
    line: heading.line,
    title: heading.title.replace(/[*_`~]/g, "").trim(),
    level: heading.level,
    depth: heading.depth,
    ...(heading.parentId ? { parentId: heading.parentId } : {}),
  }));
  const preface = prefaceLines.join("\n").replace(/\[\[article-music\]\]/g, "");
  if (markdownToPlainText(preface)) {
    outline.unshift({ id: "article-prologue", number: numbered ? "00" : "", title: "序章", level: 2, depth: 0, prologue: true });
  }
  return outline;
}

export function getPoemLines(markdown: string): string[] {
  return markdown ? markdown.split(/\r?\n/u).map((line) => line.trimEnd()) : [];
}
import type { ArticleOutlineItem } from "../types.ts";
