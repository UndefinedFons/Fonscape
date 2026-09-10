import test from "node:test";
import assert from "node:assert/strict";
import { buildSitemap } from "../scripts/generate-sitemap.mjs";
import { getNavItems } from "../src/siteConfig.js";
import { isSiteRouteEnabled } from "../src/sectionAvailability.js";

test("community defaults to enabled and controls friends and setup routes together", () => {
  for (const config of [{}, { showCommunity: true }, { showCommunity: false }]) {
    const enabled = config.showCommunity !== false;
    assert.equal(getNavItems(config).some(([path]) => path === "/friends"), enabled);
    for (const path of ["/friends", "/friends/", "/friends?from=home", "/admin", "/admin/setup"]) {
      assert.equal(isSiteRouteEnabled(path, config), enabled, path);
    }
    assert.equal(isSiteRouteEnabled("/posts", config), true);
    assert.equal(isSiteRouteEnabled("/about", config), true);
    assert.equal(isSiteRouteEnabled("/poems", { ...config, showPoems: true }), true);
    assert.equal(isSiteRouteEnabled("/music", { ...config, showMusic: true }), true);
  }
});

test("sitemap omits friends when community is hidden and retains articles", () => {
  const collections = { post: [{ slug: "hello", date: "2026-01-02", title: "Hello" }], poem: [], music: [] };
  for (const config of [{}, { showCommunity: true }, { showCommunity: false }]) {
    const sitemap = buildSitemap(collections, "https://blog.example", config);
    assert.equal(sitemap.includes("https://blog.example/friends"), config.showCommunity !== false);
    assert.match(sitemap, /https:\/\/blog\.example\/posts/u);
    assert.doesNotMatch(sitemap, /https:\/\/blog\.example\/admin/u);
  }
});
