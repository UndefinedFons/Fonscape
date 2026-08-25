import configuredSite from "../fonscape.config.js";

function freezeConfig(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeConfig);
  return Object.freeze(value);
}

export const siteConfig = freezeConfig({
  ...configuredSite,
  showPoems: configuredSite.showPoems === true,
  showMusic: configuredSite.showMusic === true,
  footer: {
    ...configuredSite.footer,
    themeName: "Fonscape",
    themeRepository: "https://github.com/UndefinedFons/Fonscape",
  },
});

export const authorProfile = siteConfig.author;

const allNavItems = [
  ["/", "首页"],
  ["/posts", "文章"],
  ["/poems", "小诗"],
  ["/music", "音乐"],
  ["/friends", "友链"],
  ["/about", "关于"],
];

export function getNavItems(config = siteConfig) {
  return allNavItems.filter(([path]) => (
    (path !== "/poems" || config.showPoems === true)
    && (path !== "/music" || config.showMusic === true)
  ));
}

export const navItems = getNavItems();
