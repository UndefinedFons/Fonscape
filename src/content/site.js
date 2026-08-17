const defaultHeroImage = "/assets/hero-white.svg";

export const siteConfig = Object.freeze({
  language: "zh-CN",
  title: "我的博客",
  description: "网站简介",
  home: Object.freeze({
    eyebrow: "PERSONAL BLOG",
    title: "我的博客",
    description: "网站简介",
  }),
  author: Object.freeze({
    name: "博客作者",
    avatar: "",
    avatarAlt: "博客作者头像",
    tagline: "个人签名",
    introduction: "个人简介",
    interests: Object.freeze([]),
    github: Object.freeze({
      label: "",
      url: "",
    }),
  }),
  about: Object.freeze({
    heroDescription: "关于页简介",
    eyebrow: "HELLO, THIS IS ME",
    greeting: "关于我",
    summary: "个人简介",
    paragraphs: Object.freeze([]),
  }),
  pages: Object.freeze({
    postsDescription: "文章页简介",
    poemsDescription: "小诗页简介",
    musicDescription: "音乐页简介",
    friendsDescription: "友链页简介",
  }),
  footer: Object.freeze({
    owner: "博客作者",
    launchedAt: "2026-08-15T23:54:42+08:00",
    themeName: "Fonscape",
    themeRepository: "https://github.com/UndefinedFons/Fonscape",
  }),
  heroes: Object.freeze(Object.fromEntries(
    ["home", "posts", "poems", "music", "friends", "about"].map((variant) => [variant, Object.freeze({
      image: defaultHeroImage,
      glassImage: defaultHeroImage,
      position: "center",
      mobilePosition: "center",
      size: "cover",
    })]),
  )),
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

// Accepted friend links are maintained here. Each entry supports:
// { name, url, description, owner, avatar, avatarUserId, color }
export const friendLinks = [];
