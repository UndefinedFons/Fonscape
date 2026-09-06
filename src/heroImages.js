import { siteConfig } from "./siteConfig.js";
import { responsiveImageLqip, responsiveImageUrl } from "./responsiveImages.ts";

const PRIMARY_HERO_ORDER = ["home", "posts", "poems", "music", "friends", "about"];
const PRIMARY_HERO_PATHS = ["/", "/posts", "/poems", "/music", "/friends", "/about"];
/** @type {Record<string, string>} */
const PATH_TO_VARIANT = {
  "/": "home",
  "/posts": "posts",
  "/poems": "poems",
  "/music": "music",
  "/friends": "friends",
  "/about": "about",
};

/** @param {string} variant */
function getHeroConfig(variant) {
  return siteConfig.heroes[variant] || siteConfig.heroes.home;
}

/** @param {string} variant */
function getHeroStyle(variant) {
  const hero = getHeroConfig(variant);
  const desktopImage = responsiveImageUrl(hero.image, 1600);
  const mobileImage = responsiveImageUrl(hero.mobileImage || hero.image, 960);
  const desktopLqip = responsiveImageLqip(hero.image);
  const mobileLqip = responsiveImageLqip(hero.mobileImage || hero.image);
  return {
    "--hero-art-image": `url("${desktopImage}")`,
    "--hero-art-image-mobile": `url("${mobileImage}")`,
    "--hero-art-lqip": desktopLqip ? `url("${desktopLqip}")` : "none",
    "--hero-art-lqip-mobile": mobileLqip ? `url("${mobileLqip}")` : "none",
    "--hero-art-position": hero.position || "center",
    "--hero-art-position-mobile": hero.mobilePosition || hero.position || "center",
    "--hero-art-size": hero.size || "cover",
  };
}

/** @param {string} path */
function pathVariant(path) {
  let normalized = path === "" ? "/" : path;
  if (normalized.startsWith("/post/")) normalized = "/posts";
  if (normalized.startsWith("/poem/")) normalized = "/poems";
  if (normalized.startsWith("/music/")) normalized = "/music";
  return PATH_TO_VARIANT[normalized] || "home";
}

/**
 * @param {import("./types.js").HeroConfig} hero
 * @returns {{ image: string, lqip: string, needsSoftening: boolean }}
 */
function resolveGlassBackground(hero) {
  const glassImage = typeof hero.glassImage === "string" ? hero.glassImage.trim() : "";
  return {
    image: responsiveImageUrl(glassImage || hero.image, 1280),
    lqip: responsiveImageLqip(glassImage || hero.image),
    needsSoftening: !glassImage,
  };
}

/** @param {string} path */
function getGlassBackground(path) {
  return resolveGlassBackground(getHeroConfig(pathVariant(path)));
}

const preloadedHeroSources = new Set();
const inFlightHeroImages = new Map();

/**
 * @param {string} path
 * @param {boolean} [mobile]
 * @param {"low" | "high" | "auto"} [priority]
 */
function preloadHeroAssets(path, mobile = false, priority = "low") {
  const hero = getHeroConfig(pathVariant(path));
  const sources = [
    mobile ? responsiveImageUrl(hero.mobileImage || hero.image, 960) : responsiveImageUrl(hero.image, 1600),
    resolveGlassBackground(hero).image,
  ];
  for (const source of sources) {
    if (!source) continue;
    const existing = inFlightHeroImages.get(source);
    if (existing) {
      if (priority === "high") existing.fetchPriority = "high";
      continue;
    }
    if (preloadedHeroSources.has(source)) continue;
    preloadedHeroSources.add(source);
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = priority;
    const finish = () => inFlightHeroImages.delete(source);
    image.addEventListener("load", finish, { once: true });
    image.addEventListener("error", finish, { once: true });
    inFlightHeroImages.set(source, image);
    image.src = source;
  }
}

export {
  getGlassBackground,
  getHeroStyle,
  preloadHeroAssets,
  resolveGlassBackground,
  PRIMARY_HERO_ORDER,
  PRIMARY_HERO_PATHS,
};
