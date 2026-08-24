import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AccountDialog } from "./community/AccountDialog.jsx";
import { useCommunity } from "./community/CommunityProvider.jsx";
import { stopArticleAudio } from "./ArticleMusicPlayer.jsx";
import { ArticleOutlinePopover, Header } from "./components/Header.jsx";
import { SearchDialog, SettingsDialog } from "./components/Dialogs.jsx";
import { Footer } from "./components/Footer.jsx";
import { posts } from "./content/index.js";
import { AboutPage } from "./pages/AboutPage.jsx";
import { AdminSetupPage } from "./pages/AdminSetupPage.jsx";
import { ArticlePage } from "./pages/ArticlePage.jsx";
import { FriendsPage } from "./pages/FriendsPage.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { MusicDetailPage, MusicPage } from "./pages/MusicPage.jsx";
import { NotFound } from "./pages/NotFound.jsx";
import { PoemPage } from "./pages/PoemPage.jsx";
import { PoemsPage } from "./pages/PoemsPage.jsx";
import { PostsPage } from "./pages/PostsPage.jsx";
import { GLASS_BACKGROUND_IMAGES, getGlassBackgroundImage, ROUTE_HERO_IMAGES } from "./heroImages.js";
import { getPostOutline } from "./richContent.js";
import { clearArticleIndexState, clearPaginationFamily, markPopNavigation, markPushNavigation, paginationFamily, parseHash, parseHashQuery, readNavigationType, routeScrollPositions } from "./routeState.js";

