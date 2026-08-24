// 这是你的 Fonscape 站点主配置文件。放在 public/ 中的文件从网站根路径引用，
// 例如 public/assets/avatar.webp 对应 /assets/avatar.webp。
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
    // 自定义图片请保留引号并填写网站路径，例如 "/assets/home.jpg"。
    // 图片文件放在 public/assets/，但这里不要写成 public/assets/...。
    home: { image: defaultHeroImage, position: "center", mobilePosition: "center", size: "cover" },
    posts: { image: defaultHeroImage, position: "center", mobilePosition: "center", size: "cover" },
    poems: { image: defaultHeroImage, position: "center", mobilePosition: "center", size: "cover" },
    music: { image: defaultHeroImage, position: "center", mobilePosition: "center", size: "cover" },
    friends: { image: defaultHeroImage, position: "center", mobilePosition: "center", size: "cover" },
    about: { image: defaultHeroImage, position: "center", mobilePosition: "center", size: "cover" },
  },
};

export default siteConfig;
