import { normalizeRouteLocation, normalizeRoutePath } from "./sectionAvailability.js";

/**
 * Encode a route segment while preserving slash boundaries for content slugs
 * that intentionally contain nested path segments.
 * @param {unknown} value
 * @returns {string}
 */
export function encodeRoutePath(value) {
  return String(value ?? "")
    .split("/")
    .filter((segment, index, segments) => segment || index === 0 || index === segments.length - 1)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/**
 * Build a query-bearing application route. Query values are encoded through
 * URLSearchParams so every internal link uses the same serialization rules.
 * @param {unknown} path
 * @param {URLSearchParams|Record<string, unknown>|string} [query]
 * @returns {string}
 */
export function routeHref(path, query) {
  const base = normalizeRouteLocation(path);
  if (query === undefined) return base;
  const parameters = query instanceof URLSearchParams
      ? query
      : typeof query === "string"
        ? new URLSearchParams(query.replace(/^\?/u, ""))
      : new URLSearchParams(Object.entries(query || {}).filter(([, value]) => value !== undefined && value !== null).map(([key, value]) => [key, String(value)]));
  const serialized = parameters.toString();
  return serialized ? `${normalizeRoutePath(base)}?${serialized}` : normalizeRoutePath(base);
}

/** @param {unknown} slug */
export function postRoute(slug) {
  return `/post/${encodeRoutePath(slug)}`;
}

/** @param {unknown} slug */
export function poemRoute(slug) {
  return `/poem/${encodeRoutePath(slug)}`;
}

/**
 * @param {unknown} section
 * @param {unknown} slug
 */
export function musicRoute(section, slug) {
  return `/music/${encodeRoutePath(section)}/${encodeRoutePath(slug)}`;
}

/**
 * @param {string} type
 * @param {Record<string, any>} entry
 * @returns {string}
 */
export function contentRoute(type, entry = {}) {
  if (type === "post") return postRoute(entry.slug || entry.key);
  if (type === "poem") return poemRoute(entry.slug || entry.key);
  if (type === "music") {
    const key = entry.key || `${entry.section || "songs"}/${entry.slug || ""}`;
    const [section, ...slugParts] = String(key).split("/");
    return musicRoute(section, slugParts.join("/"));
  }
  return "/";
}

/**
 * Convert the one supported legacy hash route into the canonical pathname
 * route. This is intentionally a one-time URL migration helper; application
 * routing itself never reads or writes hash routes.
 * @param {unknown} hash
 * @returns {string|null}
 */
export function legacyHashRoute(hash) {
  const value = String(hash || "");
  if (!value.startsWith("#/")) return null;
  return normalizeRouteLocation(value.slice(1));
}

/**
 * Application routes are the pages rendered by the SPA. Static resources and
 * API endpoints stay browser-native so feed, sitemap, audio, and API links
 * keep their normal HTTP behavior.
 * @param {unknown} path
 * @returns {boolean}
 */
export function isApplicationRoute(path) {
  const route = normalizeRoutePath(path);
  return route === "/"
    || route === "/posts"
    || route === "/poems"
    || route === "/music"
    || route === "/friends"
    || route === "/about"
    || route === "/admin/setup"
    || route === "/admin"
    || route.startsWith("/post/")
    || route.startsWith("/poem/")
    || route.startsWith("/music/")
    || route.startsWith("/admin/");
}

export { normalizeRouteLocation, normalizeRoutePath };
