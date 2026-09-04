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
import {
  consumeDetailSource,
  consumeNavigationType,
  getDetailReturnRoute,
  go,
  markPopNavigation,
  markPushNavigation,
  rememberDetailSource,
  readNavigationType,
  returnFromDetail,
} from "../src/routeState.js";

test("optional section availability drives every collection entry point", () => {
  assert.deepEqual(getSectionAvailability({}), { poems: false, music: false });
  assert.deepEqual(getSectionAvailability({ showPoems: true, showMusic: false }), { poems: true, music: false });
  assert.deepEqual(getEnabledCollectionTypes({ showPoems: true, showMusic: true }), ["post", "poem", "music"]);
  assert.equal(isSiteRouteEnabled("/poem/quiet", { showPoems: false }), false);
  assert.equal(isSiteRouteEnabled("/music?section=artists", { showMusic: true }), true);
  assert.equal(normalizeRouteLocation("#/posts?tag=reading"), "/posts?tag=reading");
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
  const hash = { value: "#/post/source-note" };
  globalThis.window = {
    scrollY: 240,
    location: {
      get hash() { return hash.value; },
      set hash(value) { hash.value = value.startsWith("#") ? value : `#${value}`; },
      pathname: "/",
      search: "",
    },
    history: {
      state: null,
      replaceState() {},
    },
  };
  try {
    rememberDetailSource("/post/source-note", "/posts?tag=reading");
    assert.equal(getDetailReturnRoute("/post/source-note"), "/posts?tag=reading");
    assert.equal(consumeDetailSource("/post/source-note"), true);
    assert.equal(returnFromDetail("/post/source-note"), "/posts?tag=reading");
    assert.equal(hash.value, "#/posts?tag=reading");
    assert.equal(consumeDetailSource("/post/direct-note"), false);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("popstate cannot override explicit push or restore markers before hashchange", () => {
  markPushNavigation();
  markPopNavigation();
  assert.equal(readNavigationType(), "push");
  assert.equal(consumeNavigationType(), "push");
  markPopNavigation();
  assert.equal(readNavigationType(), "pop");

  const previousWindow = globalThis.window;
  const hash = { value: "#/posts?tag=reading" };
  globalThis.window = {
    scrollY: 100,
    location: {
      get hash() { return hash.value; },
      set hash(value) { hash.value = value.startsWith("#") ? value : `#${value}`; },
      pathname: "/",
      search: "",
    },
  };
  try {
    go("/post/restore-note", { restoreScroll: true, trackSource: false });
    markPopNavigation();
    assert.equal(readNavigationType(), "restore");
    assert.equal(consumeNavigationType(), "restore");
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
