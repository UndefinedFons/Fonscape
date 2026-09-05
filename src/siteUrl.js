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
  if (url.pathname !== "/") {
    throw new Error("fonscape.config.js 的 siteUrl 必须是站点根地址，例如 https://example.com，不能包含子目录。");
  }
  return url.origin;
}

/**
 * Resolve a canonical application or feed path at the configured public origin.
 * @param {unknown} siteUrl
 * @param {unknown} path
 * @returns {string}
 */
export function siteUrlForPath(siteUrl, path) {
  const base = normalizeSiteUrl(siteUrl);
  if (!base) return "";
  const value = String(path || "/").replace(/^\/+/u, "");
  return new URL(value, `${base}/`).toString();
}
