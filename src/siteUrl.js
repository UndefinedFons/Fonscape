/**
 * Normalize the optional public origin used by generated absolute links.
 * An empty value deliberately disables those links.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeSiteUrl(value) {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return "";
  if (typeof value !== "string") throw new Error("fonscape.config.js 的 siteUrl 必须是 http(s) URL 或空字符串。");
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("fonscape.config.js 的 siteUrl 必须是有效的 http(s) URL。");
  }
  if (!/^https?:$/iu.test(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("fonscape.config.js 的 siteUrl 必须是没有账号、查询参数或片段的 http(s) URL。");
  }
  url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
  return url.toString().replace(/\/$/u, "");
}