export function App() {
  const { viewer, openAccount, accountNotice, dismissAccountNotice } = useCommunity();
  const [route, setRoute] = useState(parseHash);
  const [routeQuery, setRouteQuery] = useState(parseHashQuery);
  const routeRef = useRef(route);
  const pendingScrollRef = useRef(0);
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  const [themeChanging, setThemeChanging] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [glassEnabled, setGlassEnabled] = useState(() => localStorage.getItem("fonscape:glass") !== "false");
  const [glassBackgroundImage, setGlassBackgroundImage] = useState(() => getGlassBackgroundImage(route));
  const [menuOpen, setMenuOpen] = useState(false);
  const [articleOutlineOpen, setArticleOutlineOpen] = useState(false);
  const [activeOutlineId, setActiveOutlineId] = useState("");
  const [contentStats, setContentStats] = useState({ post: {}, poem: {}, music: {} });
  const refreshContentStats = useCallback(() => fetch("/api/content/stats", { headers: { Accept: "application/json" } })
    .then((response) => response.ok ? response.json() : Promise.reject())
    .then((result) => setContentStats({
      post: result.stats?.post || {},
      poem: result.stats?.poem || {},
      music: result.stats?.music || {},
    }))
    .catch(() => {}), []);
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
  useEffect(() => { refreshContentStats(); }, [refreshContentStats]);
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
      setRoute(nextRoute);
      setRouteQuery(parseHashQuery());
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
  useEffect(() => {
    document.documentElement.dataset.glass = glassEnabled ? "on" : "off";
    localStorage.setItem("fonscape:glass", String(glassEnabled));
  }, [glassEnabled]);
  useEffect(() => {
    const source = getGlassBackgroundImage(route);
    let cancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = "high";
    image.src = source;
    const commit = () => { if (!cancelled) setGlassBackgroundImage(source); };
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
    let pendingImage = null;
    const initialGlassSource = getGlassBackgroundImage(routeRef.current);
    const pendingSources = [...new Set([
      ...GLASS_BACKGROUND_IMAGES.filter((source) => source !== initialGlassSource),
      ...ROUTE_HERO_IMAGES.slice(1),
    ])];
    const scheduleNext = (delay = 0) => {
      if (cancelled || pendingSources.length === 0) return;
      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(loadNext, { timeout: 1800 });
      } else {
        timerId = window.setTimeout(loadNext, delay || 320);
      }
    };
    const loadNext = () => {
      if (cancelled) return;
      const source = pendingSources.shift();
      if (!source) return;
      const image = new Image();
      pendingImage = image;
      image.decoding = "async";
      image.fetchPriority = "low";
      const finish = () => {
        if (pendingImage === image) pendingImage = null;
        scheduleNext(240);
      };
      image.addEventListener("load", finish, { once: true });
      image.addEventListener("error", finish, { once: true });
      image.src = source;
    };
    const startPreloading = () => scheduleNext(700);
    if (document.readyState === "complete") startPreloading();
    else window.addEventListener("load", startPreloading, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", startPreloading);
      if (idleId !== null) window.cancelIdleCallback?.(idleId);
      if (timerId !== null) window.clearTimeout(timerId);
      if (pendingImage) pendingImage.src = "";
    };
  }, []);
  const isSetupRoute = route === "/admin/setup";
  const isRetiredAdminRoute = route === "/admin" || (route.startsWith("/admin/") && !isSetupRoute);
  useEffect(() => {
    if (isRetiredAdminRoute) window.location.replace("#/");
  }, [isRetiredAdminRoute]);
  const content = useMemo(() => {
    if (route.startsWith("/post/")) return <ArticlePage slug={route.replace("/post/", "")} stats={contentStats.post} onView={recordContentView} />;
    if (route.startsWith("/poem/")) return <PoemPage slug={route.replace("/poem/", "")} stats={contentStats.poem} onView={recordContentView} />;
    if (route.startsWith("/music/")) return <MusicDetailPage path={route.replace("/music/", "")} stats={contentStats.music} onView={recordContentView} />;
    if (route === "/") return <HomePage stats={contentStats.post} />;
    if (route === "/posts") return <PostsPage query={routeQuery} stats={contentStats.post} />;
    if (route === "/poems") return <PoemsPage stats={contentStats.poem} />;
    if (route === "/music") return <MusicPage stats={contentStats.music} />;
    if (route === "/friends") return <FriendsPage />;
    if (route === "/about") return <AboutPage />;
    if (route === "/admin/setup") return <AdminSetupPage />;
    if (isRetiredAdminRoute) return <HomePage stats={contentStats.post} />;
    return <NotFound />;
  }, [route, routeQuery, contentStats, recordContentView, isRetiredAdminRoute]);
  const isDetailRoute = route.startsWith("/post/") || route.startsWith("/poem/") || route.startsWith("/music/");
  const activePost = useMemo(() => route.startsWith("/post/") ? posts.find((post) => post.slug === route.replace("/post/", "")) : null, [route]);
  const activePostOutline = useMemo(() => activePost ? getPostOutline(activePost) : [], [activePost]);
  const hasArticleOutline = activePostOutline.length > 1;
  useEffect(() => {
    setArticleOutlineOpen(false);
    setActiveOutlineId(activePostOutline[0]?.id || "");
  }, [route]);
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
  }, [route, hasArticleOutline]);
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
  return <div className={themeChanging ? "app-shell theme-changing" : "app-shell"} style={{ "--glass-background-image": `url("${glassBackgroundImage}")` }}>
    <span className="global-glass-backdrop" aria-hidden="true" />
    <span className="global-glass-veil" aria-hidden="true" />
    {!isSetupRoute && <Header route={route} theme={theme} menuOpen={menuOpen} onMenu={() => { setArticleOutlineOpen(false); setMenuOpen((value) => !value); }} onTheme={toggleTheme} onSearch={() => setSearchOpen(true)} onSettings={() => setSettingsOpen(true)} viewer={viewer} onAccount={() => openAccount(viewer ? "profile" : "login")} hasArticleOutline={hasArticleOutline} articleOutlineOpen={articleOutlineOpen} onArticleOutline={() => { setMenuOpen(false); setArticleOutlineOpen((value) => !value); }} onCloseArticleOutline={() => setArticleOutlineOpen(false)} />}
    {!isSetupRoute && hasArticleOutline && <ArticleOutlinePopover items={activePostOutline} open={articleOutlineOpen} activeId={activeOutlineId || activePostOutline[0]?.id} onClose={() => setArticleOutlineOpen(false)} onSelect={(item) => { document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); setActiveOutlineId(item.id); setArticleOutlineOpen(false); }} />}
    <div className={isDetailRoute ? "route-view route-view--detail" : "route-view"} key={route}>{content}</div>{!isSetupRoute && <><Footer />{searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} />}{settingsOpen && <SettingsDialog glassEnabled={glassEnabled} onGlassChange={setGlassEnabled} onClose={() => setSettingsOpen(false)} />}<AccountDialog />{accountNotice && <aside className="community-account-notice" role="alert"><div><strong>账户通知</strong><p>{accountNotice}</p></div><button type="button" onClick={dismissAccountNotice}>知道了</button></aside>}</>}
  </div>;
}
