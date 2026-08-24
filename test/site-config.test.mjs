import assert from "node:assert/strict";
import test from "node:test";
import { resolveGlassBackground } from "../src/heroImages.js";
import { siteConfig } from "../src/siteConfig.js";
import { formatCopyrightYears } from "../src/siteUtils.js";

test("site configuration keeps the portable theme shape", () => {
  assert.equal(typeof siteConfig.home.eyebrow, "string");
  assert.equal(typeof siteConfig.home.description, "string");
  assert.equal(typeof siteConfig.author.tagline, "string");
  assert.equal(typeof siteConfig.author.introduction, "string");
  assert.equal(Array.isArray(siteConfig.author.interests), true);
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
