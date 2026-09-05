import { useEffect, useLayoutEffect, useRef, useTransition } from "react";
import { stopArticleAudio } from "./articleAudio.js";
import {
  clearArticleIndexState,
  clearPaginationFamily,
  consumeKnownPopNavigation,
  consumeDetailSource,
  consumeNavigationType,
  formatRouteLocation,
  go,
  markPopNavigation,
  parseRoutePath,
  parseRouteQuery,
  paginationFamily,
  replaceRouteWithHome,
  rememberDetailSource,
  routeScrollPositions,
} from "./routeState.js";
import { isSiteRouteEnabled } from "./sectionAvailability.js";
import { isApplicationRoute } from "./routes.js";
import { siteConfig } from "./siteConfig.js";
import { setRouteDocumentTitle } from "./navigation.js";

function isRetiredAdminRoute(path) {
  return path === "/admin" || (path.startsWith("/admin/") && path !== "/admin/setup");
}

function sameOriginRoute(anchor) {
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) return null;
  let url;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin || !isApplicationRoute(url.pathname)) return null;
  if (url.hash) return null;
  return `${url.pathname}${url.search}`;
}

/**
 * Own browser history, scroll restoration, and in-app link interception so
 * App.jsx can stay focused on the shell and shared feature state.
 */
export function useAppRouting({ route, routeQuery, setRoute, setRouteQuery, setMenuOpen }) {
  const routeRef = useRef({ path: route, query: routeQuery });
  const pendingScrollRef = useRef(0);
  const [navigationPending, startNavigation] = useTransition();

  useEffect(() => {
    if (isSiteRouteEnabled(route, siteConfig) && !isRetiredAdminRoute(route)) return;
    replaceRouteWithHome();
    routeRef.current = { path: "/", query: "" };
    setRoute("/");
    setRouteQuery("");
  }, [route, setRoute, setRouteQuery]);

  useEffect(() => {
    const previousScrollRestoration = history.scrollRestoration;
    history.scrollRestoration = "manual";

    const processNavigation = () => {
      const previousLocation = formatRouteLocation(routeRef.current.path, routeRef.current.query);
      if (Number.isFinite(window.scrollY)) routeScrollPositions.set(previousLocation, window.scrollY);

      let nextRoute = parseRoutePath();
      let nextQuery = parseRouteQuery();
      const enabled = isSiteRouteEnabled(nextRoute, siteConfig);
      if (!enabled || isRetiredAdminRoute(nextRoute)) {
        nextRoute = "/";
        nextQuery = "";
        replaceRouteWithHome();
      }

      const navigationType = consumeNavigationType();
      consumeDetailSource(nextRoute, { preserveExisting: navigationType === "pop" && consumeKnownPopNavigation() });
      const previousPaginationFamily = paginationFamily(routeRef.current.path);
      const nextPaginationFamily = paginationFamily(nextRoute);
      if (previousPaginationFamily !== nextPaginationFamily) {
        if (previousPaginationFamily) clearPaginationFamily(previousPaginationFamily);
        if (nextPaginationFamily) clearPaginationFamily(nextPaginationFamily);
        if (previousPaginationFamily === "posts" || nextPaginationFamily === "posts") clearArticleIndexState();
      }
      if (routeRef.current.path.startsWith("/post/") && !nextRoute.startsWith("/post/")) stopArticleAudio();

      const nextLocation = formatRouteLocation(nextRoute, nextQuery);
      pendingScrollRef.current = navigationType === "pop" || navigationType === "restore"
        ? (routeScrollPositions.get(nextLocation) || 0)
        : 0;
      routeRef.current = { path: nextRoute, query: nextQuery };
      setRouteDocumentTitle(nextRoute, siteConfig.title);
      startNavigation(() => {
        setRoute(nextRoute);
        setRouteQuery(nextQuery);
      });
      setMenuOpen(false);
    };

    const handleInternalClick = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target.closest?.("a[href]");
      if (!anchor || anchor.target || anchor.hasAttribute("download") || anchor.hasAttribute("data-horizontal-drag")) return;
      const destination = sameOriginRoute(anchor);
      if (!destination) return;
      event.preventDefault();
      const source = formatRouteLocation(parseRoutePath(), parseRouteQuery());
      routeScrollPositions.set(source, window.scrollY);
      rememberDetailSource(destination, source);
      go(destination, { trackSource: false });
    };
    const handlePopState = (event) => {
      markPopNavigation(event);
      processNavigation();
    };
    const handleAppNavigation = () => processNavigation();

    document.addEventListener("click", handleInternalClick);
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("fonscape:navigate", handleAppNavigation);
    return () => {
      document.removeEventListener("click", handleInternalClick);
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("fonscape:navigate", handleAppNavigation);
      history.scrollRestoration = previousScrollRestoration;
    };
  }, [setMenuOpen, setRoute, setRouteQuery, startNavigation]);

  useLayoutEffect(() => {
    const top = pendingScrollRef.current;
    let frame = 0;
    let timeout = 0;
    let attempts = 0;
    let observer = null;
    const minimumAttempts = top > 0 ? 8 : 0;
    const cleanup = () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      observer?.disconnect();
    };
    const restore = () => {
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo({ top: Math.min(top, max), behavior: "instant" });
      attempts += 1;
      if ((top <= max && attempts >= minimumAttempts) || attempts >= 60) cleanup();
      else frame = window.requestAnimationFrame(restore);
    };
    frame = window.requestAnimationFrame(() => {
      if (top > 0 && typeof ResizeObserver === "function") {
        observer = new ResizeObserver(restore);
        observer.observe(document.documentElement);
      }
      restore();
    });
    timeout = window.setTimeout(cleanup, 1500);
    return cleanup;
  }, [route, routeQuery]);

  return { routeRef, pendingScrollRef, navigationPending };
}

export { isRetiredAdminRoute };
