import { isSiteRouteEnabled, normalizeRouteLocation, normalizeRoutePath } from "./sectionAvailability.js";
import { getDetailFallbackRoute, isDetailRoute } from "./navigation.js";
import { siteConfig } from "./siteConfig.js";

const detailReturnRoutes = new Map();
const pendingDetailSources = new Set();

function rawHashLocation() {
  return typeof window === "undefined" ? "/" : window.location.hash.slice(1) || "/";
}

/**
 * @param {{notify?: boolean}} [options]
 * @returns {string}
 */
function replaceHashWithHome(options = {}) {
  const previous = rawHashLocation();
  if (typeof window !== "undefined" && typeof window.history?.replaceState === "function") {
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#/`);
  }
  if (options.notify && previous !== "/" && typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof Event === "function") {
    window.dispatchEvent(new Event("hashchange"));
  }
  return "/";
}

const parseHash = () => normalizeRoutePath(rawHashLocation());
const parseHashQuery = () => {
  const location = rawHashLocation();
  const queryIndex = location.indexOf("?");
  return queryIndex >= 0 ? location.slice(queryIndex + 1) : "";
};

/**
 * @param {string} path
 * @param {string} [query]
 * @returns {string}
 */
function formatRouteLocation(path, query) {
  if (query === undefined) return normalizeRouteLocation(path);
  const route = normalizeRoutePath(path);
  return query ? `${route}?${String(query).replace(/^\?/u, "")}` : route;
}

/**
 * @returns {string}
 */
function currentRouteLocation() {
  return normalizeRouteLocation(rawHashLocation());
}
/** @type {Map<string, number>} */
const routeScrollPositions = new Map();
/** @type {Map<string, number>} */
const paginationPositions = new Map();
const ARTICLE_INDEX_DEFAULTS = { category: "全部", tag: "", series: "", view: "cards" };
let articleIndexState = { ...ARTICLE_INDEX_DEFAULTS };
/** @type {"push" | "pop" | "restore"} */
let nextRouteNavigationType = "pop";
// A hash assignment can emit popstate in some environments. Keep the
// explicit click/back marker until hashchange consumes it so that such a
// popstate cannot turn a push or restore into a scroll-restoring navigation.
let programmaticNavigationPending = false;
/** @param {string} path */
function paginationFamily(path) {
  const route = normalizeRoutePath(path);
  if (route === "/posts" || route.startsWith("/post/")) return "posts";
  if (route === "/poems" || route.startsWith("/poem/")) return "poems";
  if (route === "/music" || route.startsWith("/music/")) return "music";
  return null;
}
/** @param {string} family */
function clearPaginationFamily(family) {
  for (const key of paginationPositions.keys()) if (key.startsWith(`${family}:`)) paginationPositions.delete(key);
}
function clearArticleIndexState() { articleIndexState = { ...ARTICLE_INDEX_DEFAULTS }; }
/** @param {typeof ARTICLE_INDEX_DEFAULTS} next */
function updateArticleIndexState(next) { articleIndexState = { ...next }; }
/**
 * @param {string} detailPath
 * @param {string} sourcePath
 */
function rememberDetailSource(detailPath, sourcePath) {
  const detail = normalizeRoutePath(detailPath);
  if (!isDetailRoute(detail) || !isSiteRouteEnabled(detail, siteConfig)) return;
  const source = normalizeRouteLocation(sourcePath);
  if (source === detail) return;
  detailReturnRoutes.set(detail, source);
  pendingDetailSources.add(detail);
}

/**
 * @param {string} detailPath
 * @returns {string|null}
 */
function getDetailReturnRoute(detailPath) {
  const detail = normalizeRoutePath(detailPath);
  const source = detailReturnRoutes.get(detail);
  if (!source || !isSiteRouteEnabled(source, siteConfig)) return null;
  return source;
}

/**
 * Consume the source marker for a route transition. A detail route reached by
 * a real in-site click keeps its source; a direct hash entry invalidates any
 * stale marker from an earlier visit in this document.
 * @param {string} detailPath
 * @param {{preserveExisting?: boolean}} [options]
 * @returns {boolean}
 */
function consumeDetailSource(detailPath, options = {}) {
  const detail = normalizeRoutePath(detailPath);
  if (!isDetailRoute(detail)) return false;
  if (pendingDetailSources.has(detail)) {
    pendingDetailSources.delete(detail);
    return true;
  }
  if (options.preserveExisting && detailReturnRoutes.has(detail)) return true;
  detailReturnRoutes.delete(detail);
  return false;
}

/**
 * Navigate to a route while preserving the current hash entry's scroll
 * position. Detail pages use restoreScroll when returning to a remembered
 * in-site source; direct opens use the collection fallback instead.
 * @param {string} path
 * @param {{restoreScroll?: boolean, trackSource?: boolean}} [options]
 */
function go(path, options = {}) {
  const destination = normalizeRouteLocation(path);
  const destinationRoute = normalizeRoutePath(destination);
  const current = currentRouteLocation();
  if (destination === current) return;
  if (typeof window !== "undefined" && Number.isFinite(window.scrollY)) routeScrollPositions.set(current, window.scrollY);
  if (options.trackSource !== false) rememberDetailSource(destinationRoute, current);
  if (!isSiteRouteEnabled(destinationRoute, siteConfig)) {
    nextRouteNavigationType = "push";
    programmaticNavigationPending = true;
    replaceHashWithHome({ notify: true });
    nextRouteNavigationType = "pop";
    programmaticNavigationPending = false;
    return;
  }
  nextRouteNavigationType = options.restoreScroll ? "restore" : "push";
  programmaticNavigationPending = true;
  if (typeof window !== "undefined") window.location.hash = destination;
}

/**
 * Return from a detail route to its remembered source or its matching list.
 * @param {string} detailPath
 * @returns {string}
 */
function returnFromDetail(detailPath) {
  const source = getDetailReturnRoute(detailPath);
  const destination = source || getDetailFallbackRoute(detailPath);
  go(destination, { restoreScroll: Boolean(source), trackSource: false });
  return destination;
}

function markPushNavigation() {
  nextRouteNavigationType = "push";
  programmaticNavigationPending = true;
}
function markPopNavigation() {
  if (programmaticNavigationPending) return;
  nextRouteNavigationType = "pop";
}
function readNavigationType() { return nextRouteNavigationType; }
function consumeNavigationType() {
  const navigationType = nextRouteNavigationType;
  programmaticNavigationPending = false;
  return navigationType;
}

export { ARTICLE_INDEX_DEFAULTS, articleIndexState, clearArticleIndexState, clearPaginationFamily, consumeDetailSource, consumeNavigationType, currentRouteLocation, formatRouteLocation, getDetailReturnRoute, go, markPopNavigation, markPushNavigation, paginationFamily, paginationPositions, parseHash, parseHashQuery, readNavigationType, rememberDetailSource, replaceHashWithHome, returnFromDetail, routeScrollPositions, updateArticleIndexState };
