import { normalizeRoutePath } from "./sectionAvailability.js";
import { routeHref } from "./routes.js";

const DETAIL_ROUTE_KINDS = Object.freeze([
  Object.freeze({ kind: "post", detailPrefix: "/post/", listPath: "/posts", label: "文章" }),
  Object.freeze({ kind: "poem", detailPrefix: "/poem/", listPath: "/poems", label: "小诗" }),
  Object.freeze({ kind: "music", detailPrefix: "/music/", listPath: "/music", label: "音乐" }),
]);

/** @type {Readonly<Record<string, string>>} */
const ROUTE_LABELS = Object.freeze({
  "/posts": "文章",
  "/poems": "小诗",
  "/music": "音乐",
  "/friends": "友链",
  "/about": "关于我",
  "/admin/setup": "创建管理员",
});

/**
 * @param {unknown} path
 * @returns {{kind: string, detailPrefix: string, listPath: string, label: string}|null}
 */
export function getDetailRouteKind(path) {
  const route = normalizeRoutePath(path);
  return DETAIL_ROUTE_KINDS.find(({ detailPrefix }) => route.startsWith(detailPrefix)) || null;
}

/**
 * @param {unknown} path
 * @returns {boolean}
 */
export function isDetailRoute(path) {
  return Boolean(getDetailRouteKind(path));
}

/**
 * Resolve the matching collection page for a detail route. Music keeps the
 * detail's section in the query because the music index uses tabs.
 * @param {unknown} path
 * @returns {string}
 */
export function getDetailFallbackRoute(path) {
  const route = normalizeRoutePath(path);
  const detail = getDetailRouteKind(route);
  if (!detail) return routeHref("/");
  if (detail.kind !== "music") return routeHref(detail.listPath);
  const section = route.split("/")[2] || "songs";
  return section === "songs" ? routeHref(detail.listPath) : routeHref(detail.listPath, { section });
}

/**
 * @param {unknown} siteTitle
 * @returns {string}
 */
function normalizeSiteTitle(siteTitle) {
  return String(siteTitle || "").trim() || "Fonscape";
}

/**
 * @param {unknown} label
 * @param {unknown} siteTitle
 * @returns {string}
 */
export function composeDocumentTitle(label, siteTitle) {
  const site = normalizeSiteTitle(siteTitle);
  const page = String(label || "").trim();
  return page && page !== site ? `${page} · ${site}` : site;
}

/**
 * @param {unknown} path
 * @param {unknown} siteTitle
 * @returns {string}
 */
export function getRouteDocumentTitle(path, siteTitle) {
  const route = normalizeRoutePath(path);
  const detail = getDetailRouteKind(route);
  const label = detail?.label || ROUTE_LABELS[route] || (route === "/" ? "" : "页面不存在");
  return composeDocumentTitle(label, siteTitle);
}

/**
 * @param {unknown} label
 * @param {unknown} siteTitle
 */
export function setDocumentTitle(label, siteTitle) {
  if (typeof document !== "undefined") document.title = composeDocumentTitle(label, siteTitle);
}

/**
 * @param {unknown} path
 * @param {unknown} siteTitle
 */
export function setRouteDocumentTitle(path, siteTitle) {
  if (typeof document !== "undefined") document.title = getRouteDocumentTitle(path, siteTitle);
}

/**
 * @param {boolean} reducedMotion
 * @returns {"auto"|"smooth"}
 */
export function getScrollBehavior(reducedMotion) {
  return reducedMotion ? "auto" : "smooth";
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}
