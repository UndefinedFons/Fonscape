import { normalizeRouteLocation, normalizeRoutePath } from "./sectionAvailability.ts";

/**
 * Encode a route segment while preserving slash boundaries for content slugs
 * that intentionally contain nested path segments.
 * @param {unknown} value
 * @returns {string}
 */
export function encodeRoutePath(value: unknown): string {
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
export function routeHref(
  path: unknown,
  query?: URLSearchParams | Record<string, unknown> | string,
): string {
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

export function postRoute(slug: unknown): string {
  return `/post/${encodeRoutePath(slug)}`;
}

export function poemRoute(slug: unknown): string {
  return `/poem/${encodeRoutePath(slug)}`;
}

/**
 */
export function musicRoute(section: unknown, slug: unknown): string {
  return `/music/${encodeRoutePath(section)}/${encodeRoutePath(slug)}`;
}

/**
 * Split the music content key into its fixed section and complete slug path.
 * Nested slash-delimited slug segments are preserved as part of the slug.
 */
export function parseMusicContentKey(value: unknown): { section: string; slug: string } {
  const [section, ...slugParts] = String(value ?? "").split("/");
  return { section, slug: slugParts.join("/") };
}

export function contentRoute(
  type: string,
  entry: { slug?: string; key?: string; section?: string } = {},
): string {
  if (type === "post") return postRoute(entry.slug || entry.key);
  if (type === "poem") return poemRoute(entry.slug || entry.key);
  if (type === "music") {
    const key = entry.key || `${entry.section || "songs"}/${entry.slug || ""}`;
    const { section, slug } = parseMusicContentKey(key);
    return musicRoute(section, slug);
  }
  return "/";
}

/**
 * Convert the one supported legacy hash route into the canonical pathname
 * route. This is intentionally a one-time URL migration helper; application
 * routing itself never reads or writes hash routes.
 */
export function legacyHashRoute(hash: unknown): string | null {
  const value = String(hash || "");
  if (!value.startsWith("#/")) return null;
  return normalizeRouteLocation(value.slice(1));
}

/**
 * Application routes are the pages rendered by the SPA. Static resources and
 * API endpoints stay browser-native so feed, sitemap, audio, and API links
 * keep their normal HTTP behavior.
 */
export function isApplicationRoute(path: unknown): boolean {
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
