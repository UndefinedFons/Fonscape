import { sortNewestFirst } from "../content/frontmatter.js";
import { contentRoute } from "../routes.js";
import { getEnabledCollectionTypes, getSectionAvailability } from "../sectionAvailability.js";

/**
 * @param {{ showPoems?: boolean, showMusic?: boolean }} config
 */
export function enabledSearchTypes(config) {
  return getEnabledCollectionTypes(config);
}

/**
 * @param {{ showPoems?: boolean, showMusic?: boolean }} config
 */
export function searchScopeOptions(config) {
  const availability = getSectionAvailability(config);
  return [
    ["all", "全部"],
    ["post", "文章"],
    ...(availability.poems ? [["poem", "小诗"]] : []),
    ...(availability.music ? [["music", "音乐"]] : []),
  ];
}

/**
 * @param {Array<Record<string, any>>} entries
 */
export function buildSearchItems(entries) {
  return entries.map((entry) => {
    if (entry.type === "post") return { id: `post-${entry.key}`, slug: entry.key, kind: "post", type: "文章", title: entry.title, meta: entry.category, date: entry.date, href: contentRoute("post", entry) };
    if (entry.type === "poem") return { id: `poem-${entry.key}`, slug: entry.key, kind: "poem", type: "小诗", title: entry.title, meta: "", date: entry.date, href: contentRoute("poem", entry) };
    return { id: `music-${entry.key}`, slug: entry.key, kind: "music", type: "音乐", title: entry.title, meta: entry.kind, date: entry.date, href: contentRoute("music", entry) };
  }).sort(sortNewestFirst);
}

/**
 * @param {Array<Record<string, any>>} items
 * @param {string} scope
 * @param {string} query
 */
export function filterSearchItems(items, scope, query) {
  const scopedItems = scope === "all" ? items : items.filter((item) => item.kind === scope);
  const normalizedQuery = query.trim().toLowerCase();
  return normalizedQuery ? scopedItems.filter((item) => String(item.title).toLowerCase().includes(normalizedQuery)) : scopedItems;
}

/**
 * @param {number} optionCount
 * @param {number} activeIndex
 */
export function searchScopeStyle(optionCount, activeIndex) {
  return {
    "--search-scope-count": optionCount,
    "--search-scope-offset": `${Math.max(0, activeIndex) * 100}%`,
  };
}
