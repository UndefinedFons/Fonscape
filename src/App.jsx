import { lazy, startTransition, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useCommunity } from "./community/CommunityProvider.jsx";
import { stopArticleAudio } from "./articleAudio.js";
import { ArticleOutlinePopover, Header } from "./components/Header.jsx";
import { Footer } from "./components/Footer.jsx";
import { loadCollection, loadMusicReview, loadPoem, loadPost } from "./content/index.js";
import { HomePage } from "./pages/HomePage.jsx";
import { NotFound } from "./pages/NotFound.jsx";
import { getGlassBackground, preloadHeroAssets, PRIMARY_HERO_PATHS } from "./heroImages.js";
import { clearArticleIndexState, clearPaginationFamily, markPopNavigation, markPushNavigation, paginationFamily, parseHash, parseHashQuery, readNavigationType, routeScrollPositions } from "./routeState.js";
import { ensureFullResponsiveImages } from "./responsiveImages.ts";

const withFullFonts = (loader) => Promise.all([loader(), ensureFullFontStylesheet()]).then(([module]) => module);
const withFullAssets = (loader) => Promise.all([loader(), ensureFullFontStylesheet(), ensureFullResponsiveImages()]).then(([module]) => module);
const loadAboutModule = () => withFullAssets(() => import("./pages/AboutPage.jsx"));
const loadAdminSetupModule = () => withFullFonts(() => import("./pages/AdminSetupPage.jsx"));
const loadRichArticleModule = () => import("./RichArticleContent.jsx");
const loadArticleModule = () => Promise.all([import("./pages/ArticlePage.jsx"), loadRichArticleModule(), ensureFullFontStylesheet(), ensureFullResponsiveImages()]).then(([module]) => module);
const loadDialogsModule = () => withFullFonts(() => import("./components/Dialogs.jsx"));
const loadFriendsModule = () => withFullAssets(() => import("./pages/FriendsPage.jsx"));
const loadMusicModule = () => withFullAssets(() => import("./pages/MusicPage.jsx"));
const loadMusicDetailModule = () => Promise.all([loadMusicModule(), loadRichArticleModule(), ensureFullFontStylesheet()]).then(([module]) => module);
const loadPoemModule = () => Promise.all([import("./pages/PoemPage.jsx"), ensureFullFontStylesheet(), ensureFullResponsiveImages()]).then(([module]) => module);
const loadPoemsModule = () => withFullAssets(() => import("./pages/PoemsPage.jsx"));
const loadPostsModule = () => withFullAssets(() => import("./pages/PostsPage.jsx"));
const loadAccountModule = () => withFullFonts(() => import("./community/AccountDialog.jsx"));

const AboutPage = lazy(() => loadAboutModule().then((module) => ({ default: module.AboutPage })));
const AdminSetupPage = lazy(() => loadAdminSetupModule().then((module) => ({ default: module.AdminSetupPage })));
const ArticlePage = lazy(() => loadArticleModule().then((module) => ({ default: module.ArticlePage })));
const SearchDialog = lazy(() => loadDialogsModule().then((module) => ({ default: module.SearchDialog })));
const SettingsDialog = lazy(() => loadDialogsModule().then((module) => ({ default: module.SettingsDialog })));
const FriendsPage = lazy(() => loadFriendsModule().then((module) => ({ default: module.FriendsPage })));
const MusicPage = lazy(() => loadMusicModule().then((module) => ({ default: module.MusicPage })));
const MusicDetailPage = lazy(() => loadMusicDetailModule().then((module) => ({ default: module.MusicDetailPage })));
const PoemPage = lazy(() => loadPoemModule().then((module) => ({ default: module.PoemPage })));
const PoemsPage = lazy(() => loadPoemsModule().then((module) => ({ default: module.PoemsPage })));
const PostsPage = lazy(() => loadPostsModule().then((module) => ({ default: module.PostsPage })));
const AccountDialog = lazy(() => loadAccountModule().then((module) => ({ default: module.AccountDialog })));

const prefetchedRouteModules = new Set();

let fullFontStylesheetReady;
function ensureFullFontStylesheet() {
  if (typeof document === "undefined") return Promise.resolve();
  if (fullFontStylesheetReady) return fullFontStylesheetReady;
  const existing = document.querySelector('link[rel="stylesheet"][href="/fonscape/google-fonts-full.css"]');
  if (existing?.sheet && existing.media !== "print") return Promise.resolve();
  fullFontStylesheetReady = new Promise((resolve) => {
    const stylesheet = existing || Object.assign(document.createElement("link"), { rel: "stylesheet", href: "/fonscape/google-fonts-full.css" });
    const finish = () => {
      stylesheet.media = "all";
      resolve();
    };
    stylesheet.addEventListener("load", finish, { once: true });
    stylesheet.addEventListener("error", finish, { once: true });
    if (existing?.sheet) finish();
    else if (!existing) document.head.append(stylesheet);
  });
  return fullFontStylesheetReady;
}

