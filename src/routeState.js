import { isSiteRouteEnabled, normalizeRouteLocation, normalizeRoutePath } from "./sectionAvailability.js";
import { getDetailFallbackRoute, isDetailRoute } from "./navigation.js";
import { contentRoute } from "./routes.js";
import { siteConfig } from "./siteConfig.js";

const detailReturnRoutes = new Map();
const pendingDetailSources = new Set();

function rawRouteLocation() {
  if (typeof window === "undefined") return "/";
  const pathname = window.location?.pathname || "/";
  const search = window.location?.search || "";
  return `${pathname}${search}`;
}

/**
 * Replace the current browser URL without adding a history entry.
 * @param {unknown} path
 * @param {{notify?: boolean}} [options]
 * @returns {string}
 */
export function replaceRoute(path, options = {}) {
  const destination = normalizeRouteLocation(path);
  nextRouteNavigationType = "replace";
  if (typeof window !== "undefined" && typeof window.history?.replaceState === "function") {
    const state = window.history.state || {};
    window.history.replaceState(state, "", destination);
  }
  if (options.notify && typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof Event === "function") {
    window.dispatchEvent(new Event("fonscape:navigate"));
  }
  return destination;
}

/**
 * Replace an invalid or retired route with the home page.
 * @param {{notify?: boolean}} [options]
 * @returns {string}
 */
export function replaceRouteWithHome(options = {}) {
  return replaceRoute("/", options);
}

/**
 * Parse the canonical pathname route. The hash is only handled once by the
 * entry module during legacy URL conversion.
 * @returns {string}
 */
export function parseRoutePath() {
  return normalizeRoutePath(rawRouteLocation());
}

/** @returns {string} */
export function parseRouteQuery() {
  const search = typeof window === "undefined" ? "" : String(window.location?.search || "");
  return search.replace(/^\?/u, "");
}

/**
 * @param {string} path
 * @param {string|URLSearchParams} [query]
 * @returns {string}
 */
export function formatRouteLocation(path, query) {
  if (query === undefined) return normalizeRouteLocation(path);
  const route = normalizeRoutePath(path);
  const serialized = query instanceof URLSearchParams ? query.toString() : String(query || "").replace(/^\?/u, "");
  return serialized ? `${route}?${serialized}` : route;
}

/** @returns {string} */
export function currentRouteLocation() {
  return formatRouteLocation(parseRoutePath(), parseRouteQuery());
}

/** @type {Map<string, number>} */
const routeScrollPositions = new Map();
/** @type {Map<string, number>} */
const paginationPositions = new Map();
export const ARTICLE_INDEX_DEFAULTS = { category: "全部", tag: "", series: "", view: "cards" };
export let articleIndexState = { ...ARTICLE_INDEX_DEFAULTS };
/** @type {"push" | "pop" | "restore" | "replace"} */
let nextRouteNavigationType = "push";
let knownPopNavigation = false;

const HISTORY_ENTRY_KEY = "fonscapeRouteEntry";
let historyEntrySequence = 0;
let currentHistoryEntry = "";

function nextHistoryEntry() {
  historyEntrySequence += 1;
  return `${Date.now()}-${historyEntrySequence}`;
}

function recordHistoryEntry(preserveExisting = false) {
  if (typeof window === "undefined" || typeof window.history?.replaceState !== "function") return;
  const state = window.history.state || {};
  currentHistoryEntry = preserveExisting && typeof state[HISTORY_ENTRY_KEY] === "string"
    ? state[HISTORY_ENTRY_KEY]
    : nextHistoryEntry();
  if (state[HISTORY_ENTRY_KEY] !== currentHistoryEntry) {
    window.history.replaceState({ ...state, [HISTORY_ENTRY_KEY]: currentHistoryEntry }, "");
  }
}

recordHistoryEntry(true);

/** @param {string} path */
export function paginationFamily(path) {
  const route = normalizeRoutePath(path);
  if (route === "/posts" || route.startsWith("/post/")) return "posts";
  if (route === "/poems" || route.startsWith("/poem/")) return "poems";
  if (route === "/music" || route.startsWith("/music/")) return "music";
  return null;
}

/** @param {string} family */
export function clearPaginationFamily(family) {
  for (const key of paginationPositions.keys()) if (key.startsWith(`${family}:`)) paginationPositions.delete(key);
}

export function clearArticleIndexState() {
  articleIndexState = { ...ARTICLE_INDEX_DEFAULTS };
}

