import type { CSSProperties } from "react";
import type { HeroConfig, HeroVariant } from "./types.ts";
import { siteConfig } from "./siteConfig.ts";
import { responsiveImageLqip, responsiveImageUrl } from "./responsiveImages.ts";

const PRIMARY_HERO_ORDER = ["home", "posts", "poems", "music", "friends", "about"] as const;
const PRIMARY_HERO_PATHS = ["/", "/posts", "/poems", "/music", "/friends", "/about"] as const;
const PATH_TO_VARIANT: Record<string, HeroVariant> = {
  "/": "home",
  "/posts": "posts",
  "/poems": "poems",
  "/music": "music",
  "/friends": "friends",
  "/about": "about",
};

function getHeroConfig(variant: HeroVariant): HeroConfig {
  return siteConfig.heroes[variant] || siteConfig.heroes.home;
}

type HeroStyle = CSSProperties & {
  "--hero-art-image": string;
  "--hero-art-image-mobile": string;
  "--hero-art-lqip": string;
  "--hero-art-lqip-mobile": string;
  "--hero-art-position": string;
  "--hero-art-position-mobile": string;
  "--hero-art-size": string;
};

function getHeroStyle(variant: HeroVariant): HeroStyle {
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
  } as HeroStyle;
}

function pathVariant(path: string): HeroVariant {
  let normalized = path === "" ? "/" : path;
  if (normalized.startsWith("/post/")) normalized = "/posts";
  if (normalized.startsWith("/poem/")) normalized = "/poems";
  if (normalized.startsWith("/music/")) normalized = "/music";
  return PATH_TO_VARIANT[normalized] || "home";
}

function resolveGlassBackground(hero: HeroConfig): { image: string; lqip: string; needsSoftening: boolean } {
  const glassImage = typeof hero.glassImage === "string" ? hero.glassImage.trim() : "";
  return {
    image: responsiveImageUrl(glassImage || hero.image, 1280),
    lqip: responsiveImageLqip(glassImage || hero.image),
    needsSoftening: !glassImage,
  };
}

function getGlassBackground(path: string): { image: string; lqip: string; needsSoftening: boolean } {
  return resolveGlassBackground(getHeroConfig(pathVariant(path)));
}

const preloadedHeroSources = new Set<string>();
const inFlightHeroImages = new Map<string, HTMLImageElement>();

function preloadHeroAssets(path: string, mobile = false, priority: "low" | "high" | "auto" = "low"): void {
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
