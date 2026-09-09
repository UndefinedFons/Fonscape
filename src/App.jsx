import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "@phosphor-icons/react/X";
import { flushSync } from "react-dom";
import { useCommunity } from "./community/CommunityProvider.jsx";
import { ArticleOutlinePopover, Header } from "./components/Header.jsx";
import { Footer } from "./components/Footer.jsx";
import { AccountDialog, preloadAccount, preloadDialogs, preloadRouteContent, preloadRouteModule, RouteContent, SearchDialog, SettingsDialog } from "./appRoutes.jsx";
import { getGlassBackground, preloadHeroAssets, PRIMARY_HERO_PATHS } from "./heroImages.js";
import { lockPageScroll } from "./lockPageScroll.js";
import { getScrollBehavior, prefersReducedMotion } from "./navigation.js";
import { parseRoutePath, parseRouteQuery } from "./routeState.js";
import { isSiteRouteEnabled } from "./sectionAvailability.js";
import { isApplicationRoute } from "./routes.js";
import { siteConfig } from "./siteConfig.js";
import { useAppRouting, isRetiredAdminRoute } from "./useAppRouting.js";

const DIALOG_CLOSE_DELAYS = { search: 240, settings: 260, account: 240 };

function DialogSkeleton({ kind, onShown }) {
  useEffect(() => { onShown(); }, [onShown]);
  return <div className={`dialog-skeleton-content dialog-skeleton-content--${kind}`} aria-hidden="true">
      <span className="dialog-skeleton-line dialog-skeleton-line--title" />
      <span className="dialog-skeleton-line dialog-skeleton-line--wide" />
      <span className="dialog-skeleton-line dialog-skeleton-line--medium" />
      <span className="dialog-skeleton-block" />
  </div>;
}