/** @param {typeof ARTICLE_INDEX_DEFAULTS} next */
export function updateArticleIndexState(next) {
  articleIndexState = { ...next };
}

/**
 * @param {string} detailPath
 * @param {string} sourcePath
 */
export function rememberDetailSource(detailPath, sourcePath) {
  const detail = normalizeRoutePath(detailPath);
  if (!isDetailRoute(detail) || !isSiteRouteEnabled(detail, siteConfig)) return;
  const source = normalizeRouteLocation(sourcePath);
  if (source === detail) return;
  detailReturnRoutes.set(detail, source);
  pendingDetailSources.add(detail);
}

/** @param {string} detailPath @returns {string|null} */
export function getDetailReturnRoute(detailPath) {
  const detail = normalizeRoutePath(detailPath);
  const source = detailReturnRoutes.get(detail);
  if (!source || !isSiteRouteEnabled(source, siteConfig)) return null;
  return source;
}

/**
 * Consume the source marker for a route transition. A detail route reached by
 * a real in-site click keeps its source; a direct URL entry clears stale state.
 * @param {string} detailPath
 * @param {{preserveExisting?: boolean}} [options]
 * @returns {boolean}
 */
export function consumeDetailSource(detailPath, options = {}) {
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
 * Navigate to a route with the History API while retaining scroll and detail
 * source bookkeeping used by list return controls.
 * @param {string} path
 * @param {{restoreScroll?: boolean, trackSource?: boolean}} [options]
 */
export function go(path, options = {}) {
  const destination = normalizeRouteLocation(path);
  const destinationRoute = normalizeRoutePath(destination);
  const current = currentRouteLocation();
  if (destination === current) return;
  if (typeof window !== "undefined" && Number.isFinite(window.scrollY)) routeScrollPositions.set(current, window.scrollY);
  if (options.trackSource !== false) rememberDetailSource(destinationRoute, current);
  if (!isSiteRouteEnabled(destinationRoute, siteConfig)) {
    knownPopNavigation = false;
    nextRouteNavigationType = "replace";
    replaceRouteWithHome({ notify: true });
    return;
  }
  knownPopNavigation = false;
  nextRouteNavigationType = options.restoreScroll ? "restore" : "push";
  if (typeof window === "undefined" || typeof window.history?.pushState !== "function") return;
  const state = { ...(window.history.state || {}), [HISTORY_ENTRY_KEY]: nextHistoryEntry() };
  currentHistoryEntry = state[HISTORY_ENTRY_KEY];
  window.history.pushState(state, "", destination);
  if (typeof window.dispatchEvent === "function" && typeof Event === "function") window.dispatchEvent(new Event("fonscape:navigate"));
}

/** @param {string} detailPath @returns {string} */
export function returnFromDetail(detailPath) {
  const source = getDetailReturnRoute(detailPath);
  const destination = source || getDetailFallbackRoute(detailPath);
  go(destination, { restoreScroll: Boolean(source), trackSource: false });
  return destination;
}

export function markPushNavigation() {
  knownPopNavigation = false;
  nextRouteNavigationType = "push";
}

/** @param {PopStateEvent} [event] */
export function markPopNavigation(event) {
  knownPopNavigation = Boolean(event?.state && typeof event.state[HISTORY_ENTRY_KEY] === "string");
  if (event?.state?.[HISTORY_ENTRY_KEY] === currentHistoryEntry) {
    nextRouteNavigationType = "push";
    return;
  }
  nextRouteNavigationType = "pop";
}

/**
 * Return whether the current popstate came from a history entry created by
 * the app. Unknown entries (for example a direct browser URL) must clear
 * stale detail return targets instead of reusing them.
 * @returns {boolean}
 */
export function consumeKnownPopNavigation() {
  const known = knownPopNavigation;
  knownPopNavigation = false;
  return known;
}

/** @returns {"push" | "pop" | "restore" | "replace"} */
export function readNavigationType() {
  return nextRouteNavigationType;
}

/** @returns {"push" | "pop" | "restore" | "replace"} */
export function consumeNavigationType() {
  const navigationType = nextRouteNavigationType;
  nextRouteNavigationType = "push";
  if (navigationType !== "pop") knownPopNavigation = false;
  if (navigationType === "pop") recordHistoryEntry(true);
  return navigationType;
}

export { contentRoute, paginationPositions, routeScrollPositions };
