const parseHash = () => (window.location.hash.slice(1) || "/").split("?")[0];
const parseHashQuery = () => window.location.hash.slice(1).split("?")[1] || "";
const routeScrollPositions = new Map();
const paginationPositions = new Map();
const ARTICLE_INDEX_DEFAULTS = { category: "全部", tag: "", series: "", view: "cards" };
let articleIndexState = { ...ARTICLE_INDEX_DEFAULTS };
let nextRouteNavigationType = "pop";
function paginationFamily(path) {
  if (path === "/posts" || path.startsWith("/post/")) return "posts";
  if (path === "/poems" || path.startsWith("/poem/")) return "poems";
  if (path === "/music" || path.startsWith("/music/")) return "music";
  return null;
}
function clearPaginationFamily(family) {
  for (const key of paginationPositions.keys()) if (key.startsWith(`${family}:`)) paginationPositions.delete(key);
}
function clearArticleIndexState() { articleIndexState = { ...ARTICLE_INDEX_DEFAULTS }; }
function updateArticleIndexState(next) { articleIndexState = { ...next }; }
function go(path) { nextRouteNavigationType = "push"; window.location.hash = path; }
function markPushNavigation() { nextRouteNavigationType = "push"; }
function markPopNavigation() { nextRouteNavigationType = "pop"; }
function readNavigationType() { return nextRouteNavigationType; }

export { ARTICLE_INDEX_DEFAULTS, articleIndexState, clearArticleIndexState, clearPaginationFamily, go, markPopNavigation, markPushNavigation, paginationFamily, paginationPositions, parseHash, parseHashQuery, readNavigationType, routeScrollPositions, updateArticleIndexState };
