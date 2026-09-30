import configuredSite from "../fonscape.config.js";
import type { SiteConfig } from "./types.ts";
import { isSiteRouteEnabled as isConfiguredSiteRouteEnabled } from "./sectionAvailability.ts";

export const DEFAULT_POST_CATEGORIES = Object.freeze(["随笔", "评谈", "记录", "笔记", "指南"]);

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizePostCategories(value: unknown): string[] {
  const source = value === undefined ? DEFAULT_POST_CATEGORIES : value;
  if (!Array.isArray(source)) return [...DEFAULT_POST_CATEGORIES];
  const seen = new Set<string>();
  return (source as unknown[]).reduce<string[]>((categories, item) => {
    if (typeof item !== "string") return categories;
    const category = item.trim();
    if (!category || category === "全部" || seen.has(category)) return categories;
    seen.add(category);
    categories.push(category);
    return categories;
  }, []);
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function freezeConfig<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value as Record<string, unknown>).forEach(freezeConfig);
  return Object.freeze(value);
}

const configuredSiteInput: SiteConfig = configuredSite;

export const siteConfig: Readonly<SiteConfig> = freezeConfig({
  ...configuredSiteInput,
  postCategories: normalizePostCategories(configuredSiteInput.postCategories),
  showPoems: configuredSiteInput.showPoems === true,
  showMusic: configuredSiteInput.showMusic === true,
  showCommunity: configuredSiteInput.showCommunity !== false,
  footer: {
    ...configuredSiteInput.footer,
    themeName: "Fonscape",
    themeRepository: "https://github.com/UndefinedFons/Fonscape",
  },
});

export const authorProfile = siteConfig.author;

/**
 */
export function getPostCategories(config: Partial<SiteConfig> = siteConfig): string[] {
  return ["全部", ...normalizePostCategories(config.postCategories)];
}

type NavItem = [path: string, label: string];

const allNavItems: NavItem[] = [
  ["/", "首页"],
  ["/posts", "文章"],
  ["/poems", "小诗"],
  ["/music", "音乐"],
  ["/friends", "友链"],
  ["/about", "关于"],
];

/**
 */
export function isSiteRouteEnabled(path: string, config: Partial<SiteConfig> = siteConfig): boolean {
  return isConfiguredSiteRouteEnabled(path, config);
}

/**
 */
export function getNavItems(config: Partial<SiteConfig> = siteConfig): NavItem[] {
  return allNavItems.filter(([path]) => isSiteRouteEnabled(path, config));
}

export const navItems = getNavItems();