function routeModuleLoader(path) {
  const routePath = String(path || "/").split("?")[0];
  if (routePath.startsWith("/post/")) return loadArticleModule;
  if (routePath.startsWith("/poem/")) return loadPoemModule;
  if (routePath.startsWith("/music/")) return loadMusicDetailModule;
  if (routePath === "/music") return loadMusicModule;
  if (routePath === "/posts") return loadPostsModule;
  if (routePath === "/poems") return loadPoemsModule;
  if (routePath === "/friends") return loadFriendsModule;
  if (routePath === "/about") return loadAboutModule;
  if (routePath === "/admin/setup") return loadAdminSetupModule;
  return null;
}

function preloadRouteModule(path) {
  const loader = routeModuleLoader(path);
  if (!loader || prefetchedRouteModules.has(loader)) return;
  prefetchedRouteModules.add(loader);
  loader().catch(() => prefetchedRouteModules.delete(loader));
}

function preloadRouteContent(path) {
  const routePath = String(path || "/").split("?")[0];
  const decode = (value) => {
    try { return decodeURIComponent(value); } catch { return value; }
  };
  if (routePath.startsWith("/post/")) {
    return loadPost(decode(routePath.slice("/post/".length))).catch(() => null);
  }
  if (routePath.startsWith("/poem/")) {
    return loadPoem(decode(routePath.slice("/poem/".length))).catch(() => null);
  }
  if (routePath.startsWith("/music/")) {
    const [, section, slug] = routePath.split("/");
    if (section && slug) return loadMusicReview(decode(section), decode(slug)).catch(() => null);
  }
  if (routePath === "/posts") return loadCollection("post").catch(() => null);
  if (routePath === "/poems") return loadCollection("poem").catch(() => null);
  if (routePath === "/music") return loadCollection("music").catch(() => null);
  return Promise.resolve(null);
}

export function preloadRoute(path) {
  const loader = routeModuleLoader(path);
  return Promise.all([loader ? loader() : null, preloadRouteContent(path)]);
}