function DialogFrame({ kind, open, onClose, label, children }) {
  const [closing, setClosing] = useState(false);
  const [loadingShown, setLoadingShown] = useState(false);
  const closeTimer = useRef(0);
  const afterClose = useRef(null);
  const accountCloseButton = useRef(null);
  const wasOpen = useRef(open);
  const externalClosePending = wasOpen.current && !open && !closing;
  const visible = open || closing || externalClosePending;
  useLayoutEffect(() => {
    if (open) {
      wasOpen.current = true;
      if (closing) setClosing(false);
      return;
    }
    if (wasOpen.current && !closing) setClosing(true);
    wasOpen.current = false;
  }, [closing, open]);
  useEffect(() => {
    window.clearTimeout(closeTimer.current);
    if (!closing) {
      if (open) afterClose.current = null;
      return undefined;
    }
    const delay = kind === "account" && prefersReducedMotion() ? 0 : DIALOG_CLOSE_DELAYS[kind];
    closeTimer.current = window.setTimeout(() => {
      setClosing(false);
      setLoadingShown(false);
      const callback = afterClose.current;
      afterClose.current = null;
      if (callback) window.requestAnimationFrame(callback);
    }, delay);
    return () => window.clearTimeout(closeTimer.current);
  }, [closing, kind, open]);
  useEffect(() => visible ? lockPageScroll() : undefined, [visible]);
  const requestClose = useCallback((callback) => {
    if (!open || closing) return;
    afterClose.current = typeof callback === "function" ? callback : null;
    setClosing(true);
    onClose();
  }, [closing, onClose, open]);
  const markLoadingShown = useCallback(() => setLoadingShown(true), []);
  useEffect(() => {
    if (!open) return undefined;
    if (kind === "account") accountCloseButton.current?.focus();
    const closeOnEscape = (event) => event.key === "Escape" && requestClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [kind, open, requestClose]);
  if (!visible) return null;
  const account = kind === "account";
  const backdropClass = account
    ? `account-backdrop${closing ? " is-closing" : ""}`
    : `dialog-backdrop ${kind}-backdrop${closing ? " is-closing" : ""}`;
  return <div className={backdropClass} onMouseDown={(event) => event.target === event.currentTarget && requestClose()}>
    <section className={`${kind}-dialog${loadingShown ? " had-loading" : ""}`} role="dialog" aria-modal="true" aria-label={label}>
      {account && <button ref={accountCloseButton} className="account-dialog-close" type="button" aria-label="关闭" onClick={() => requestClose()}><X size={19} /></button>}
      {children(requestClose, markLoadingShown)}
    </section>
  </div>;
}

export function App() {
  const { viewer, openAccount, closeAccount, accountOpen, accountNotice, dismissAccountNotice } = useCommunity();
  const [route, setRoute] = useState(parseRoutePath);
  const [routeQuery, setRouteQuery] = useState(parseRouteQuery);
  const [menuOpen, setMenuOpen] = useState(false);
  const { routeRef } = useAppRouting({ route, routeQuery, setRoute, setRouteQuery, setMenuOpen });
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  const [themeChanging, setThemeChanging] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [glassEnabled, setGlassEnabled] = useState(() => localStorage.getItem("fonscape:glass") !== "false");
  const [glassTransition, setGlassTransition] = useState(null);
  const glassTransitionTimerRef = useRef(0);
  const [glassBackground, setGlassBackground] = useState(() => getGlassBackground(route));
  const [articleOutlineOpen, setArticleOutlineOpen] = useState(false);
  const [activeOutlineId, setActiveOutlineId] = useState("");
  const [activePostOutline, setActivePostOutline] = useState([]);
  const [contentStats, setContentStats] = useState({ post: {}, poem: {}, music: {} });
  const requestedStatsRef = useRef(new Set());
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
    const warmFrequentSurfaces = () => {
      preloadDialogs();
      if (!siteConfig.showCommunity) return;
      if ("requestIdleCallback" in window) idleId = window.requestIdleCallback(() => preloadAccount(), { timeout: 1800 });
      else timerId = window.setTimeout(() => preloadAccount(), 500);
    };
    const connection = navigator.connection;
    if (connection?.saveData || /^(?:slow-)?2g$/u.test(connection?.effectiveType || "")) return undefined;
    if ("requestIdleCallback" in window) idleId = window.requestIdleCallback(warmFrequentSurfaces, { timeout: 1600 });
    else timerId = window.setTimeout(warmFrequentSurfaces, 700);
    return () => {
      if (idleId !== null) window.cancelIdleCallback?.(idleId);
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [routeRef]);
  useEffect(() => {
    const background = getGlassBackground(route);
    setGlassBackground(background);
    preloadHeroAssets(route, window.matchMedia("(max-width:760px)").matches, "high");
  }, [route]);
  useEffect(() => {
    let cancelled = false;
    let idleId = null;
    let timerId = null;
    const compact = window.matchMedia("(max-width:760px)").matches;
    const pendingPaths = PRIMARY_HERO_PATHS.filter((path) => isSiteRouteEnabled(path, siteConfig) && path !== routeRef.current.path);
    let lastIntentAt = 0;
    const preloadLinkedRoute = (event) => {
      const anchor = event.target.closest?.("a[href]");
      if (!anchor) return;
      if (event.type === "pointerover" && event.relatedTarget && anchor.contains(event.relatedTarget)) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      let url;
      try { url = new URL(href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin || !isApplicationRoute(url.pathname)) return;
      const path = `${url.pathname}${url.search}`;
      if (!isSiteRouteEnabled(path, siteConfig)) return;
      lastIntentAt = performance.now();
      const strongIntent = event.type === "pointerdown" || event.type === "touchstart";
      preloadHeroAssets(path, compact, strongIntent ? "high" : "low");
      void preloadRouteModule(path).catch(() => {});
      if (strongIntent) void preloadRouteContent(path);
    };
    const scheduleNext = () => {
      if (cancelled || pendingPaths.length === 0) return;
      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(loadNext, { timeout: 3000 });
      } else {
        timerId = window.setTimeout(loadNext, 900);
      }
    };
    const loadNext = () => {
      if (cancelled) return;
      if (performance.now() - lastIntentAt < 900) {
        scheduleNext();
        return;
      }
      const path = pendingPaths.shift();
      if (!path) return;
      preloadHeroAssets(path, compact, "low");
      scheduleNext();
    };
    const connection = navigator.connection;
    const shouldWarm = !connection?.saveData && !/^(?:slow-)?2g$/u.test(connection?.effectiveType || "");
    if (shouldWarm) scheduleNext();
    document.addEventListener("pointerover", preloadLinkedRoute, { passive: true });
    document.addEventListener("pointerdown", preloadLinkedRoute, { passive: true });
    document.addEventListener("focusin", preloadLinkedRoute);
    if (!("PointerEvent" in window)) document.addEventListener("touchstart", preloadLinkedRoute, { passive: true });
    return () => {
      cancelled = true;
      if (idleId !== null) window.cancelIdleCallback?.(idleId);
      if (timerId !== null) window.clearTimeout(timerId);
      document.removeEventListener("pointerover", preloadLinkedRoute);
      document.removeEventListener("pointerdown", preloadLinkedRoute);
      document.removeEventListener("focusin", preloadLinkedRoute);
      if (!("PointerEvent" in window)) document.removeEventListener("touchstart", preloadLinkedRoute);
    };
  }, [routeRef]);
  const isSetupRoute = siteConfig.showCommunity && route === "/admin/setup";
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
    openAccount(mode);
  }, [openAccount]);
  return <div className={themeChanging ? "app-shell theme-changing" : "app-shell"} style={{
    "--glass-background-image": `url("${glassBackground.image}")${glassBackground.lqip ? `,url("${glassBackground.lqip}")` : ""}`,
    "--glass-background-filter": glassBackground.needsSoftening ? "blur(14px) saturate(.86)" : "none",
    "--glass-background-transform": glassBackground.needsSoftening ? "scale(1.04)" : "none",
  }}>
    <span className="global-glass-backdrop" aria-hidden="true" />
    <span className="global-glass-veil" aria-hidden="true" />
    {!isSetupRoute && <Header route={route} theme={theme} menuOpen={menuOpen} onMenu={() => { setArticleOutlineOpen(false); setMenuOpen((value) => !value); }} onTheme={toggleTheme} onSearch={() => { preloadDialogs(); setSearchOpen(true); }} onSearchIntent={preloadDialogs} onSettings={() => { preloadDialogs(); setSettingsOpen(true); }} onSettingsIntent={preloadDialogs} viewer={viewer} onAccount={() => requestAccount(viewer ? "profile" : "login")} onAccountIntent={preloadAccount} hasArticleOutline={hasArticleOutline} articleOutlineOpen={articleOutlineOpen} onArticleOutline={() => { setMenuOpen(false); setArticleOutlineOpen((value) => !value); }} onCloseArticleOutline={() => setArticleOutlineOpen(false)} />}
    {!isSetupRoute && hasArticleOutline && <ArticleOutlinePopover items={activePostOutline} open={articleOutlineOpen} activeId={activeOutlineId || activePostOutline[0]?.id} onClose={() => setArticleOutlineOpen(false)} onSelect={(item) => { document.getElementById(item.id)?.scrollIntoView({ behavior: getScrollBehavior(prefersReducedMotion()), block: "start" }); setActiveOutlineId(item.id); setArticleOutlineOpen(false); }} />}
    <div className={isDetailRoute ? "route-view route-view--detail" : "route-view"} key={route}><RouteContent route={route} routeQuery={routeQuery} stats={contentStats} onView={recordContentView} onOutline={setActivePostOutline} onRequestStats={requestContentStats} isRetiredAdminRoute={isRetiredAdmin} routeEnabled={routeEnabled} /></div>{!isSetupRoute && <><Footer /><DialogFrame kind="search" open={searchOpen} onClose={() => setSearchOpen(false)} label="搜索博客内容">{(requestClose, markLoadingShown) => <Suspense fallback={<DialogSkeleton kind="search" onShown={markLoadingShown} />}><SearchDialog onClose={requestClose} /></Suspense>}</DialogFrame><DialogFrame kind="settings" open={settingsOpen} onClose={() => setSettingsOpen(false)} label="显示设置">{(requestClose, markLoadingShown) => <Suspense fallback={<DialogSkeleton kind="settings" onShown={markLoadingShown} />}><SettingsDialog glassEnabled={glassEnabled} onGlassChange={handleGlassChange} onClose={requestClose} /></Suspense>}</DialogFrame>{siteConfig.showCommunity && <DialogFrame kind="account" open={accountOpen} onClose={closeAccount} label={viewer ? "个人中心" : "账户登录"}>{(requestClose, markLoadingShown) => <Suspense fallback={<DialogSkeleton kind="account" onShown={markLoadingShown} />}><AccountDialog onClose={requestClose} /></Suspense>}</DialogFrame>}{siteConfig.showCommunity && accountNotice && <aside className="community-account-notice" role="alert"><div><strong>账户通知</strong><p>{accountNotice}</p></div><button type="button" onClick={() => dismissAccountNotice()}>知道了</button></aside>}</>}
  </div>;
}

export { preloadRoute } from "./appRoutes.jsx";
