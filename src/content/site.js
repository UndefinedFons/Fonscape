import configuredSite from "../../fonscape.config.js";

function freezeConfig(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeConfig);
  return Object.freeze(value);
}

export const siteConfig = freezeConfig({
  ...configuredSite,
  footer: {
    ...configuredSite.footer,
    themeName: "Fonscape",
    themeRepository: "https://github.com/UndefinedFons/Fonscape",
  },
});

export const authorProfile = siteConfig.author;

export const navItems = [
  ["/", "首页"],
  ["/posts", "文章"],
  ["/poems", "小诗"],
  ["/music", "音乐"],
  ["/friends", "友链"],
  ["/about", "关于"],
];

// Compatibility export for sites upgrading from Fonscape 1.0.0. New sites
// maintain accepted friend links in friends.json instead.
export const friendLinks = [];
