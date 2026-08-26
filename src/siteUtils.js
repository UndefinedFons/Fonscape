import { getPostPlainText } from "./richContent.js";

/** @param {{ content?: string, wordCount?: number }} post */
function getPostWordCount(post) {
  if (Number.isFinite(post.wordCount)) return post.wordCount;
  const text = getPostPlainText(post);
  const chineseCharacters = text.match(/[\u3400-\u9fff]/g)?.length || 0;
  const latinWords = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length || 0;
  return chineseCharacters + latinWords;
}
/** @param {string | null | undefined} value */
const formatContentDate = (value) => value?.replace("T", " ").slice(0, 19) || "";

/**
 * @param {unknown} value
 * @param {number} [fallback]
 */
function normalizeLaunchedAt(value, fallback = Date.now()) {
  const launchedAt = Number(value);
  return Number.isFinite(launchedAt) && launchedAt > 0 ? launchedAt : fallback;
}

/**
 * @param {number} [now]
 * @param {number} [launchedAt]
 */
function formatCopyrightYears(now = Date.now(), launchedAt = now) {
  const currentYear = new Date(now).getFullYear();
  const startYear = new Date(normalizeLaunchedAt(launchedAt, now)).getFullYear();
  return currentYear > startYear ? `${startYear}-${currentYear}` : String(startYear);
}

export { formatContentDate, formatCopyrightYears, getPostWordCount, normalizeLaunchedAt };
