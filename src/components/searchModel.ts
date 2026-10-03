import { sortNewestFirst } from "../content/frontmatter.ts";
import { contentRoute } from "../routes.ts";
import { getEnabledCollectionTypes, getSectionAvailability } from "../sectionAvailability.ts";
import { getMusicSectionLabel } from "../musicSections.ts";
import type { ContentSearchEntry, ContentType, SearchItem, SiteConfig } from "../types.ts";

export type SearchScope = "all" | ContentType;
export type SearchScopeOption = [scope: SearchScope, label: string];

type SearchSectionConfig = Pick<SiteConfig, "showPoems" | "showMusic">;

export function enabledSearchTypes(config: SearchSectionConfig): ContentType[] {
  return getEnabledCollectionTypes(config);
}

export function searchScopeOptions(config: SearchSectionConfig): SearchScopeOption[] {
  const availability = getSectionAvailability(config);
  return [
    ["all", "全部"],
    ["post", "文章"],
    ...(availability.poems ? ([["poem", "小诗"]] as SearchScopeOption[]) : []),
    ...(availability.music ? ([["music", "音乐"]] as SearchScopeOption[]) : []),
  ];
}

export function buildSearchItems(entries: readonly ContentSearchEntry[]): SearchItem[] {
  return entries.map<SearchItem>((entry) => {
    if (entry.type === "post") return { id: `post-${entry.key}`, slug: entry.key, kind: "post", type: "文章", title: entry.title, meta: entry.category, date: entry.date, href: contentRoute("post", entry) };
    if (entry.type === "poem") return { id: `poem-${entry.key}`, slug: entry.key, kind: "poem", type: "小诗", title: entry.title, meta: "", date: entry.date, href: contentRoute("poem", entry) };
    return { id: `music-${entry.key}`, slug: entry.key, kind: "music", type: "音乐", title: entry.title, sourceTitle: entry.sourceTitle !== entry.title ? entry.sourceTitle : undefined, meta: getMusicSectionLabel(entry.section), date: entry.date, href: contentRoute("music", entry) };
  }).sort(sortNewestFirst);
}

export function filterSearchItems(items: readonly SearchItem[], scope: string, query: string): readonly SearchItem[] {
  const scopedItems = scope === "all" ? items : items.filter((item) => item.kind === scope);
  const normalizedQuery = query.trim().toLowerCase();
  return normalizedQuery ? scopedItems.filter((item) => [item.title, item.sourceTitle].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery)) : scopedItems;
}

export function searchScopeStyle(optionCount: number, activeIndex: number): {
  "--search-scope-count": number;
  "--search-scope-offset": string;
} {
  return {
    "--search-scope-count": optionCount,
    "--search-scope-offset": `${Math.max(0, activeIndex) * 100}%`,
  };
}
