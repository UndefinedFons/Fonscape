export function getPostMarkdown(post) {
  if (typeof post.content === "string") return post.content.trim();
  return "";
}

export function getPostOutline(post) {
  const markdown = getPostMarkdown(post);
  const matches = [...markdown.matchAll(/^##\s+(.+)$/gm)];
  if (matches.length < 2) return [];
  const outline = matches.map((match, index) => ({
    id: `article-section-${index + 1}`,
    number: String(index + 1).padStart(2, "0"),
    line: markdown.slice(0, match.index).split("\n").length,
    title: match[1].replace(/[*_`~]/g, "").trim(),
  }));
  const preface = markdown
    .slice(0, matches[0].index)
    .replace(/\[\[article-music\]\]/g, "");
  if (markdownToPlainText(preface)) {
    outline.unshift({ id: "article-prologue", number: "00", title: "序章", prologue: true });
  }
  return outline;
}

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

export function getPostPlainText(post) {
  return markdownToPlainText(getPostMarkdown(post));
}

export function getPostFirstParagraph(post) {
  const blocks = getPostMarkdown(post).split(/\n\s*\n/);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed || /^(?:```|~~~|!\[|\||#{1,6}\s|>)/.test(trimmed)) continue;
    const plainText = markdownToPlainText(trimmed);
    if (plainText) return plainText;
  }
  return "";
}
