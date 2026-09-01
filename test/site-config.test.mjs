import assert from "node:assert/strict";
import test from "node:test";
import { resolveGlassBackground } from "../src/heroImages.js";
import { DEFAULT_POST_CATEGORIES, getNavItems, getPostCategories, normalizePostCategories, siteConfig } from "../src/siteConfig.js";
import { formatCopyrightYears } from "../src/siteUtils.js";

test("site configuration keeps the portable theme shape", () => {
  assert.equal(typeof siteConfig.home.eyebrow, "string");
  assert.equal(typeof siteConfig.home.description, "string");
  assert.equal(typeof siteConfig.showPoems, "boolean");
  assert.equal(typeof siteConfig.showMusic, "boolean");
  assert.equal(Array.isArray(siteConfig.postCategories), true);
  assert.equal(siteConfig.postCategories.every((category) => typeof category === "string" && category.trim() === category && category !== "" && category !== "全部"), true);
  assert.equal(new Set(siteConfig.postCategories).size, siteConfig.postCategories.length);
  assert.equal(typeof siteConfig.author.tagline, "string");
  assert.equal(typeof siteConfig.author.introduction, "string");
  assert.equal(Array.isArray(siteConfig.author.interests), true);
  const channels = siteConfig.author.channels || {};
  for (const key of ["github", "bilibili", "x"]) {
    assert.equal(typeof (channels[key]?.label || ""), "string");
    assert.equal(typeof (channels[key]?.url || ""), "string");
  }
  assert.equal(typeof (channels.email?.address || ""), "string");
  assert.equal(Array.isArray(siteConfig.about.paragraphs), true);
  assert.equal(siteConfig.footer.themeName, "Fonscape");
  assert.equal(siteConfig.footer.themeRepository, "https://github.com/UndefinedFons/Fonscape");
  for (const hero of Object.values(siteConfig.heroes)) {
    assert.equal(typeof hero.image, "string");
    assert.notEqual(hero.image.trim(), "");
    if ("glassImage" in hero) {
      assert.equal(typeof hero.glassImage, "string");
      assert.notEqual(hero.glassImage.trim(), "");
    }
  }
});

test("post categories normalize safely while preserving an explicit empty list", () => {
  assert.deepEqual(DEFAULT_POST_CATEGORIES, ["随笔", "评谈", "记录", "笔记", "指南"]);
  assert.deepEqual(normalizePostCategories(), [...DEFAULT_POST_CATEGORIES]);
  assert.deepEqual(getPostCategories({}), ["全部", ...DEFAULT_POST_CATEGORIES]);
  assert.deepEqual(getPostCategories({ postCategories: [] }), ["全部"]);
  assert.deepEqual(normalizePostCategories(["  书写  ", "书写", "全部", "", "  ", "影像", null, 42]), ["书写", "影像"]);
  assert.deepEqual(getPostCategories({ postCategories: ["自由分类"] }), ["全部", "自由分类"]);
});

test("poem and music navigation visibility is independently configurable", () => {
  const paths = (config) => getNavItems(config).map(([path]) => path);
  assert.deepEqual(paths({}), ["/", "/posts", "/friends", "/about"]);
  assert.deepEqual(paths({ showPoems: false, showMusic: false }), ["/", "/posts", "/friends", "/about"]);
  assert.deepEqual(paths({ showPoems: true, showMusic: false }), ["/", "/posts", "/poems", "/friends", "/about"]);
  assert.deepEqual(paths({ showPoems: false, showMusic: true }), ["/", "/posts", "/music", "/friends", "/about"]);
  assert.deepEqual(paths({ showPoems: true, showMusic: true }), ["/", "/posts", "/poems", "/music", "/friends", "/about"]);
});

test("glass backgrounds soften ordinary hero images without double-blurring prepared assets", () => {
  assert.deepEqual(resolveGlassBackground({ image: "/assets/plain.webp" }), {
    image: "/assets/plain.webp",
    needsSoftening: true,
  });
  assert.deepEqual(resolveGlassBackground({ image: "/assets/plain.webp", glassImage: "/assets/soft.webp" }), {
    image: "/assets/soft.webp",
    needsSoftening: false,
  });
});

test("copyright year grows from the current installation launch year", () => {
  const launchedAt = Date.UTC(2026, 7, 16);
  assert.equal(formatCopyrightYears(Date.UTC(2026, 7, 16), launchedAt), "2026");
  assert.equal(formatCopyrightYears(Date.UTC(2027, 7, 16), launchedAt), "2026-2027");
  assert.equal(formatCopyrightYears(Date.UTC(2028, 7, 16), launchedAt), "2026-2028");
});