export function App() {
  const { viewer, openAccount, accountOpen, accountNotice, dismissAccountNotice } = useCommunity();
  const [route, setRoute] = useState(parseHash);
  const [routeQuery, setRouteQuery] = useState(parseHashQuery);
  const routeRef = useRef(route);
  const pendingScrollRef = useRef(0);
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  const [themeChanging, setThemeChanging] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountDialogRequested, setAccountDialogRequested] = useState(false);
  const [glassEnabled, setGlassEnabled] = useState(() => localStorage.getItem("fonscape:glass") !== "false");
  const [glassTransition, setGlassTransition] = useState(null);
  const glassTransitionTimerRef = useRef(0);
  const [glassBackground, setGlassBackground] = useState(() => getGlassBackground(route));
  const [menuOpen, setMenuOpen] = useState(false);
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
  useEffect(() => {
    const previousScrollRestoration = history.scrollRestoration;
    history.scrollRestoration = "manual";
    const markLinkNavigation = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target.closest?.('a[href^="#/"]');
      if (anchor?.hasAttribute("data-horizontal-drag")) return;
      if (anchor && !anchor.target) {
        markPushNavigation();
      }
    };
    const onHash = () => {
      routeScrollPositions.set(routeRef.current, window.scrollY);
      const nextRoute = parseHash();
      const previousPaginationFamily = paginationFamily(routeRef.current);
      const nextPaginationFamily = paginationFamily(nextRoute);
      if (previousPaginationFamily !== nextPaginationFamily) {
        // Crossing between content families starts the destination listing fresh.
        // List -> detail -> list stays inside one family, so browser/back navigation
        // still restores the page the reader came from.
        if (previousPaginationFamily) clearPaginationFamily(previousPaginationFamily);
        if (nextPaginationFamily) clearPaginationFamily(nextPaginationFamily);
        if (previousPaginationFamily === "posts" || nextPaginationFamily === "posts") clearArticleIndexState();
      }
      if (routeRef.current.startsWith("/post/") && !nextRoute.startsWith("/post/")) stopArticleAudio();
      pendingScrollRef.current = readNavigationType() === "pop" ? (routeScrollPositions.get(nextRoute) || 0) : 0;
      markPopNavigation();
      routeRef.current = nextRoute;
      startTransition(() => {
        setRoute(nextRoute);
        setRouteQuery(parseHashQuery());
      });
      setMenuOpen(false);
    };
    document.addEventListener("click", markLinkNavigation, true);
    window.addEventListener("hashchange", onHash);
    return () => {
      document.removeEventListener("click", markLinkNavigation, true);
      window.removeEventListener("hashchange", onHash);
      history.scrollRestoration = previousScrollRestoration;
    };
  }, []);
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
      else {
        frame = window.requestAnimationFrame(restore);
      }
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
  }, [route]);
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
    const pendingPaths = PRIMARY_HERO_PATHS.filter((path) => path !== routeRef.current);
    const preloadLinkedRoute = (event) => {
      const anchor = event.target.closest?.('a[href^="#/"]');
      if (!anchor) return;
      const path = anchor.getAttribute("href")?.slice(1);
      if (!path) return;
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
  }, []);
  const isSetupRoute = route === "/admin/setup";
  const isRetiredAdminRoute = route === "/admin" || (route.startsWith("/admin/") && !isSetupRoute);
  useEffect(() => {
    if (isRetiredAdminRoute) window.location.replace("#/");
  }, [isRetiredAdminRoute]);
  const content = useMemo(() => {
    if (route.startsWith("/post/")) return <ArticlePage slug={route.replace("/post/", "")} stats={contentStats.post || {}} onView={recordContentView} onOutline={setActivePostOutline} onStatsTargets={requestContentStats} />;
    if (route.startsWith("/poem/")) return <PoemPage slug={route.replace("/poem/", "")} stats={contentStats.poem || {}} onView={recordContentView} onStatsTargets={requestContentStats} />;
    if (route.startsWith("/music/")) return <MusicDetailPage path={route.replace("/music/", "")} stats={contentStats.music || {}} onView={recordContentView} onStatsTargets={requestContentStats} />;
    if (route === "/") return <HomePage stats={contentStats.post || {}} onStatsTargets={requestContentStats} />;
    if (route === "/posts") return <PostsPage query={routeQuery} stats={contentStats.post || {}} onStatsTargets={requestContentStats} />;
    if (route === "/poems") return <PoemsPage stats={contentStats.poem || {}} onStatsTargets={requestContentStats} />;
    if (route === "/music") return <MusicPage stats={contentStats.music || {}} onStatsTargets={requestContentStats} />;
    if (route === "/friends") return <FriendsPage />;
    if (route === "/about") return <AboutPage />;
    if (route === "/admin/setup") return <AdminSetupPage />;
    if (isRetiredAdminRoute) return <HomePage stats={contentStats.post} />;
    return <NotFound />;
  }, [route, routeQuery, contentStats, recordContentView, requestContentStats, isRetiredAdminRoute]);
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
  const preloadDialogs = useCallback(() => {
    loadDialogsModule().catch(() => {});
  }, []);
  const preloadAccount = useCallback(() => {
    loadAccountModule().catch(() => {});
  }, []);
  return <div className={themeChanging ? "app-shell theme-changing" : "app-shell"} style={{
    "--glass-background-image": `url("${glassBackground.image}")`,
    "--glass-background-filter": glassBackground.needsSoftening ? "blur(14px) saturate(.86)" : "none",
    "--glass-background-transform": glassBackground.needsSoftening ? "scale(1.04)" : "none",
  }}>
    <span className="global-glass-backdrop" aria-hidden="true" />
    <span className="global-glass-veil" aria-hidden="true" />
    {!isSetupRoute && <Header route={route} theme={theme} menuOpen={menuOpen} onMenu={() => { setArticleOutlineOpen(false); setMenuOpen((value) => !value); }} onTheme={toggleTheme} onSearch={() => { preloadDialogs(); setSearchOpen(true); }} onSearchIntent={preloadDialogs} onSettings={() => { preloadDialogs(); setSettingsOpen(true); }} onSettingsIntent={preloadDialogs} viewer={viewer} onAccount={() => requestAccount(viewer ? "profile" : "login")} onAccountIntent={preloadAccount} hasArticleOutline={hasArticleOutline} articleOutlineOpen={articleOutlineOpen} onArticleOutline={() => { setMenuOpen(false); setArticleOutlineOpen((value) => !value); }} onCloseArticleOutline={() => setArticleOutlineOpen(false)} />}
    {!isSetupRoute && hasArticleOutline && <ArticleOutlinePopover items={activePostOutline} open={articleOutlineOpen} activeId={activeOutlineId || activePostOutline[0]?.id} onClose={() => setArticleOutlineOpen(false)} onSelect={(item) => { document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); setActiveOutlineId(item.id); setArticleOutlineOpen(false); }} />}
    <div className={isDetailRoute ? "route-view route-view--detail" : "route-view"} key={route}>{content}</div>{!isSetupRoute && <><Footer />{searchOpen && <Suspense fallback={null}><SearchDialog onClose={() => setSearchOpen(false)} /></Suspense>}{settingsOpen && <Suspense fallback={null}><SettingsDialog glassEnabled={glassEnabled} onGlassChange={handleGlassChange} onClose={() => setSettingsOpen(false)} /></Suspense>}{(accountDialogRequested || accountOpen) && <Suspense fallback={null}><AccountDialog /></Suspense>}{accountNotice && <aside className="community-account-notice" role="alert"><div><strong>账户通知</strong><p>{accountNotice}</p></div><button type="button" onClick={dismissAccountNotice}>知道了</button></aside>}</>}
  </div>;
}
