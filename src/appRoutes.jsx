import { lazy } from "react";
import { loadCollection, loadMusicReview, loadPoem, loadPost, siteConfig } from "./content/index.js";
import { ensureFullResponsiveImages } from "./responsiveImages.ts";
import { replaceRouteWithHome } from "./routeState.js";
import { setRouteDocumentTitle } from "./navigation.js";
import { isSiteRouteEnabled, normalizeRoutePath } from "./sectionAvailability.js";
import { HomePage } from "./pages/HomePage.jsx";
import { NotFound } from "./pages/NotFound.jsx";

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

export const AboutPage = lazy(() => loadAboutModule().then((module) => ({ default: module.AboutPage })));
export const AdminSetupPage = lazy(() => loadAdminSetupModule().then((module) => ({ default: module.AdminSetupPage })));
export const ArticlePage = lazy(() => loadArticleModule().then((module) => ({ default: module.ArticlePage })));
export const SearchDialog = lazy(() => loadDialogsModule().then((module) => ({ default: module.SearchDialog })));
export const SettingsDialog = lazy(() => loadDialogsModule().then((module) => ({ default: module.SettingsDialog })));
export const FriendsPage = lazy(() => loadFriendsModule().then((module) => ({ default: module.FriendsPage })));
export const MusicPage = lazy(() => loadMusicModule().then((module) => ({ default: module.MusicPage })));
export const MusicDetailPage = lazy(() => loadMusicDetailModule().then((module) => ({ default: module.MusicDetailPage })));
export const PoemPage = lazy(() => loadPoemModule().then((module) => ({ default: module.PoemPage })));
export const PoemsPage = lazy(() => loadPoemsModule().then((module) => ({ default: module.PoemsPage })));
export const PostsPage = lazy(() => loadPostsModule().then((module) => ({ default: module.PostsPage })));
export const AccountDialog = lazy(() => loadAccountModule().then((module) => ({ default: module.AccountDialog })));

export function preloadDialogs() {
  return loadDialogsModule().catch(() => {});
}

export function preloadAccount() {
  return loadAccountModule().catch(() => {});
}

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

/** @param {string} path */
export function routeModuleLoader(path) {
  const routePath = normalizeRoutePath(path);
  if (!isSiteRouteEnabled(routePath, siteConfig)) return null;
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

/** @param {string} path */
export function preloadRouteModule(path) {
  const loader = routeModuleLoader(path);
  if (!loader || prefetchedRouteModules.has(loader)) return;
  prefetchedRouteModules.add(loader);
  loader().catch(() => prefetchedRouteModules.delete(loader));
}

/** @param {unknown} value */
export function decodeRoutePath(value) {
  return String(value ?? "").split("/").map((segment) => {
    try { return decodeURIComponent(segment); } catch { return segment; }
  }).join("/");
}

/** @param {string} path */
export function preloadRouteContent(path) {
  const routePath = normalizeRoutePath(path);
  if (!isSiteRouteEnabled(routePath, siteConfig)) return Promise.resolve(null);
  if (routePath.startsWith("/post/")) return loadPost(decodeRoutePath(routePath.slice("/post/".length))).catch(() => null);
  if (routePath.startsWith("/poem/")) return loadPoem(decodeRoutePath(routePath.slice("/poem/".length))).catch(() => null);
  if (routePath.startsWith("/music/")) {
    const [, section, ...slugParts] = routePath.split("/");
    if (section && slugParts.length) return loadMusicReview(decodeRoutePath(section), decodeRoutePath(slugParts.join("/"))).catch(() => null);
  }
  if (routePath === "/posts") return loadCollection("post").catch(() => null);
  if (routePath === "/poems") return loadCollection("poem").catch(() => null);
  if (routePath === "/music") return loadCollection("music").catch(() => null);
  return Promise.resolve(null);
}

/** @param {string} path */
export function preloadRoute(path) {
  const routePath = normalizeRoutePath(path);
  if (!isSiteRouteEnabled(routePath, siteConfig)) {
    replaceRouteWithHome();
    setRouteDocumentTitle("/", siteConfig.title);
    return Promise.resolve([null, null]);
  }
  setRouteDocumentTitle(routePath, siteConfig.title);
  const loader = routeModuleLoader(path);
  return Promise.all([loader ? loader() : null, preloadRouteContent(path)]);
}

/**
 * Render the route selected by the canonical pathname state. Lazy route
 * modules remain behind the app's existing Suspense boundary.
 */
export function RouteContent({ route, routeQuery, stats, onView, onOutline, onRequestStats, isRetiredAdminRoute, routeEnabled }) {
  if (!routeEnabled || isRetiredAdminRoute) return <HomePage stats={stats.post || {}} onStatsTargets={onRequestStats} />;
  if (route.startsWith("/post/")) return <ArticlePage slug={decodeRoutePath(route.slice("/post/".length))} stats={stats.post || {}} onView={onView} onOutline={onOutline} onStatsTargets={onRequestStats} />;
  if (route.startsWith("/poem/")) return <PoemPage slug={decodeRoutePath(route.slice("/poem/".length))} stats={stats.poem || {}} onView={onView} onStatsTargets={onRequestStats} />;
  if (route.startsWith("/music/")) return <MusicDetailPage path={decodeRoutePath(route.slice("/music/".length))} stats={stats.music || {}} onView={onView} onStatsTargets={onRequestStats} />;
  if (route === "/") return <HomePage stats={stats.post || {}} onStatsTargets={onRequestStats} />;
  if (route === "/posts") return <PostsPage query={routeQuery} stats={stats.post || {}} onStatsTargets={onRequestStats} />;
  if (route === "/poems") return <PoemsPage stats={stats.poem || {}} onStatsTargets={onRequestStats} />;
  if (route === "/music") return <MusicPage stats={stats.music || {}} onStatsTargets={onRequestStats} />;
  if (route === "/friends") return <FriendsPage />;
  if (route === "/about") return <AboutPage />;
  if (route === "/admin/setup") return <AdminSetupPage />;
  return <NotFound />;
}

/** @param {string} path */
export function isDetailPath(path) {
  const route = normalizeRoutePath(path);
  return route.startsWith("/post/") || route.startsWith("/poem/") || route.startsWith("/music/");
}
