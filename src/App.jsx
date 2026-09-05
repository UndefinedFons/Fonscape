import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useCommunity } from "./community/CommunityProvider.jsx";
import { ArticleOutlinePopover, Header } from "./components/Header.jsx";
import { Footer } from "./components/Footer.jsx";
import { AccountDialog, preloadAccount, preloadDialogs, preloadRouteContent, preloadRouteModule, RouteContent, SearchDialog, SettingsDialog } from "./appRoutes.jsx";
import { getGlassBackground, preloadHeroAssets, PRIMARY_HERO_PATHS } from "./heroImages.js";
import { getScrollBehavior, prefersReducedMotion } from "./navigation.js";
import { parseRoutePath, parseRouteQuery } from "./routeState.js";
import { isSiteRouteEnabled } from "./sectionAvailability.js";
import { isApplicationRoute } from "./routes.js";
import { siteConfig } from "./siteConfig.js";
import { useAppRouting, isRetiredAdminRoute } from "./useAppRouting.js";

export function App() {
  const { viewer, openAccount, accountOpen, accountNotice, dismissAccountNotice } = useCommunity();
  const [route, setRoute] = useState(parseRoutePath);
  const [routeQuery, setRouteQuery] = useState(parseRouteQuery);
  const [menuOpen, setMenuOpen] = useState(false);
  const { routeRef, navigationPending } = useAppRouting({ route, routeQuery, setRoute, setRouteQuery, setMenuOpen });
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  const [themeChanging, setThemeChanging] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountDialogRequested, setAccountDialogRequested] = useState(false);
  const [glassEnabled, setGlassEnabled] = useState(() => localStorage.getItem("fonscape:glass") !== "false");
  const [glassTransition, setGlassTransition] = useState(null);
  const glassTransitionTimerRef = useRef(0);
  const [glassBackground, setGlassBackground] = useState(() => getGlassBackground(route));
  const [articleOutlineOpen, setArticleOutlineOpen] = useState(false);
  const [activeOutlineId, setActiveOutlineId] = useState("");
  const [activePostOutline, setActivePostOutline] = useState([]);
  const [contentStats, setContentStats] = useState({ post: {}, poem: {}, music: {} });
  const requestedStatsRef = useRef(new Set());
  useEffect(() => {
    if (accountOpen) setAccountDialogRequested(true);
  }, [accountOpen]);
  const requestContentStats = useCallback(async (targets) => {
    const pending = [...new Map((targets || []).map((target) => [`${target.type}:${target.slug}`, target])).entries()]
      .filter(([key]) => !requestedStatsRef.current.has(key));
    pending.forEach(([key]) => requestedStatsRef.current.add(key));
    for (let index = 0; index < pending.length; index += 100) {
      const batch = pending.slice(index, index + 100);
      const parameters = new URLSearchParams();
      batch.forEach(([key]) => parameters.append("target", key));
      try {
        const response = await fetch(`/api/content/stats?${parameters}`, { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("stats failed");
        const result = await response.json();
        setContentStats((current) => {
          const next = { ...current };
          for (const [type, entries] of Object.entries(result.stats || {})) next[type] = { ...(next[type] || {}), ...entries };
          return next;
        });
      } catch {
        batch.forEach(([key]) => requestedStatsRef.current.delete(key));
      }
    }
  }, []);
  const recordContentView = useCallback(async (type, slug) => {
    const storageKey = `fonscape:view:${type}:${slug}`;
    if (sessionStorage.getItem(storageKey)) return;
    sessionStorage.setItem(storageKey, "1");
    try {
      const response = await fetch("/api/content/view", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ type, slug }),
      });
      if (!response.ok) throw new Error("view failed");
      const result = await response.json();
      setContentStats((current) => ({
        ...current,
        [type]: {
          ...(current[type] || {}),
          [slug]: { ...(current[type]?.[slug] || {}), views: result.views },
        },
      }));
    } catch {
      sessionStorage.removeItem(storageKey);
    }
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("theme", theme); }, [theme]);
  useLayoutEffect(() => {
    document.documentElement.dataset.glass = glassEnabled ? "on" : "off";
    if (glassTransition) document.documentElement.dataset.glassTransition = glassTransition;
    else delete document.documentElement.dataset.glassTransition;
    localStorage.setItem("fonscape:glass", String(glassEnabled));
  }, [glassEnabled, glassTransition]);
  const handleGlassChange = useCallback((enabled) => {
    window.clearTimeout(glassTransitionTimerRef.current);
    setGlassTransition(enabled ? "on" : "off");
    setGlassEnabled(enabled);
    glassTransitionTimerRef.current = window.setTimeout(() => setGlassTransition(null), 600);
  }, []);
  useEffect(() => () => window.clearTimeout(glassTransitionTimerRef.current), []);
  useEffect(() => {
    let idleId = null;
    let timerId = null;
    const warmFrequentDialogs = () => {
      preloadDialogs();
      preloadAccount();
    };
    if ("requestIdleCallback" in window) idleId = window.requestIdleCallback(warmFrequentDialogs, { timeout: 1800 });
    else timerId = window.setTimeout(warmFrequentDialogs, 700);
    return () => {
      if (idleId !== null) window.cancelIdleCallback?.(idleId);
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, []);
  useEffect(() => {
    const background = getGlassBackground(route);
    const source = background.image;
    let cancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = "high";
    image.src = source;
    const commit = () => { if (!cancelled) setGlassBackground(background); };
    if (typeof image.decode === "function") image.decode().then(commit, commit);
    else if (image.complete) commit();
    else {
      image.addEventListener("load", commit, { once: true });
      image.addEventListener("error", commit, { once: true });
    }
    return () => { cancelled = true; };
  }, [route]);
  useEffect(() => {
    let cancelled = false;
    let idleId = null;
    let timerId = null;
    const compact = window.matchMedia("(max-width:760px)").matches;
    const pendingPaths = PRIMARY_HERO_PATHS.filter((path) => isSiteRouteEnabled(path, siteConfig) && path !== routeRef.current.path);
    const preloadLinkedRoute = (event) => {
      const anchor = event.target.closest?.("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      let url;
      try { url = new URL(href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin || !isApplicationRoute(url.pathname)) return;
      const path = `${url.pathname}${url.search}`;
      if (!isSiteRouteEnabled(path, siteConfig)) return;
      preloadHeroAssets(path, compact);
      preloadRouteModule(path);
      preloadRouteContent(path);
    };
    const scheduleNext = () => {
      if (cancelled || pendingPaths.length === 0) return;
      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(loadNext, { timeout: 2400 });
      } else {
        timerId = window.setTimeout(loadNext, 900);
      }
    };
    const loadNext = () => {
      if (cancelled) return;
      const path = pendingPaths.shift();
      if (path) preloadHeroAssets(path, compact);
      scheduleNext();
    };
    const connection = navigator.connection;
    const shouldDeferAll = !connection?.saveData && !/^(?:slow-)?2g$/u.test(connection?.effectiveType || "");
    if (shouldDeferAll) timerId = window.setTimeout(scheduleNext, 12000);
    document.addEventListener("pointerover", preloadLinkedRoute, { passive: true });
    document.addEventListener("focusin", preloadLinkedRoute);
    document.addEventListener("touchstart", preloadLinkedRoute, { passive: true });
    return () => {
      cancelled = true;
      if (idleId !== null) window.cancelIdleCallback?.(idleId);
      if (timerId !== null) window.clearTimeout(timerId);
      document.removeEventListener("pointerover", preloadLinkedRoute);
      document.removeEventListener("focusin", preloadLinkedRoute);
      document.removeEventListener("touchstart", preloadLinkedRoute);
    };
  }, [routeRef]);
  const isSetupRoute = route === "/admin/setup";
  const isRetiredAdmin = isRetiredAdminRoute(route);
  const routeEnabled = isSiteRouteEnabled(route, siteConfig);
  const isDetailRoute = route.startsWith("/post/") || route.startsWith("/poem/") || route.startsWith("/music/");
  const hasArticleOutline = activePostOutline.length > 1;
  useEffect(() => {
    setArticleOutlineOpen(false);
    setActiveOutlineId("");
  }, [route]);
  useEffect(() => {
    setActiveOutlineId((current) => current && activePostOutline.some((item) => item.id === current) ? current : activePostOutline[0]?.id || "");
  }, [activePostOutline]);
  useEffect(() => {
    if (!hasArticleOutline) return undefined;
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const readingLine = window.scrollY + Math.min(180, window.innerHeight * .28);
        let current = activePostOutline[0]?.id || "";
        for (const item of activePostOutline) {
          const node = document.getElementById(item.id);
          if (node && node.getBoundingClientRect().top + window.scrollY <= readingLine) current = item.id;
        }
        setActiveOutlineId(current);
      });
    };
    update();
    const delayedUpdate = window.setTimeout(update, 500);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.clearTimeout(delayedUpdate);
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [route, hasArticleOutline, activePostOutline]);
  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    flushSync(() => setThemeChanging(true));
    window.requestAnimationFrame(() => {
      document.documentElement.dataset.theme = nextTheme;
      localStorage.setItem("theme", nextTheme);
      setTheme(nextTheme);
      window.setTimeout(() => setThemeChanging(false), 560);
    });
  };
  const requestAccount = useCallback((mode = "login") => {
    setAccountDialogRequested(true);
    openAccount(mode);
  }, [openAccount]);
  return <div className={themeChanging ? "app-shell theme-changing" : "app-shell"} style={{
    "--glass-background-image": `url("${glassBackground.image}")`,
    "--glass-background-filter": glassBackground.needsSoftening ? "blur(14px) saturate(.86)" : "none",
    "--glass-background-transform": glassBackground.needsSoftening ? "scale(1.04)" : "none",
  }}>
    <span className="global-glass-backdrop" aria-hidden="true" />
    <span className="global-glass-veil" aria-hidden="true" />
    {!isSetupRoute && <Header route={route} theme={theme} menuOpen={menuOpen} onMenu={() => { setArticleOutlineOpen(false); setMenuOpen((value) => !value); }} onTheme={toggleTheme} onSearch={() => { preloadDialogs(); setSearchOpen(true); }} onSearchIntent={preloadDialogs} onSettings={() => { preloadDialogs(); setSettingsOpen(true); }} onSettingsIntent={preloadDialogs} viewer={viewer} onAccount={() => requestAccount(viewer ? "profile" : "login")} onAccountIntent={preloadAccount} hasArticleOutline={hasArticleOutline} articleOutlineOpen={articleOutlineOpen} onArticleOutline={() => { setMenuOpen(false); setArticleOutlineOpen((value) => !value); }} onCloseArticleOutline={() => setArticleOutlineOpen(false)} />}
    {!isSetupRoute && hasArticleOutline && <ArticleOutlinePopover items={activePostOutline} open={articleOutlineOpen} activeId={activeOutlineId || activePostOutline[0]?.id} onClose={() => setArticleOutlineOpen(false)} onSelect={(item) => { document.getElementById(item.id)?.scrollIntoView({ behavior: getScrollBehavior(prefersReducedMotion()), block: "start" }); setActiveOutlineId(item.id); setArticleOutlineOpen(false); }} />}
    {navigationPending && <div className="route-loading-indicator" role="status" aria-live="polite"><span />正在打开页面…</div>}
    <div className={isDetailRoute ? "route-view route-view--detail" : "route-view"} key={route}><RouteContent route={route} routeQuery={routeQuery} stats={contentStats} onView={recordContentView} onOutline={setActivePostOutline} onRequestStats={requestContentStats} isRetiredAdminRoute={isRetiredAdmin} routeEnabled={routeEnabled} /></div>{!isSetupRoute && <><Footer />{searchOpen && <Suspense fallback={<DialogLoading label="正在打开搜索…" />}><SearchDialog onClose={() => setSearchOpen(false)} /></Suspense>}{settingsOpen && <Suspense fallback={<DialogLoading label="正在打开设置…" />}><SettingsDialog glassEnabled={glassEnabled} onGlassChange={handleGlassChange} onClose={() => setSettingsOpen(false)} /></Suspense>}{(accountDialogRequested || accountOpen) && <Suspense fallback={<DialogLoading label="正在打开账户…" />}><AccountDialog /></Suspense>}{accountNotice && <aside className="community-account-notice" role="alert"><div><strong>账户通知</strong><p>{accountNotice}</p></div><button type="button" onClick={() => dismissAccountNotice()}>知道了</button></aside>}</>}
  </div>;
}

function DialogLoading({ label }) {
  return <div className="dialog-backdrop dialog-loading-backdrop"><div className="dialog-loading-panel" role="status" aria-live="polite"><span />{label}</div></div>;
}

export { preloadRoute } from "./appRoutes.jsx";
