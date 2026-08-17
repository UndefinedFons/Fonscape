import { getPostPlainText } from "./richContent.js";
import { siteConfig } from "./content/site.js";

function getPostWordCount(post) {
  const text = getPostPlainText(post);
  const chineseCharacters = text.match(/[\u3400-\u9fff]/g)?.length || 0;
  const latinWords = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length || 0;
  return chineseCharacters + latinWords;
}
const formatContentDate = (value) => value?.replace("T", " ").slice(0, 19) || "";
const BLOG_LAUNCHED_AT = new Date(siteConfig.footer.launchedAt).getTime();
const BLOG_START_YEAR = Number.parseInt(siteConfig.footer.launchedAt.slice(0, 4), 10);

function formatCopyrightYears(now = Date.now()) {
  const currentYear = new Date(now).getFullYear();
  return currentYear > BLOG_START_YEAR ? `${BLOG_START_YEAR}-${currentYear}` : String(BLOG_START_YEAR);
}

export { BLOG_LAUNCHED_AT, formatContentDate, formatCopyrightYears, getPostWordCount };
