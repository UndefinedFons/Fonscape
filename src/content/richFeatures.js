const MATH_CODE_FENCE_PATTERN = /(^|\n)\s{0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\s{0,3}\2\s*(?=\n|$)/gu;
const INLINE_CODE_PATTERN = /(`+|~+)(?=\S)([\s\S]*?\S)\1/gu;
const MATH_BLOCK_PATTERN = /\$\$([\s\S]+?)\$\$/u;
const MATH_INLINE_PATTERN = /(?<!\\)\$(?!\$)([^\n$]+?)(?<!\\)\$(?!\$)/u;

export const ALERT_TYPES = Object.freeze({
  NOTE: Object.freeze({ label: "提示", className: "note" }),
  TIP: Object.freeze({ label: "建议", className: "tip" }),
  IMPORTANT: Object.freeze({ label: "重要", className: "important" }),
  WARNING: Object.freeze({ label: "警告", className: "warning" }),
  CAUTION: Object.freeze({ label: "注意", className: "caution" }),
});

/**
 * @param {unknown} value
 * @returns {{ type: keyof typeof ALERT_TYPES, label: string, className: string } | null}
 */
export function parseAlertMarker(value) {
  const match = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(?:\r?\n|$)/iu.exec(String(value ?? ""));
  if (!match) return null;
  const type = /** @type {keyof typeof ALERT_TYPES} */ (match[1].toUpperCase());
  const config = ALERT_TYPES[type];
  return config ? { type, ...config } : null;
}

/**
 * Remove only a leading GitHub-style alert marker from one text node.
 * @param {unknown} value
 * @returns {string}
 */
export function stripAlertMarker(value) {
  return String(value ?? "").replace(/^\s*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(?:\r?\n|$)/iu, "");
}

/**
 * Detect math syntax without treating fenced or inline code as a formula.
 * This is deliberately conservative: a dynamic KaTeX import is only started
 * when a document has a complete supported delimiter pair.
 * @param {unknown} markdown
 * @returns {boolean}
 */
export function hasMathSyntax(markdown) {
  const source = protectCurrencySyntax(String(markdown ?? ""))
    .replace(MATH_CODE_FENCE_PATTERN, "$1")
    .replace(INLINE_CODE_PATTERN, " ");
  return MATH_BLOCK_PATTERN.test(source) || MATH_INLINE_PATTERN.test(source);
}

/**
 * Escape dollar delimiters around ordinary currency pairs before remark-math
 * sees a document. `$20 和 $30` stays ordinary text even when another real
 * formula appears in the same article.
 * @param {string} markdown
 * @returns {string}
 */
export function protectCurrencySyntax(markdown) {
  const lines = String(markdown ?? "").split(/(\r?\n)/u);
  let fenceCharacter = "";
  let fenceLength = 0;
  return lines.map((line) => {
    if (/^\s{0,3}(`{3,}|~{3,})/u.test(line)) {
      const fence = /^\s{0,3}(`{3,}|~{3,})/u.exec(line)?.[1] || "";
      const character = fence[0] || "";
      if (!fenceCharacter) {
        fenceCharacter = character;
        fenceLength = fence.length;
      } else if (character === fenceCharacter && fence.length >= fenceLength) {
        fenceCharacter = "";
        fenceLength = 0;
      }
      return line;
    }
    if (fenceCharacter || !line || /^\r?\n$/u.test(line)) return line;
    let output = "";
    let index = 0;
    while (index < line.length) {
      const delimiter = line[index] === "`" || line[index] === "~" ? line[index] : "";
      if (delimiter) {
        let delimiterEnd = index + 1;
        while (line[delimiterEnd] === delimiter) delimiterEnd += 1;
        const marker = line.slice(index, delimiterEnd);
        const closingIndex = line.indexOf(marker, delimiterEnd);
        if (closingIndex >= 0) {
          const end = closingIndex + marker.length;
          output += line.slice(index, end);
          index = end;
          continue;
        }
      }
      if (line[index] === "$" && (index === 0 || line[index - 1] !== "\\")) {
        const currency = /^\$([0-9][^$\n]{0,80})\$(?=\s*[0-9])/u.exec(line.slice(index));
        if (currency) {
          output += currency[0].replaceAll("$", "\\$");
          index += currency[0].length;
          continue;
        }
      }
      output += line[index];
      index += 1;
    }
    return output;
  }).join("");
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isMermaidLanguage(value) {
  return String(value ?? "").trim().toLowerCase() === "mermaid";
}
