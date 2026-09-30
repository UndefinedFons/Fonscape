import { isSiteRouteEnabled, normalizeRouteLocation, normalizeRoutePath } from "./sectionAvailability.ts";
import { getDetailFallbackRoute, isDetailRoute } from "./navigation.ts";
import { contentRoute } from "./routes.ts";
import { siteConfig } from "./siteConfig.ts";

const detailReturnRoutes = new Map<string, string>();
const pendingDetailSources = new Set<string>();

function rawRouteLocation(): string {
  if (typeof window === "undefined") return "/";
  const pathname = window.location?.pathname || "/";
  const search = window.location?.search || "";
  return `${pathname}${search}`;
}

/**
 * Replace the current browser URL without adding a history entry.
 */
export function replaceRoute(path: unknown, options: { notify?: boolean } = {}): string {
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
 */
export function replaceRouteWithHome(options: { notify?: boolean } = {}): string {
  return replaceRoute("/", options);
}

/**
 * Parse the canonical pathname route. The hash is only handled once by the
 * entry module during legacy URL conversion.
 */
export function parseRoutePath(): string {
  return normalizeRoutePath(rawRouteLocation());
}

export function parseRouteQuery(): string {
  const search = typeof window === "undefined" ? "" : String(window.location?.search || "");
  return search.replace(/^\?/u, "");
}

export function formatRouteLocation(path: string, query?: string | URLSearchParams): string {
  if (query === undefined) return normalizeRouteLocation(path);
  const route = normalizeRoutePath(path);
  const serialized = query instanceof URLSearchParams ? query.toString() : String(query || "").replace(/^\?/u, "");
  return serialized ? `${route}?${serialized}` : route;
}

export function currentRouteLocation(): string {
  return formatRouteLocation(parseRoutePath(), parseRouteQuery());
}

const routeScrollPositions = new Map<string, number>();
const paginationPositions = new Map<string, number>();
interface ArticleIndexState {
  category: string;
  tag: string;
  series: string;
  view: string;
}

export const ARTICLE_INDEX_DEFAULTS: ArticleIndexState = { category: "全部", tag: "", series: "", view: "cards" };
export let articleIndexState: ArticleIndexState = { ...ARTICLE_INDEX_DEFAULTS };
type NavigationType = "push" | "pop" | "restore" | "replace";

let nextRouteNavigationType: NavigationType = "push";
let knownPopNavigation = false;

const HISTORY_ENTRY_KEY = "fonscapeRouteEntry";
let historyEntrySequence = 0;
let currentHistoryEntry = "";

function nextHistoryEntry(): string {
  historyEntrySequence += 1;
  return `${Date.now()}-${historyEntrySequence}`;
}

function recordHistoryEntry(preserveExisting = false): void {
  if (typeof window === "undefined" || typeof window.history?.replaceState !== "function") return;
  const state = (window.history.state || {}) as Record<string, unknown>;
  currentHistoryEntry = preserveExisting && typeof state[HISTORY_ENTRY_KEY] === "string"
    ? state[HISTORY_ENTRY_KEY]
    : nextHistoryEntry();
  if (state[HISTORY_ENTRY_KEY] !== currentHistoryEntry) {
    window.history.replaceState({ ...state, [HISTORY_ENTRY_KEY]: currentHistoryEntry }, "");
  }
}

recordHistoryEntry(true);

export function paginationFamily(path: string): "posts" | "poems" | "music" | null {
  const route = normalizeRoutePath(path);
  if (route === "/posts" || route.startsWith("/post/")) return "posts";
  if (route === "/poems" || route.startsWith("/poem/")) return "poems";
  if (route === "/music" || route.startsWith("/music/")) return "music";
  return null;
}

export function clearPaginationFamily(family: string): void {
  for (const key of paginationPositions.keys()) if (key.startsWith(`${family}:`)) paginationPositions.delete(key);
}

export function clearArticleIndexState(): void {
  articleIndexState = { ...ARTICLE_INDEX_DEFAULTS };
}

export function updateArticleIndexState(next: ArticleIndexState): void {
  articleIndexState = { ...next };
}

export function rememberDetailSource(detailPath: string, sourcePath: string): void {
  const detail = normalizeRoutePath(detailPath);
  if (!isDetailRoute(detail) || !isSiteRouteEnabled(detail, siteConfig)) return;
  const source = normalizeRouteLocation(sourcePath);
  if (source === detail) return;
  detailReturnRoutes.set(detail, source);
  pendingDetailSources.add(detail);
}

export function getDetailReturnRoute(detailPath: string): string | null {
  const detail = normalizeRoutePath(detailPath);
  const source = detailReturnRoutes.get(detail);
  if (!source || !isSiteRouteEnabled(source, siteConfig)) return null;
  return source;
}

/**
 * Consume the source marker for a route transition. A detail route reached by
 * a real in-site click keeps its source; a direct URL entry clears stale state.
 */
export function consumeDetailSource(detailPath: string, options: { preserveExisting?: boolean } = {}): boolean {
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
 */
export function go(path: string, options: { restoreScroll?: boolean; trackSource?: boolean } = {}): void {
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
  const state = { ...((window.history.state || {}) as Record<string, unknown>), [HISTORY_ENTRY_KEY]: nextHistoryEntry() };
  currentHistoryEntry = state[HISTORY_ENTRY_KEY] as string;
  window.history.pushState(state, "", destination);
  if (typeof window.dispatchEvent === "function" && typeof Event === "function") window.dispatchEvent(new Event("fonscape:navigate"));
}

export function returnFromDetail(detailPath: string): string {
  const source = getDetailReturnRoute(detailPath);
  const destination = source || getDetailFallbackRoute(detailPath);
  go(destination, { restoreScroll: Boolean(source), trackSource: false });
  return destination;
}

export function markPushNavigation(): void {
  knownPopNavigation = false;
  nextRouteNavigationType = "push";
}

export function markPopNavigation(event?: PopStateEvent): void {
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
 */
export function consumeKnownPopNavigation(): boolean {
  const known = knownPopNavigation;
  knownPopNavigation = false;
  return known;
}

export function readNavigationType(): NavigationType {
  return nextRouteNavigationType;
}

export function consumeNavigationType(): NavigationType {
  const navigationType = nextRouteNavigationType;
  nextRouteNavigationType = "push";
  if (navigationType !== "pop") knownPopNavigation = false;
  if (navigationType === "pop") recordHistoryEntry(true);
  return navigationType;
}

export { contentRoute, paginationPositions, routeScrollPositions };
