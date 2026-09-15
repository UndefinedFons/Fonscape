import assert from "node:assert/strict";
import test from "node:test";
import {
  getDetailFallbackRoute,
  composeDocumentTitle,
  getRouteDocumentTitle,
  getScrollBehavior,
} from "../src/navigation.js";
import {
  getEnabledCollectionTypes,
  getSectionAvailability,
  isSiteRouteEnabled,
  normalizeRouteLocation,
} from "../src/sectionAvailability.js";
import { legacyHashRoute } from "../src/routes.js";
import {
  consumeDetailSource,
  consumeKnownPopNavigation,
  consumeNavigationType,
  getDetailReturnRoute,
  go,
  markPopNavigation,
  markPushNavigation,
  rememberDetailSource,
  readNavigationType,
  returnFromDetail,
} from "../src/routeState.js";

function createBrowser(initial = "/") {
  const origin = "https://example.com";
  const entries = [{ state: null, url: new URL(initial, origin) }];
  let index = 0;
  const location = {};
  const syncLocation = (value) => {
    const url = new URL(value, origin);
    location.href = url.href;
    location.origin = url.origin;
    location.pathname = url.pathname;
    location.search = url.search;
    location.hash = url.hash;
  };
  syncLocation(entries[0].url.href);
  return {
    scrollY: 240,
    location,
    history: {
      get state() { return entries[index].state; },
      replaceState(state, _title, url) {
        entries[index].state = state;
        if (url !== undefined) syncLocation(url);
      },
      pushState(state, _title, url) {
        const next = new URL(url, origin);
        entries.splice(index + 1);
        entries.push({ state, url: next });
        index += 1;
        syncLocation(next.href);
      },
    },
    dispatchEvent() {},
  };
}

test("optional section availability drives every collection entry point", () => {
  assert.deepEqual(getSectionAvailability({}), { poems: false, music: false });
  assert.deepEqual(getSectionAvailability({ showPoems: true, showMusic: false }), { poems: true, music: false });
  assert.deepEqual(getEnabledCollectionTypes({ showPoems: true, showMusic: true }), ["post", "poem", "music"]);
  assert.equal(isSiteRouteEnabled("/poem/quiet", { showPoems: false }), false);
  assert.equal(isSiteRouteEnabled("/music?section=artists", { showMusic: true }), true);
  assert.equal(normalizeRouteLocation("#/posts?tag=reading"), "/posts?tag=reading");
  assert.equal(legacyHashRoute("#/posts?tag=reading"), "/posts?tag=reading");
  assert.equal(legacyHashRoute("#comments"), null);
});

test("detail fallbacks and titles are derived from the route kind", () => {
  assert.equal(getDetailFallbackRoute("/post/a-note"), "/posts");
  assert.equal(getDetailFallbackRoute("/poem/a-poem"), "/poems");
  assert.equal(getDetailFallbackRoute("/music/artists/a-name"), "/music?section=artists");
  assert.equal(getDetailFallbackRoute("/music/songs/a-song"), "/music");
  assert.equal(getRouteDocumentTitle("/", "风栖"), "风栖");
  assert.equal(getRouteDocumentTitle("/friends", "风栖"), "友链 · 风栖");
  assert.equal(getRouteDocumentTitle("/post/a-note", "风栖"), "文章 · 风栖");
  assert.equal(composeDocumentTitle("一篇文章", "风栖"), "一篇文章 · 风栖");
  assert.equal(getScrollBehavior(true), "auto");
  assert.equal(getScrollBehavior(false), "smooth");
});

test("remembered detail sources preserve filters while direct opens fall back", () => {
  const previousWindow = globalThis.window;
  const browser = createBrowser("/");
  globalThis.window = browser;
  try {
    rememberDetailSource("/post/source-note", "/posts?tag=reading");
    assert.equal(getDetailReturnRoute("/post/source-note"), "/posts?tag=reading");
    assert.equal(consumeDetailSource("/post/source-note"), true);
    assert.equal(returnFromDetail("/post/source-note"), "/posts?tag=reading");
    assert.equal(browser.location.pathname, "/posts");
    assert.equal(browser.location.search, "?tag=reading");
    assert.equal(consumeDetailSource("/post/direct-note"), false);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("History navigation keeps explicit push and restore markers", () => {
  markPushNavigation();
  assert.equal(readNavigationType(), "push");
  assert.equal(consumeNavigationType(), "push");
  markPopNavigation({ state: null });
  assert.equal(readNavigationType(), "pop");

  const previousWindow = globalThis.window;
  const browser = createBrowser("/posts?tag=reading");
  browser.scrollY = 100;
  globalThis.window = browser;
  try {
    go("/post/restore-note", { restoreScroll: true, trackSource: false });
    assert.equal(readNavigationType(), "restore");
    assert.equal(consumeNavigationType(), "restore");
    assert.equal(browser.location.pathname, "/post/restore-note");
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});


test("direct history entries discard stale detail sources after traversal", () => {
  rememberDetailSource("/post/revisited", "/posts?tag=reading");
  consumeDetailSource("/post/revisited");
  markPopNavigation({ state: { fonscapeRouteEntry: "older-entry" } });
  assert.equal(consumeNavigationType(), "pop");
  markPopNavigation(/** @type {PopStateEvent} */ ({ state: null }));
  const navigationType = consumeNavigationType();
  assert.equal(navigationType, "pop");
  consumeDetailSource("/post/revisited", { preserveExisting: navigationType === "pop" && consumeKnownPopNavigation() });
  assert.equal(getDetailReturnRoute("/post/revisited"), null);
});
