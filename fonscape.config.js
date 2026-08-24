// 这是你的 Fonscape 站点主配置文件。放在 public/ 中的文件从网站根路径引用，
// 例如 public/assets/avatar.webp 对应 /assets/avatar.webp。
// 常见错误：文本或路径漏写引号、字段末尾漏写逗号、括号不成对、资源网址误带 public/，
// 或文件名大小写与仓库不一致。修改后请先运行 pnpm check。
const defaultHeroImage = "/fonscape/hero-white.svg";

const siteConfig = {
  language: "zh-CN",
  title: "我的博客",
  description: "网站简介",
  home: {
    eyebrow: "PERSONAL BLOG",
    title: "我的博客",
    description: "网站简介",
  },
  author: {
    name: "博客作者",
    avatar: "",
    avatarAlt: "博客作者头像",
    tagline: "个人签名",
    introduction: "个人简介",
    interests: [],
    github: {
      label: "",
      url: "",
    },
  },
  about: {
    heroDescription: "关于页简介",
    eyebrow: "HELLO, THIS IS ME",
    greeting: "关于我",
    summary: "个人简介",
    paragraphs: [],
  },
  pages: {
    postsDescription: "文章页简介",
    poemsDescription: "小诗页简介",
    musicDescription: "音乐页简介",
    friendsDescription: "友链页简介",
  },
  footer: {
    owner: "博客作者",
  },
  heroes: {
    home: { image: defaultHeroImage, position: "center", mobilePosition: "center", size: "cover" },
    posts: { image: defaultHeroImage, position: "center", mobilePosition: "center", size: "cover" },
    poems: { image: defaultHeroImage, position: "center", mobilePosition: "center", size: "cover" },
    music: { image: defaultHeroImage, position: "center", mobilePosition: "center", size: "cover" },
    friends: { image: defaultHeroImage, position: "center", mobilePosition: "center", size: "cover" },
    about: { image: defaultHeroImage, position: "center", mobilePosition: "center", size: "cover" },
  },
};

export default siteConfig;
