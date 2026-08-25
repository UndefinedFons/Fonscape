import configuredSite from "../fonscape.config.js";

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
  showPoems: configuredSiteInput.showPoems === true,
  showMusic: configuredSiteInput.showMusic === true,
  footer: {
    ...configuredSiteInput.footer,
    themeName: "Fonscape",
    themeRepository: "https://github.com/UndefinedFons/Fonscape",
  },
}));

export const authorProfile = siteConfig.author;

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
