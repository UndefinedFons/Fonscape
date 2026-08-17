import { siteConfig } from "./content/site.js";

const PRIMARY_HERO_ORDER = ["home", "posts", "poems", "music", "friends", "about"];
const PATH_TO_VARIANT = {
  "/": "home",
  "/posts": "posts",
  "/poems": "poems",
  "/music": "music",
  "/friends": "friends",
  "/about": "about",
};

function getHeroConfig(variant) {
  return siteConfig.heroes[variant] || siteConfig.heroes.home;
}

function getHeroStyle(variant) {
  const hero = getHeroConfig(variant);
  return {
    "--hero-art-image": `url("${hero.image}")`,
    "--hero-art-position": hero.position || "center",
    "--hero-art-position-mobile": hero.mobilePosition || hero.position || "center",
    "--hero-art-size": hero.size || "cover",
  };
}

function pathVariant(path) {
  let normalized = path === "" ? "/" : path;
  if (normalized.startsWith("/post/")) normalized = "/posts";
  if (normalized.startsWith("/poem/")) normalized = "/poems";
  if (normalized.startsWith("/music/")) normalized = "/music";
  return PATH_TO_VARIANT[normalized] || "home";
}

function getGlassBackgroundImage(path) {
  const hero = getHeroConfig(pathVariant(path));
  return hero.glassImage || hero.image;
}

const ROUTE_HERO_IMAGES = PRIMARY_HERO_ORDER.map((variant) => getHeroConfig(variant).image);
const GLASS_BACKGROUND_IMAGES = PRIMARY_HERO_ORDER.map((variant) => {
  const hero = getHeroConfig(variant);
  return hero.glassImage || hero.image;
});

export {
  getGlassBackgroundImage,
  getHeroStyle,
  ROUTE_HERO_IMAGES,
  GLASS_BACKGROUND_IMAGES,
  PRIMARY_HERO_ORDER,
};
