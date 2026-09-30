import { normalizeRoutePath } from "./sectionAvailability.ts";
import { routeHref } from "./routes.ts";

type DetailRouteKind = {
  kind: "post" | "poem" | "music";
  detailPrefix: string;
  listPath: string;
  label: string;
};

const DETAIL_ROUTE_KINDS: readonly DetailRouteKind[] = Object.freeze([
  Object.freeze({ kind: "post", detailPrefix: "/post/", listPath: "/posts", label: "文章" }),
  Object.freeze({ kind: "poem", detailPrefix: "/poem/", listPath: "/poems", label: "小诗" }),
  Object.freeze({ kind: "music", detailPrefix: "/music/", listPath: "/music", label: "音乐" }),
]);

const ROUTE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "/posts": "文章",
  "/poems": "小诗",
  "/music": "音乐",
  "/friends": "友链",
  "/about": "关于我",
  "/admin/setup": "创建管理员",
});

export function getDetailRouteKind(path: unknown): DetailRouteKind | null {
  const route = normalizeRoutePath(path);
  return DETAIL_ROUTE_KINDS.find(({ detailPrefix }) => route.startsWith(detailPrefix)) || null;
}

export function isDetailRoute(path: unknown): boolean {
  return Boolean(getDetailRouteKind(path));
}

/**
 * Resolve the matching collection page for a detail route. Music keeps the
 * detail's section in the query because the music index uses tabs.
 */
export function getDetailFallbackRoute(path: unknown): string {
  const route = normalizeRoutePath(path);
  const detail = getDetailRouteKind(route);
  if (!detail) return routeHref("/");
  if (detail.kind !== "music") return routeHref(detail.listPath);
  const section = route.split("/")[2] || "songs";
  return section === "songs" ? routeHref(detail.listPath) : routeHref(detail.listPath, { section });
}

function normalizeSiteTitle(siteTitle: unknown): string {
  return String(siteTitle || "").trim() || "Fonscape";
}

export function composeDocumentTitle(label: unknown, siteTitle: unknown): string {
  const site = normalizeSiteTitle(siteTitle);
  const page = String(label || "").trim();
  return page && page !== site ? `${page} · ${site}` : site;
}

export function getRouteDocumentTitle(path: unknown, siteTitle: unknown): string {
  const route = normalizeRoutePath(path);
  const detail = getDetailRouteKind(route);
  const label = detail?.label || ROUTE_LABELS[route] || (route === "/" ? "" : "页面不存在");
  return composeDocumentTitle(label, siteTitle);
}

export function setDocumentTitle(label: unknown, siteTitle: unknown): void {
  if (typeof document !== "undefined") document.title = composeDocumentTitle(label, siteTitle);
}

export function setRouteDocumentTitle(path: unknown, siteTitle: unknown): void {
  if (typeof document !== "undefined") document.title = getRouteDocumentTitle(path, siteTitle);
}

export function getScrollBehavior(reducedMotion: boolean): "auto" | "smooth" {
  return reducedMotion ? "auto" : "smooth";
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}
