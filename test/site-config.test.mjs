import assert from "node:assert/strict";
import test from "node:test";
import { siteConfig } from "../src/content/site.js";
import { formatCopyrightYears } from "../src/siteUtils.js";

test("clean theme defaults use neutral content and one shared white hero", () => {
  assert.equal(siteConfig.home.eyebrow, "PERSONAL BLOG");
  assert.equal(siteConfig.home.description, "网站简介");
  assert.equal(siteConfig.author.tagline, "个人签名");
  assert.equal(siteConfig.author.introduction, "个人简介");
  assert.deepEqual(siteConfig.author.interests, []);
  assert.deepEqual(siteConfig.about.paragraphs, []);
  assert.equal(siteConfig.footer.themeName, "Fonscape");
  assert.equal(siteConfig.footer.themeRepository, "https://github.com/UndefinedFons/Fonscape");
  assert.deepEqual(
    [...new Set(Object.values(siteConfig.heroes).flatMap((hero) => [hero.image, hero.glassImage]))],
    ["/assets/hero-white.svg"],
  );
});

test("copyright year grows from the configured launch year", () => {
  assert.equal(formatCopyrightYears(Date.UTC(2026, 7, 16)), "2026");
  assert.equal(formatCopyrightYears(Date.UTC(2027, 7, 16)), "2026-2027");
  assert.equal(formatCopyrightYears(Date.UTC(2028, 7, 16)), "2026-2028");
});
