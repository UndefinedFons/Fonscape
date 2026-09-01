const defaultHeroImage = "/fonscape/hero-white.svg";

const siteConfig = {
  language: "zh-CN",
  title: "我的博客",
  description: "网站简介",
  postCategories: ["随笔", "评谈", "记录", "笔记", "指南"],
  showPoems: false,
  showMusic: false,
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
    channels: {
      github: {
        label: "",
        url: "",
      },
      bilibili: {
        label: "",
        url: "",
      },
      x: {
        label: "",
        url: "",
      },
      email: {
        address: "",
      },
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
