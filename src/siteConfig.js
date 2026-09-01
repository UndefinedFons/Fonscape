import configuredSite from "../fonscape.config.js";

export const DEFAULT_POST_CATEGORIES = Object.freeze(["随笔", "评谈", "记录", "笔记", "指南"]);

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizePostCategories(value) {
  const source = value === undefined ? DEFAULT_POST_CATEGORIES : value;
  if (!Array.isArray(source)) return [...DEFAULT_POST_CATEGORIES];
  const seen = new Set();
  return source.reduce((categories, item) => {
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
function freezeConfig(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeConfig);
  return Object.freeze(value);
}

/** @type {import("./types.js").SiteConfig} */
const configuredSiteInput = configuredSite;

/** @type {Readonly<import("./types.js").SiteConfig>} */
export const siteConfig = /** @type {Readonly<import("./types.js").SiteConfig>} */ (freezeConfig({
  ...configuredSiteInput,
  postCategories: normalizePostCategories(configuredSiteInput.postCategories),
  showPoems: configuredSiteInput.showPoems === true,
  showMusic: configuredSiteInput.showMusic === true,
  footer: {
    ...configuredSiteInput.footer,
    themeName: "Fonscape",
    themeRepository: "https://github.com/UndefinedFons/Fonscape",
  },
}));

export const authorProfile = siteConfig.author;

/**
 * @param {Partial<import("./types.js").SiteConfig>} [config]
 * @returns {string[]}
 */
export function getPostCategories(config = siteConfig) {
  return ["全部", ...normalizePostCategories(config.postCategories)];
}

/** @type {Array<[string, string]>} */
const allNavItems = [
  ["/", "首页"],
  ["/posts", "文章"],
  ["/poems", "小诗"],
  ["/music", "音乐"],
  ["/friends", "友链"],
  ["/about", "关于"],
];

/**
 * @param {Partial<import("./types.js").SiteConfig>} [config]
 * @returns {Array<[string, string]>}
 */
export function getNavItems(config = siteConfig) {
  return allNavItems.filter(([path]) => (
    (path !== "/poems" || config.showPoems === true)
    && (path !== "/music" || config.showMusic === true)
  ));
}

export const navItems = getNavItems();
