import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createServer } from "vite";
import { getEnabledCollectionTypes } from "../src/sectionAvailability.ts";
import { buildContentDistribution } from "../scripts/generate-content-targets.mjs";
import { parseMusicReview, parsePost } from "../src/content/frontmatter.ts";

const sourceRoot = new URL("../", import.meta.url);
const siteConfigPath = fileURLToPath(new URL("../fonscape.config.js", import.meta.url));
const communityOnConfig = Object.freeze({ showCommunity: true, showPoems: false, showMusic: false });
const communityOffConfig = Object.freeze({ showCommunity: false, showPoems: false, showMusic: false });

let viteServer;
let createRoot;
let mountedRoot;
let restoreDom;
let fixtureServer;

const member = { id: "member-1", username: "member", nickname: "读者", role: "member", status: "active", unreadReplies: 0, unreadAdminComments: 0, avatarUrl: null, avatarUpdatedAt: null, createdAt: 1 };

function commentFixture(id, extra = {}) {
  return {
    id, parentId: null, replyTo: null, replyToUser: null, body: id, status: "published",
    createdAt: 100, updatedAt: 100, editedAt: null, canDelete: true,
    author: { id: member.id, nickname: member.nickname, role: member.role, avatarUrl: null, avatarUpdatedAt: null },
    ...extra,
  };
}

function themeDistribution() {
  const posts = [["last", 3, "笔记"], ["first", 1, "记录"], ["middle", 2, "记录"], ["other", 0, "记录"]].map(([slug, order, category]) => {
    const name = slug + ".md";
    const raw = ["---", 'title: "' + slug + '"', 'category: "' + category + '"', 'date: "2026-09-29"',
      'tags: ["' + (order ? "alpha" : "beta") + '"]', ...(order ? ['series: "示例系列"', "seriesOrder: " + order] : []),
      "---", "测试正文。"].join("\n");
    const path = "src/content/posts/" + name;
    return { name, source: path, raw, entry: parsePost(path, raw) };
  });
  const musicRaw = ['---', 'title: "album"', 'kind: "专辑"', 'section: "albums"', 'date: "2026-09-29"', '---', '音乐笔记。'].join("\n");
  return buildContentDistribution([
    ["post", posts], ["poem", []], ["music", [{ name: "album.md", source: "src/content/music/album.md", raw: musicRaw, entry: parseMusicReview("src/content/music/album.md", musicRaw) }]],
  ]);
}

function configFixturePlugin(overrides, beforeExport = "") {
  return {
    name: "fixed-site-config-test-fixture",
    transform(code, id) {
      if (id !== siteConfigPath) return null;
      const exportStatement = "export default siteConfig;";
      if (!code.includes(exportStatement)) throw new Error("Unable to apply the fixed site config test fixture.");
      return code.replace(exportStatement, `${beforeExport}export default { ...siteConfig, ...${JSON.stringify(overrides)} };`);
    },
  };
}


test.before(async () => {
  viteServer = await createServer({
    root: fileURLToPath(sourceRoot),
    configFile: false,
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
    esbuild: { jsx: "automatic" },
    plugins: [configFixturePlugin(communityOnConfig)],
    server: { middlewareMode: true, ws: false, watch: null },
  });
});

test.after(async () => {
  await viteServer?.close();
});

test.afterEach(async () => {
  if (mountedRoot) {
    await act(async () => mountedRoot.unmount());
    mountedRoot = null;
  }
  await fixtureServer?.close();
  fixtureServer = null;
  restoreDom?.();
  restoreDom = null;
});

function makeResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return String(name).toLowerCase() === "content-type" ? "application/json" : null;
      },
    },
    json: async () => payload,
  };
}

function installDom(path = "/admin/setup", { includeFullFontStylesheet = true } = {}) {
  const jsdom = new JSDOM(
    "<!doctype html><html><head></head><body><div id=\"root\"></div></body></html>",
    { url: `https://fonstage.test${path}`, pretendToBeVisual: true },
  );
  const originalGlobals = new Map();
  const replaceCalls = [];

  jsdom.window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; },
  });
  jsdom.window.scrollTo = () => {};

  if (includeFullFontStylesheet) {
    const stylesheet = jsdom.window.document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "/fonscape/google-fonts-full.css";
    Object.defineProperty(stylesheet, "sheet", { configurable: true, value: {} });
    jsdom.window.document.head.append(stylesheet);
  }

  const location = {
    get href() { return jsdom.window.location.href; },
    get origin() { return jsdom.window.location.origin; },
    get pathname() { return jsdom.window.location.pathname; },
    get search() { return jsdom.window.location.search; },
    get hash() { return jsdom.window.location.hash; },
    replace(value) { replaceCalls.push(String(value)); },
    assign(value) { replaceCalls.push(String(value)); },
    toString() { return jsdom.window.location.href; },
  };
  const window = new Proxy(jsdom.window, {
    get(target, property) {
      if (property === "location") return location;
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(target, property, value) {
      if (property === "location") return true;
      return Reflect.set(target, property, value, target);
    },
  });

  const resizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  const globals = {
    window,
    self: window,
    document: jsdom.window.document,
    navigator: jsdom.window.navigator,
    history: jsdom.window.history,
    location,
    HTMLElement: jsdom.window.HTMLElement,
    HTMLInputElement: jsdom.window.HTMLInputElement,
    HTMLTextAreaElement: jsdom.window.HTMLTextAreaElement,
    Node: jsdom.window.Node,
    Event: jsdom.window.Event,
    MouseEvent: jsdom.window.MouseEvent,
    CustomEvent: jsdom.window.CustomEvent,
    KeyboardEvent: jsdom.window.KeyboardEvent,
    MutationObserver: jsdom.window.MutationObserver,
    ResizeObserver: resizeObserver,
    Image: jsdom.window.Image,
    requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame,
    localStorage: jsdom.window.localStorage,
    sessionStorage: jsdom.window.sessionStorage,
    getComputedStyle: jsdom.window.getComputedStyle.bind(jsdom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: undefined,
  };

  for (const [name, value] of Object.entries(globals)) {
    originalGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }

  restoreDom = () => {
    mountedRoot = null;
    jsdom.window.close();
    for (const [name, descriptor] of originalGlobals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  };

  return { document: jsdom.window.document, replaceCalls };
}

function installFetch({ setup = { initialized: false }, session = { user: null }, search = "empty", posts = "empty" } = {}) {
  const requests = [];
  let searchAttempts = 0;
  globalThis.fetch = async (input, options = {}) => {
    const requestUrl = new URL(typeof input === "string" ? input : input.url, "https://fonstage.test");
    requests.push(requestUrl.pathname);
    if (requestUrl.pathname === "/api/auth/session") return makeResponse(session);
    if (requestUrl.pathname === "/api/admin/setup") {
      if (typeof setup === "function") return setup(options);
      return setup instanceof Error ? Promise.reject(setup) : makeResponse(setup.payload ?? setup, setup.status ?? 200);
    }
    if (requestUrl.pathname === "/api/site/runtime") return makeResponse({ launchedAt: Date.now() });
    if (requestUrl.pathname.includes("/fonscape/content/pages/post/")) return posts === "stall" ? new Promise(() => {}) : makeResponse([]);
    if (requestUrl.pathname.includes("/fonscape/content/search/")) {
      searchAttempts += 1;
      if (search === "stall") return new Promise(() => {});
      if (search === "fail-once" && searchAttempts === 1) return makeResponse({ error: "索引暂时不可用" }, 503);
      return makeResponse([]);
    }
    return makeResponse({ error: "not found" }, 404);
  };
  return requests;
}

async function enableSearchChunks() {
  const { contentManifest } = await viteServer.ssrLoadModule("/functions/_generated/content-metadata.js");
  const previous = Object.fromEntries(Object.entries(contentManifest.collections).map(([type, descriptor]) => [type, descriptor.searchChunkCount]));
  Object.values(contentManifest.collections).forEach((descriptor) => { descriptor.searchChunkCount = 1; });
  return () => Object.entries(previous).forEach(([type, count]) => { contentManifest.collections[type].searchChunkCount = count; });
}

async function loadApplication() {
  if (!createRoot) ({ createRoot } = await import("react-dom/client"));
}

async function mountApp(server = viteServer) {
  await loadApplication();
  const [{ App }, { CommunityProvider }] = await Promise.all([
    server.ssrLoadModule("/src/App.tsx"),
    server.ssrLoadModule("/src/community/CommunityProvider.tsx"),
  ]);
  mountedRoot = createRoot(document.getElementById("root"));
  await act(async () => {
    mountedRoot.render(createElement(CommunityProvider, null, createElement(App)));
  });
}

test("session refreshes cannot overwrite newer authentication or session results", async () => {
  const { document } = installDom("/");
  await loadApplication();
  const { CommunityProvider, useCommunity } = await viteServer.ssrLoadModule("/src/community/CommunityProvider.tsx");
  const pending = [];
  globalThis.fetch = async (input) => {
    if (input === "/api/auth/session") return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    if (input === "/api/auth/logout") return makeResponse({ ok: true });
    return makeResponse({ user: member });
  };
  let community;
  function Viewer() {
    community = useCommunity();
    return createElement("p", null, `${community.viewer?.id || "guest"}:${community.loading ? "loading" : "ready"}`);
  }
  mountedRoot = createRoot(document.getElementById("root"));
  await act(async () => mountedRoot.render(createElement(CommunityProvider, null, createElement(Viewer))));
  assert.equal(pending.length, 1);
  await act(async () => community.login({ username: member.username, password: "password" }));
  assert.equal(document.querySelector("p").textContent, "member-1:ready");
  await act(async () => pending[0].resolve(makeResponse({ user: null, accountNotice: "stale" })));
  assert.equal(document.querySelector("p").textContent, "member-1:ready");
  assert.equal(community.accountNotice, "");

  let older;
  let newer;
  await act(async () => { older = community.refresh(); newer = community.refresh(); });
  await act(async () => { pending[2].resolve(makeResponse({ user: member, accountNotice: "current" })); await newer; });
  await act(async () => { pending[1].resolve(makeResponse({ user: null, accountNotice: "stale" })); await older; });
  assert.equal(document.querySelector("p").textContent, "member-1:ready");
  assert.equal(community.accountNotice, "current");

  let beforeLogout;
  await act(async () => { beforeLogout = community.refresh(); });
  await act(async () => community.logout());
  await act(async () => { pending[3].resolve(makeResponse({ user: member })); await beforeLogout; });
  assert.equal(document.querySelector("p").textContent, "guest:ready");

  let beforeRegister;
  await act(async () => { beforeRegister = community.refresh(); });
  await act(async () => community.register({ username: member.username, password: "password" }));
  await act(async () => { pending[4].reject(new Error("stale network failure")); await beforeRegister; });
  assert.equal(document.querySelector("p").textContent, "member-1:ready");
});

async function waitFor(assertion, timeout = 3000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeout) {
    try {
      return assertion();
    } catch (error) {
      lastError = error;
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw lastError || new Error("Timed out while waiting for the expected DOM state.");
}

async function setInputValue(input, value) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function mountFixture({ handleApi = () => undefined, distinctHeroes = false } = {}) {
  const distribution = themeDistribution();
  fixtureServer = await createServer({
    root: fileURLToPath(sourceRoot), configFile: false, appType: "custom",
    optimizeDeps: { noDiscovery: true }, esbuild: { jsx: "automatic" },
    plugins: [configFixturePlugin(
      { ...communityOnConfig, showMusic: true },
      distinctHeroes ? 'siteConfig.heroes.posts.image = "/fonscape/test-posts.svg"; siteConfig.heroes.music.image = "/fonscape/test-music.svg"; ' : "",
    )],
    server: { middlewareMode: true, ws: false, watch: null },
  });
  const { contentManifest } = await fixtureServer.ssrLoadModule("/functions/_generated/content-metadata.js");
  Object.assign(contentManifest.collections, distribution.manifest.collections);
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input), "https://fonstage.test");
    const handled = handleApi(url, options);
    if (handled !== undefined) return handled;
    if (url.pathname === "/api/auth/session") return Response.json({ user: member });
    if (url.pathname === "/api/site/runtime") return Response.json({ launchedAt: 1 });
    if (url.pathname === "/api/content/stats") return Response.json({ stats: {} });
    if (url.pathname === "/api/comments") return Response.json({ comments: [], total: 0, page: 1, pageSize: 20, totalPages: 1 });
    if (url.pathname === "/api/me/comments") return Response.json({ comments: [] });
    if (url.pathname === "/api/me/replies") return Response.json({ replies: [] });
    const file = distribution.files.get(url.pathname.replace(/^\/fonscape\/content\//u, ""));
    return file === undefined ? new Response("not found", { status: 404 }) : new Response(file);
  };
  if (!createRoot) ({ createRoot } = await import("react-dom/client"));
  const { App: FixtureApp } = await fixtureServer.ssrLoadModule("/src/App.tsx");
  const { CommunityProvider: FixtureCommunity } = await fixtureServer.ssrLoadModule("/src/community/CommunityProvider.tsx");
  mountedRoot = createRoot(document.getElementById("root"));
  await act(async () => mountedRoot.render(createElement(FixtureCommunity, null, createElement(FixtureApp))));
}

function button(text) {
  const item = [...document.querySelectorAll("button")].find((element) => element.textContent === text);
  assert.ok(item, "missing button: " + text);
  return item;
}

async function traverse(direction) {
  await act(async () => history[direction]());
}

test("extended route intent loads the full font stylesheet on demand", async () => {
  const { document } = installDom("/", { includeFullFontStylesheet: false });
  const { preloadRouteModule } = await viteServer.ssrLoadModule("/src/appRoutes.tsx");

  assert.equal(document.querySelector('link[href="/fonscape/google-fonts-full.css"]'), null);
  await preloadRouteModule("/admin/setup");

  const stylesheet = document.querySelector('link[rel="stylesheet"][href="/fonscape/google-fonts-full.css"]');
  assert.ok(stylesheet, "loading a route that needs extended glyphs requests the full local font catalog");
  await act(async () => stylesheet.dispatchEvent(new Event("load")));
  assert.equal(stylesheet.media, "all", "the stylesheet becomes active after it finishes loading");
});

test("recent route intent postpones idle prefetch and upgrades its hero priority", async () => {
  installDom("/");
  const originalImage = globalThis.Image;
  const originalSetTimeout = window.setTimeout;
  const originalPerformance = Object.getOwnPropertyDescriptor(globalThis, "performance");
  const images = [];
  const idleCallbacks = [];
  let now = 1000;
  globalThis.Image = class {
    addEventListener() {}
    set src(value) { this.source = value; images.push(this); }
  };
  window.setTimeout = (callback, delay, ...args) => delay === 900
    ? (idleCallbacks.push(callback), -1)
    : originalSetTimeout(callback, delay, ...args);
  try {
    await mountFixture({ distinctHeroes: true });
    const link = await waitFor(() => {
      const item = document.querySelector('a[href="/post/first"]');
      assert.ok(item);
      return item;
    });
    assert.ok(idleCallbacks.length, "unrelated routes should wait for an idle turn");
    Object.defineProperty(globalThis, "performance", { configurable: true, value: { now: () => now } });
    await act(async () => link.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })));
    const postImage = await waitFor(() => {
      const item = images.find((image) => image.source === "/fonscape/test-posts.svg" && image.fetchPriority === "low");
      assert.ok(item);
      return item;
    });
    assert.equal(postImage.fetchPriority, "low");

    idleCallbacks.shift()();
    assert.ok(idleCallbacks.length, "recent intent postpones the unrelated idle queue");
    now = 2000;
    idleCallbacks.shift()();
    assert.equal(images.some((image) => image.source === "/fonscape/test-music.svg"), false, "idle work must resume serially after intent");
    now = 3000;
    idleCallbacks.shift()();
    assert.equal(images.find((image) => image.source === "/fonscape/test-music.svg")?.fetchPriority, "low");

    await act(async () => link.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    assert.equal(postImage.fetchPriority, "high");
  } finally {
    globalThis.Image = originalImage;
    window.setTimeout = originalSetTimeout;
    if (originalPerformance) Object.defineProperty(globalThis, "performance", originalPerformance);
    else delete globalThis.performance;
  }
});

test("music shelf opens a detail and returns to the complete shelf", async () => {
  installDom("/music");
  const oldAudioDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Audio");
  const metricsPrototype = HTMLElement.prototype;
  const metricNames = ["offsetLeft", "offsetTop", "offsetWidth", "offsetHeight", "animate"];
  const oldMetrics = new Map(metricNames.map((name) => [name, Object.getOwnPropertyDescriptor(metricsPrototype, name)]));
  const animations = [];
  Object.defineProperties(metricsPrototype, {
    offsetLeft: { configurable: true, get() { return 0; } },
    offsetTop: { configurable: true, get() { return 0; } },
    offsetWidth: { configurable: true, get() { return this.classList?.contains("music-record") ? this.classList.contains("is-playing") ? 140 : 100 : 0; } },
    offsetHeight: { configurable: true, get() { return this.classList?.contains("music-record") ? this.classList.contains("is-playing") ? 120 : 100 : 0; } },
    animate: {
      configurable: true,
      value(frames, options) {
        const animation = { element: this, frames, options, cancelCalls: 0, cancel() { this.cancelCalls += 1; } };
        animations.push(animation);
        return animation;
      },
    },
  });
  const audios = [];
  class AudioFixture {
    constructor(src) { this.src = src; this.paused = true; this.currentTime = 0; this.duration = 90; this.listeners = new Map(); audios.push(this); }
    load() {}
    removeAttribute(name) { if (name === "src") this.src = ""; }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    removeEventListener(name) { this.listeners.delete(name); }
    async play() { this.paused = false; this.listeners.get("play")?.(); }
    pause() { this.paused = true; this.listeners.get("pause")?.(); }
    emit(name) { this.listeners.get(name)?.(); }
  }
  let fixtureFetch;
  let musicSession;
  try {
    await mountFixture();
    fixtureFetch = globalThis.fetch;
    const module = await fixtureServer.ssrLoadModule("/src/musicSession.ts");
    musicSession = module.musicSession;
    await act(async () => musicSession.stop());
    globalThis.Audio = AudioFixture;
    globalThis.fetch = async (input, options) => {
      const requestUrl = String(input);
      if (requestUrl.includes("/api/music/library?")) return makeResponse({ truncated: false, tracks: [1, 2, 3].map((id) => ({ id: String(id), source: "netease", title: `Track ${id}`, artist: `Artist ${id}`, cover: "", src: `/audio/${id}`, lyricUrl: `/lyrics/${id}` })) });
      if (requestUrl.includes("/lyrics/")) return makeResponse({ lyric: "", translation: "" });
      return fixtureFetch(input, options);
    };

    await waitFor(() => assert.ok(document.querySelector('a[aria-label="聆听 album"]')));
    assert.equal(document.querySelector('[aria-label="音乐播放器"]'), null);
    assert.equal(document.querySelector('[role="tablist"][aria-label="音乐分类"]'), null);
    const seed = { title: "album", sourceTitle: "album", sourceMeta: "Artist", kind: "专辑", section: "albums", slug: "album", date: "2026-10-02", wordCount: 0, firstParagraph: "", image: "", url: "https://music.163.com/album?id=123" };
    await act(async () => musicSession.load(seed));
    await waitFor(() => assert.equal(document.querySelector('button[aria-label="暂停 album"]')?.getAttribute("aria-pressed"), "true"));
    const card = document.querySelector(".music-record");
    const playbackAnimation = animations.at(-1);
    assert.equal(animations.length, 1, "starting playback animates the changed card size");
    assert.equal(playbackAnimation.element, card);
    assert.equal(playbackAnimation.options.duration, 520);

    const audio = audios.at(-1);
    audio.currentTime = 12;
    await act(async () => audio.emit("timeupdate"));
    assert.equal(musicSession.getSnapshot().time, 12);
    assert.equal(playbackAnimation.cancelCalls, 0, "time updates must not cancel the active size animation");
    assert.equal(animations.length, 1);

    await act(async () => document.querySelector('button[aria-label="暂停 album"]').click());
    await waitFor(() => assert.equal(document.querySelector('button[aria-label="播放 album"]')?.getAttribute("aria-pressed"), "false"));
    assert.equal(playbackAnimation.cancelCalls, 1);
    assert.equal(animations.length, 2, "pausing starts a new animation for the shrinking card");
    assert.match(animations.at(-1).frames[0].transform, /scale\(1\.4,1\.2\)/u);

    await act(async () => document.querySelector('a[aria-label="聆听 album"]').click());
    await waitFor(() => assert.equal(document.querySelector(".article-intro-copy h1")?.textContent, "album"));
    await act(async () => button("返回").click());
    await waitFor(() => assert.ok(document.querySelector('a[aria-label="聆听 album"]')));
    assert.equal(location.pathname, "/music");
  } finally {
    await act(async () => musicSession?.stop());
    if (fixtureFetch) globalThis.fetch = fixtureFetch;
    if (oldAudioDescriptor) Object.defineProperty(globalThis, "Audio", oldAudioDescriptor);
    else delete globalThis.Audio;
    for (const name of metricNames) {
      const descriptor = oldMetrics.get(name);
      if (descriptor) Object.defineProperty(metricsPrototype, name, descriptor);
      else delete metricsPrototype[name];
    }
  }
});

test("music playback continues outside the music section until explicitly stopped", async () => {
  installDom("/music/albums/test-album");
  const matchMedia = window.matchMedia;
  window.matchMedia = (query) => query === "(prefers-reduced-motion: reduce)"
    ? { matches: true, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }
    : matchMedia(query);
  await loadApplication();
  const oldAudio = globalThis.Audio;
  const audios = [];
  class AudioFixture {
    constructor(src) { this.src = src; this.paused = true; this.currentTime = 0; this.duration = 90; this.listeners = new Map(); audios.push(this); }
    load() {}
    removeAttribute(name) { if (name === "src") this.src = ""; }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    removeEventListener(name) { this.listeners.delete(name); }
    async play() { this.paused = false; this.listeners.get("play")?.(); }
    pause() { this.paused = true; this.listeners.get("pause")?.(); }
  }
  globalThis.Audio = AudioFixture;
  HTMLElement.prototype.scrollIntoView = () => {};
  const libraryRequests = [];
  globalThis.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl.includes("lyrics")) return makeResponse({ lyric: "", translation: "" });
    if (requestUrl.includes("/api/music/library?")) libraryRequests.push(requestUrl);
    return makeResponse({ truncated: false, tracks: [1, 2, 3].map((id) => ({ id: String(id), source: "netease", title: `Track ${id}`, artist: "Artist", cover: "", src: `/audio/${id}`, lyricUrl: `/lyrics/${id}` })) });
  };
  const [{ MusicStage }, { MusicRecord }, { musicSession }] = await Promise.all([
    viteServer.ssrLoadModule("/src/components/MusicStage.tsx"),
    viteServer.ssrLoadModule("/src/components/MusicRecord.tsx"),
    viteServer.ssrLoadModule("/src/musicSession.ts"),
  ]);
  musicSession.stop();
  try {
    mountedRoot = createRoot(document.getElementById("root"));
    const seed = { title: "Album", sourceTitle: "Album", sourceMeta: "Artist", kind: "专辑", section: "albums", slug: "test-album", date: "2026-10-02", wordCount: 0, firstParagraph: "", image: "", url: "https://music.163.com/album?id=123" };
    await act(async () => mountedRoot.render(createElement(MusicStage, { seed })));
    await waitFor(() => assert.equal(document.querySelector("h2")?.textContent, "Track 1"));
    assert.equal(audios.at(-1).paused, false, "entering the detail attempts playback directly");
    assert.equal(document.querySelector('a[aria-label="前往音乐平台收听"]'), null);
    assert.equal(document.body.textContent.includes("已暂停"), false);
    assert.equal(document.querySelector(".music-stage-story header button"), null);
    await act(async () => musicSession.setVolume(.4));
    await act(async () => document.querySelector('button[aria-label="静音"]').click());
    assert.equal(musicSession.getSnapshot().volume, 0);
    assert.equal(audios.at(-1).volume, 0);
    await act(async () => document.querySelector('button[aria-label="恢复满音量"]').click());
    assert.equal(musicSession.getSnapshot().volume, 1);
    assert.equal(audios.at(-1).volume, 1);
    await act(async () => document.querySelector('button[aria-label="顺序播放，切换播放模式"]').click());
    assert.equal(musicSession.getSnapshot().repeat, true);
    await act(async () => document.querySelector('button[aria-label="单曲循环，切换播放模式"]').click());
    assert.equal(musicSession.getSnapshot().shuffle, true);
    assert.equal(musicSession.getSnapshot().repeat, false);
    await act(async () => document.querySelector('button[aria-label="随机播放，切换播放模式"]').click());
    assert.equal(musicSession.getSnapshot().shuffle, false);
    await act(async () => document.querySelector('button[aria-label="选择曲目，当前第 1 首，共 3 首"]').click());
    assert.ok(document.querySelector('[role="dialog"][aria-modal="true"]'));
    const trackList = document.querySelector('[aria-label="播放队列"]');
    const scrollRail = document.querySelector('[role="scrollbar"][aria-label="播放队列滚动条"]');
    const scrollThumb = scrollRail.querySelector("span");
    Object.defineProperties(trackList, { clientHeight: { value: 136 }, scrollHeight: { value: 204 } });
    Object.defineProperty(scrollRail, "clientHeight", { value: 136 });
    scrollRail.getBoundingClientRect = () => ({ top: 10, height: 136 });
    scrollThumb.getBoundingClientRect = () => ({ top: 10 + trackList.scrollTop / 68 * 45, bottom: 101 + trackList.scrollTop / 68 * 45 });
    await act(async () => trackList.dispatchEvent(new Event("scroll")));
    await waitFor(() => assert.equal(scrollRail.getAttribute("aria-valuemax"), "68"));
    await act(async () => scrollRail.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
    assert.equal(trackList.scrollTop, 68);
    await act(async () => scrollRail.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
    assert.equal(trackList.scrollTop, 0);
    const pointer = (type, clientY) => {
      const event = new MouseEvent(type, { clientY, button: 0, bubbles: true });
      Object.defineProperty(event, "pointerId", { value: 1 });
      return event;
    };
    await act(async () => {
      scrollRail.dispatchEvent(pointer("pointerdown", 30));
      scrollRail.dispatchEvent(pointer("pointermove", 75));
      scrollRail.dispatchEvent(pointer("pointerup", 75));
    });
    assert.equal(trackList.scrollTop, 68, "dragging the custom thumb reaches the bottom of the queue");
    await act(async () => [...document.querySelectorAll('[aria-label="播放队列"] button')].find((node) => node.textContent.includes("Track 3")).click());
    await waitFor(() => assert.equal(document.querySelector(".music-stage-record h2")?.textContent, "Track 3"));
    await waitFor(() => assert.equal(document.querySelector('[role="dialog"]'), null));
    await act(async () => {
      history.pushState({}, "", "/music");
      window.dispatchEvent(new Event("fonscape:navigate"));
      mountedRoot.render(createElement(MusicRecord, { entry: seed }));
    });
    await waitFor(() => assert.equal(document.querySelector(".music-record-copy h3")?.textContent, "Track 3"));
    assert.equal(audios.at(-1).paused, false, "returning to the music shelf keeps the selected track playing");
    assert.equal(audios.at(-1).src, "/audio/3");
    await act(async () => {
      history.pushState({}, "", "/music/albums/test-album");
      window.dispatchEvent(new Event("fonscape:navigate"));
      mountedRoot.render(createElement(MusicStage, { seed }));
    });
    await waitFor(() => assert.equal(document.querySelector(".music-stage-record h2")?.textContent, "Track 3"));
    assert.equal(libraryRequests.length, 1);
    const audioCountBeforeStop = audios.length;
    await act(async () => musicSession.stop());
    await waitFor(() => {
      assert.equal(musicSession.getSnapshot().entry, null);
      assert.equal(document.querySelector(".music-stage-record h2")?.textContent, "Album");
      assert.equal(audios.at(-1).src, "");
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(audios.length, audioCountBeforeStop, "stopping on the detail route must not allocate another audio element");
    assert.equal(libraryRequests.length, 1, "stopping on the detail route must not reload the library");
    await act(async () => {
      history.pushState({}, "", "/music");
      window.dispatchEvent(new Event("fonscape:navigate"));
      mountedRoot.render(createElement(MusicRecord, { entry: seed }));
    });
    await act(async () => document.querySelector('button[aria-label="播放 Album"]').click());
    await waitFor(() => assert.equal(document.querySelector('button[aria-label="暂停 Album"]')?.getAttribute("aria-pressed"), "true"));
    assert.equal(location.pathname, "/music");
    assert.equal(audios.at(-1).paused, false, "playing from the shelf starts audio after an explicit stop");
    assert.equal(audios.at(-1).src, "/audio/1");
    assert.equal(libraryRequests.length, 2);
    await act(async () => {
      history.pushState({}, "", "/posts");
      window.dispatchEvent(new Event("fonscape:navigate"));
    });
    assert.equal(location.pathname, "/posts");
    assert.equal(audios.at(-1).paused, false, "leaving the music section keeps global playback active");
    assert.equal(musicSession.getSnapshot().playing, true);
    assert.equal(document.querySelector('button[aria-label="暂停 Album"]')?.getAttribute("aria-pressed"), "true");
    await act(async () => musicSession.stop());
    assert.equal(audios.at(-1).paused, true);
    assert.equal(audios.at(-1).src, "");
    assert.equal(musicSession.getSnapshot().playing, false);
  } finally {
    if (mountedRoot) {
      await act(async () => mountedRoot.unmount());
      mountedRoot = null;
    }
    musicSession.stop();
    globalThis.Audio = oldAudio;
  }
});

test("music shelf play control toggles playback without navigating and its cover keeps the detail link", async () => {
  installDom("/music");
  await loadApplication();
  const oldAudio = globalThis.Audio;
  const audios = [];
  class AudioFixture {
    constructor(src) { this.src = src; this.paused = true; this.currentTime = 0; this.duration = 90; this.listeners = new Map(); audios.push(this); }
    load() {}
    removeAttribute(name) { if (name === "src") this.src = ""; }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    removeEventListener(name) { this.listeners.delete(name); }
    async play() { this.paused = false; this.listeners.get("play")?.(); }
    pause() { this.paused = true; this.listeners.get("pause")?.(); }
  }
  globalThis.Audio = AudioFixture;
  globalThis.fetch = async (url) => makeResponse(String(url).includes("lyrics")
    ? { lyric: "", translation: "" }
    : { truncated: false, tracks: [1, 2, 3].map((id) => ({ id: String(id), source: "netease", title: `Track ${id}`, artist: `Artist ${id}`, cover: "", src: `/audio/${id}`, lyricUrl: `/lyrics/${id}` })) });
  const [{ MusicRecord }, { musicSession }] = await Promise.all([
    viteServer.ssrLoadModule("/src/components/MusicRecord.tsx"),
    viteServer.ssrLoadModule("/src/musicSession.ts"),
  ]);
  musicSession.stop();
  try {
    const entry = { title: "Album note", sourceTitle: "Album", sourceMeta: "Artist", kind: "专辑", section: "albums", slug: "test-album", date: "2026-10-02", wordCount: 0, firstParagraph: "", image: "/assets/cover.webp", url: "https://music.163.com/album?id=123" };
    mountedRoot = createRoot(document.getElementById("root"));
    await act(async () => mountedRoot.render(createElement(MusicRecord, { entry })));
    const cover = document.querySelector("a.music-record-art");
    assert.equal(cover?.getAttribute("href"), "/music/albums/test-album");
    assert.equal(document.querySelector('button[aria-label="播放 Album"]')?.getAttribute("aria-pressed"), "false");

    await act(async () => document.querySelector('button[aria-label="播放 Album"]').click());
    await waitFor(() => assert.equal(document.querySelector('button[aria-label="暂停 Album"]')?.getAttribute("aria-pressed"), "true"));
    assert.equal(location.pathname, "/music", "playing from the shelf does not open the detail route");
    assert.equal(cover.getAttribute("href"), "/music/albums/test-album");
    await act(async () => musicSession.selectTrack(2));
    await waitFor(() => {
      assert.equal(document.querySelector(".music-record-copy h3")?.textContent, "Track 3");
      assert.equal(document.querySelector(".music-record-copy p")?.textContent, "Artist 3");
    });

    await act(async () => document.querySelector('button[aria-label="暂停 Album"]').click());
    await waitFor(() => {
      assert.equal(document.querySelector('button[aria-label="播放 Album"]')?.getAttribute("aria-pressed"), "false");
      assert.equal(document.querySelector(".music-record-copy h3")?.textContent, "Album");
      assert.equal(document.querySelector(".music-record-copy p")?.textContent, "Artist");
    });
    assert.equal(audios.at(-1).paused, true, "the pause control pauses the audio element");
    assert.equal(location.pathname, "/music");

    await act(async () => document.querySelector('button[aria-label="播放 Album"]').click());
    await waitFor(() => {
      assert.equal(document.querySelector('button[aria-label="暂停 Album"]')?.getAttribute("aria-pressed"), "true");
      assert.equal(document.querySelector(".music-record-copy h3")?.textContent, "Track 3");
      assert.equal(document.querySelector(".music-record-copy p")?.textContent, "Artist 3");
    });
    assert.equal(audios.at(-1).paused, false);
    assert.equal(location.pathname, "/music");
  } finally {
    if (mountedRoot) {
      await act(async () => mountedRoot.unmount());
      mountedRoot = null;
    }
    musicSession.stop();
    globalThis.Audio = oldAudio;
  }
});

test("global music mini player seeks and pauses without discarding its queue", async () => {
  installDom("/music");
  await loadApplication();
  const oldAudioDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Audio");
  const oldFetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  const audios = [];
  class AudioFixture {
    constructor(src) { this.src = src; this.paused = true; this.currentTime = 0; this.duration = 90; this.listeners = new Map(); audios.push(this); }
    load() {}
    removeAttribute(name) { if (name === "src") this.src = ""; }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    removeEventListener(name) { this.listeners.delete(name); }
    async play() { this.paused = false; this.listeners.get("play")?.(); }
    pause() { this.paused = true; this.listeners.get("pause")?.(); }
    emit(name) { this.listeners.get(name)?.(); }
  }
  globalThis.Audio = AudioFixture;
  let trackCount = 1;
  globalThis.fetch = async (url) => makeResponse(String(url).includes("lyrics")
    ? { lyric: "", translation: "" }
    : { truncated: false, tracks: Array.from({ length: trackCount }, (_, index) => ({ id: String(index + 1), source: "netease", title: `Track ${index + 1}`, artist: "Artist", cover: "", src: `/audio/${index + 1}`, lyricUrl: `/lyrics/${index + 1}` })) });
  const [{ MusicMiniPlayer }, { musicSession }] = await Promise.all([
    viteServer.ssrLoadModule("/src/components/MusicMiniPlayer.tsx"),
    viteServer.ssrLoadModule("/src/musicSession.ts"),
  ]);
  await act(async () => musicSession.stop());
  try {
    mountedRoot = createRoot(document.getElementById("root"));
    await act(async () => mountedRoot.render(createElement("div", { className: "main-nav-music" }, createElement("a", { href: "/music" }, "音乐"), createElement(MusicMiniPlayer))));
    const entry = { title: "Album note", sourceTitle: "Album", sourceMeta: "Artist", kind: "专辑", section: "albums", slug: "test-album", date: "2026-10-02", wordCount: 0, firstParagraph: "", image: "https://fonstage.test/cover.jpg", url: "https://music.163.com/album?id=123" };
    await act(async () => musicSession.load(entry));
    const audio = audios.at(-1);
    await act(async () => audio.emit("loadedmetadata"));
    const timeline = document.querySelector('input[aria-label="全局音乐播放进度"]');
    assert.ok(timeline);
    assert.equal(timeline.disabled, false);
    await setInputValue(timeline, "27");
    assert.equal(audio.currentTime, 27);
    assert.equal(musicSession.getSnapshot().time, 27);

    assert.equal(document.querySelector('button[aria-label="关闭全局音乐播放器"]'), null);
    await act(async () => document.querySelector('button[aria-label="暂停全局音乐"]').click());
    assert.equal(audio.paused, true);
    assert.equal(musicSession.getSnapshot().time, 27);
    assert.equal(musicSession.getSnapshot().entry.slug, "test-album");
    assert.ok(document.querySelector(".music-mini-player"));
    await act(async () => document.querySelector('button[aria-label="播放全局音乐"]').click());
    assert.equal(audio.paused, false);
    assert.equal(audios.length, 1, "resume uses the existing audio and position");
    assert.equal(document.querySelector('a[aria-label="查看正在播放的音乐详情"]')?.getAttribute("href"), "/music/albums/test-album");
    assert.equal(document.querySelector(".music-mini-player__mode"), null, "single tracks hide playback-mode selection");
    const volumeToggle = document.querySelector('.music-mini-player__volume button');
    assert.equal(volumeToggle.getAttribute("aria-expanded"), "false");
    await act(async () => volumeToggle.click());
    assert.equal(volumeToggle.getAttribute("aria-expanded"), "true");
    assert.equal(document.querySelector(".music-mini-player__transport").hasAttribute("inert"), true, "expanded volume takes the transport space without leaving hidden controls focusable");
    const volume = document.querySelector('input[aria-label="音乐音量"]');
    await setInputValue(volume, ".37");
    assert.equal(audio.volume, .37);
    await setInputValue(volume, "0");
    assert.equal(audio.volume, 0);
    await setInputValue(volume, "1");
    assert.equal(audio.volume, 1);
    await act(async () => volumeToggle.click());
    assert.equal(volumeToggle.getAttribute("aria-expanded"), "false");
    assert.equal(document.querySelector(".music-mini-player__transport").hasAttribute("inert"), false);
    assert.equal(audio.volume, 1, "collapsing the slider retains the selected volume");
    trackCount = 3;
    await act(async () => musicSession.load(entry));
    await act(async () => document.querySelector('button[aria-label="顺序播放，切换播放模式"]').click());
    assert.equal(musicSession.getSnapshot().repeat, true);
    await act(async () => document.querySelector('button[aria-label="单曲循环，切换播放模式"]').click());
    assert.equal(musicSession.getSnapshot().shuffle, true);
    assert.equal(musicSession.getSnapshot().repeat, false);
    await act(async () => document.querySelector('button[aria-label="随机播放，切换播放模式"]').click());
    assert.equal(musicSession.getSnapshot().shuffle, false);
    const cover = document.querySelector('a[aria-label="查看正在播放的音乐详情"]');
    cover.addEventListener("click", (event) => event.preventDefault(), { once: true });
    await act(async () => cover.click());
    assert.equal(document.querySelector(".music-mini-player__desktop").getAttribute("aria-hidden"), "true", "cover navigation dismisses the mini player");
    await act(async () => document.querySelector(".main-nav-music").dispatchEvent(new Event("pointerleave")));
    assert.equal(document.querySelector(".music-mini-player__desktop").getAttribute("aria-hidden"), "true", "the close-induced pointerleave cannot reopen the player");
    await act(async () => document.querySelector(".main-nav-music>a").dispatchEvent(new Event("pointerenter")));
    assert.equal(document.querySelector(".music-mini-player__desktop").getAttribute("aria-hidden"), null, "a fresh pointer entry can reopen the player");
  } finally {
    await act(async () => musicSession.stop());
    if (oldAudioDescriptor) Object.defineProperty(globalThis, "Audio", oldAudioDescriptor);
    else delete globalThis.Audio;
    if (oldFetchDescriptor) Object.defineProperty(globalThis, "fetch", oldFetchDescriptor);
    else delete globalThis.fetch;
  }
});

test("post URL filters clear on navigation and detail return preserves category and reading position", async () => {
  installDom("/posts?tag=alpha");
  await mountFixture();
  const { go, routeScrollPositions } = await fixtureServer.ssrLoadModule("/src/routeState.ts");
  const titles = () => [...document.querySelectorAll(".article-grid .article-card h2")].map((heading) => heading.textContent);
  await waitFor(() => assert.equal(titles().length, 3));
  for (const query of ["tag=alpha", "series=" + encodeURIComponent("示例系列")]) {
    await act(async () => go("/posts?" + query));
    await waitFor(() => assert.equal(titles().length, 3));
    await act(async () => document.querySelector('nav[aria-label="主导航"] a[href="/posts"]').click());
    await waitFor(() => assert.equal(titles().length, 4));
    assert.equal(document.querySelector(".active-filter-summary"), null);
    assert.equal(location.search, "");
  }
  await traverse("back");
  await waitFor(() => assert.equal(titles().length, 3));
  await act(async () => document.querySelector('.article-type-tabs button[title="记录"]').click());
  await waitFor(() => assert.deepEqual(titles(), ["first", "middle"]));
  let scroll = 360;
  Object.defineProperty(window, "scrollY", { configurable: true, get: () => scroll });
  Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: 2000 });
  window.scrollTo = (options) => { scroll = options.top; };
  const source = location.pathname + location.search;
  await act(async () => document.querySelector('.article-grid a[href="/post/middle"]').click());
  await waitFor(() => assert.equal(document.querySelector(".article-intro-copy h1")?.textContent, "middle"));
  assert.equal(routeScrollPositions.get(source), 360);
  await act(async () => button("返回").click());
  await waitFor(() => assert.deepEqual(titles(), ["first", "middle"]));
  await waitFor(() => assert.equal(scroll, 360));
  assert.equal(location.pathname + location.search, source);
  assert.equal(document.querySelector('.article-type-tabs [aria-selected="true"]')?.textContent, "记录");
  await act(async () => button("文章归档").click());
  await waitFor(() => assert.ok(document.querySelector(".article-index--archive")));
  assert.equal(location.search, "?view=archive");
  await act(async () => document.querySelector('nav[aria-label="主导航"] a[href="/posts"]').click());
  await waitFor(() => assert.ok(document.querySelector(".article-grid")));
  assert.equal(location.search, "");
});

test("series navigation uses generated facets for the current chapter and both boundaries", async () => {
  installDom("/post/middle");
  await mountFixture();
  await waitFor(() => assert.equal(document.querySelector(".series-navigation em")?.textContent, "2 / 3"));
  assert.equal(document.querySelector(".series-navigation a:first-child")?.getAttribute("href"), "/post/first");
  assert.equal(document.querySelector(".series-navigation a:last-child")?.getAttribute("href"), "/post/last");
  await act(async () => document.querySelector('.series-navigation a[href="/post/first"]').click());
  await waitFor(() => assert.equal(document.querySelector(".series-navigation em")?.textContent, "1 / 3"));
  assert.match(document.querySelector(".series-navigation .is-disabled")?.textContent, /这是第一章/u);
  await act(async () => document.querySelector('.series-navigation a[href="/post/middle"]').click());
  await waitFor(() => assert.equal(document.querySelector(".series-navigation em")?.textContent, "2 / 3"));
  await act(async () => document.querySelector('.series-navigation a[href="/post/last"]').click());
  await waitFor(() => assert.equal(document.querySelector(".series-navigation em")?.textContent, "3 / 3"));
  assert.match(document.querySelector(".series-navigation .is-disabled")?.textContent, /已经读到最后/u);
});

test("a published comment updates the article card count after returning to the list", async () => {
  installDom("/posts");
  let comments = [];
  await mountFixture({ handleApi: (url, options) => {
    if (url.pathname !== "/api/comments") return undefined;
    if (options.method === "POST") {
      const created = commentFixture("new-comment", { body: JSON.parse(options.body).body });
      comments = [created];
      return Response.json({ comment: created }, { status: 201 });
    }
    return Response.json({ comments, total: comments.length, page: 1, pageSize: 20, totalPages: 1 });
  } });
  const card = () => document.querySelector('.article-grid a[href="/post/first"]');
  const cardComments = () => [...(card()?.querySelectorAll(".post-meta > span") || [])].at(3)?.textContent?.trim();
  await waitFor(() => assert.equal(cardComments(), "0"));
  await act(async () => card().click());
  await waitFor(() => assert.equal(document.querySelector(".article-intro-copy h1")?.textContent, "first"));
  const field = await waitFor(() => {
    const item = document.querySelector(".comment-composer textarea");
    assert.ok(item);
    return item;
  });
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(field, "新的评论");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => document.querySelector(".comment-composer").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await waitFor(() => assert.match(document.querySelector(".comments-heading")?.textContent || "", /1 条评论/u));
  await act(async () => button("返回").click());
  await waitFor(() => assert.equal(cardComments(), "1"));
});

test("collapsed replies toggle the inert boundary along with their expansion state", async () => {
  installDom("/friends");
  const comments = [commentFixture("parent"), commentFixture("reply-1", { parentId: "parent" }), commentFixture("reply-2", { parentId: "parent" })];
  await mountFixture({ handleApi: (url) => url.pathname === "/api/comments" ? Response.json({ comments, total: 3, page: 1, pageSize: 20, totalPages: 1 }) : undefined });
  await waitFor(() => assert.ok(document.querySelector(".comment-replies-extra")));
  const replies = document.querySelector(".comment-replies-extra");
  assert.equal(replies.hasAttribute("inert"), true, "hidden reply controls must be excluded from keyboard focus");
  assert.equal(replies.getAttribute("aria-hidden"), "true");
  await act(async () => document.querySelector(".comment-replies-toggle").click());
  assert.equal(replies.hasAttribute("inert"), false);
  assert.equal(replies.getAttribute("aria-hidden"), "false");
  await act(async () => document.querySelector(".comment-replies-toggle").click());
  assert.equal(replies.hasAttribute("inert"), true);
});

test("account messages refresh on reopening and invalidate after writes without accepting late stale responses", async () => {
  installDom("/friends");
  let comments = [commentFixture("cached", { contentType: "post", contentSlug: "site-friends" })];
  let deferComments = false;
  let failComments = false;
  let finishComments;
  let finishFailedComments;
  let commentRequests = 0;
  await mountFixture({ handleApi: (url, options) => {
    if (url.pathname === "/api/me/comments") {
      commentRequests += 1;
      if (failComments) {
        return new Promise((resolve) => { finishFailedComments = resolve; });
      }
      if (deferComments) return new Promise((resolve) => { finishComments = resolve; });
      return Response.json({ comments });
    }
    if (url.pathname === "/api/auth/logout") return Response.json({ ok: true });
    if (url.pathname.startsWith("/api/comments/") && options.method === "DELETE") {
      comments = comments.map((item) => item.id === url.pathname.split("/").at(-1) ? { ...item, status: "deleted" } : item);
      return Response.json({ ok: true });
    }
    if (url.pathname !== "/api/comments") return undefined;
    if (options.method === "POST") {
      const created = commentFixture("created", { body: JSON.parse(options.body).body, contentType: "post", contentSlug: "site-friends" });
      comments = [created, ...comments];
      return Response.json({ comment: created }, { status: 201 });
    }
    const published = comments.filter((item) => item.status === "published");
    return Response.json({ comments: published, total: published.length, page: 1, pageSize: 20, totalPages: 1 });
  } });
  const data = await fixtureServer.ssrLoadModule("/src/community/accountData.ts");
  const openMessages = async () => {
    await act(async () => document.querySelector(".account-nav-button").click());
    await waitFor(() => assert.ok(document.querySelector(".account-profile-form")));
    await act(async () => button("我的消息").click());
    await waitFor(() => assert.ok(document.querySelector(".account-comment-list")));
  };
  const close = async () => {
    const callbacks = [];
    const originalSetTimeout = window.setTimeout;
    const originalClearTimeout = window.clearTimeout;
    window.setTimeout = (callback, delay, ...args) => delay === 240 ? (callbacks.push(callback), -1) : originalSetTimeout(callback, delay, ...args);
    window.clearTimeout = (id) => { if (id !== -1) originalClearTimeout(id); };
    try {
      await act(async () => document.querySelector('.account-dialog [aria-label="关闭"]').click());
      assert.equal(callbacks.length, 1);
      await act(async () => callbacks[0]());
      assert.equal(document.querySelector(".account-dialog"), null);
    } finally {
      window.setTimeout = originalSetTimeout;
      window.clearTimeout = originalClearTimeout;
    }
  };  await waitFor(() => assert.ok(document.querySelector(".comment-composer textarea")));
  await openMessages();
  await close();
  const field = document.querySelector(".comment-composer textarea");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(field, "new message");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => document.querySelector(".comment-composer").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await waitFor(() => assert.equal(comments.length, 2));
  assert.equal(data.cachedMyComments(member.id), undefined, "a successful POST must invalidate account messages");
  await openMessages();
  await waitFor(() => assert.match(document.querySelector(".account-comment-list").textContent, /new message/u));
  await close();
  const remove = [...document.querySelectorAll("#comment-created button")].find((item) => item.textContent === "删除");
  assert.ok(remove);
  await act(async () => remove.click());
  await act(async () => remove.click());
  await waitFor(() => assert.equal(comments[0].status, "deleted"));
  assert.equal(data.cachedMyComments(member.id), undefined, "a successful DELETE must invalidate account messages");
  await openMessages();
  await waitFor(() => assert.ok(document.querySelector(".account-comment-list .comment-state--deleted")));
  await close();

  comments = [commentFixture("remote", { contentType: "post", contentSlug: "site-friends" }), ...comments];
  deferComments = true;
  const beforeRefresh = commentRequests;
  await openMessages();
  assert.doesNotMatch(document.querySelector(".account-comment-list").textContent, /remote/u, "cached messages remain usable while the refresh is pending");
  assert.equal(commentRequests, beforeRefresh + 1, "prefetch and message tab must share the pending refresh");
  deferComments = false;
  await act(async () => finishComments(Response.json({ comments })));
  await waitFor(() => assert.match(document.querySelector(".account-comment-list").textContent, /remote/u));
  await close();

  deferComments = true;
  const stale = data.loadMyComments(member.id, true);
  data.invalidateAccountData();
  deferComments = false;
  const fresh = await data.loadMyComments(member.id, true);
  finishComments(Response.json({ comments: [comments.at(-1)] }));
  await stale;
  assert.equal(data.cachedMyComments(member.id), fresh, "an invalidated request cannot overwrite the newer cache");
  await openMessages();
  await close();

  failComments = true;
  const beforeFailedRefresh = commentRequests;
  await openMessages();
  await waitFor(() => assert.ok(commentRequests > beforeFailedRefresh));
  await waitFor(() => assert.equal(typeof finishFailedComments, "function"));
  const failedRefresh = data.loadMyComments(member.id, true);
  await act(async () => {
    finishFailedComments(Response.json({ error: "temporary failure", code: "temporary_failure" }, { status: 503 }));
    await failedRefresh.then(() => assert.fail("the injected refresh must reject"), () => undefined);
  });
  const retainedMessages = document.querySelector(".account-comment-list");
  assert.ok(retainedMessages, "a failed refresh must leave the previously loaded message list visible");
  assert.match(retainedMessages.textContent, /remote/u);
  assert.equal(document.querySelector(".account-tab-panel .community-inline-error"), null, "a failed refresh must not replace messages that were loaded successfully");

  await act(async () => button("退出登录").click());
  assert.equal(data.cachedMyComments(member.id), undefined, "logout clears account data");
});

test("the admin setup route renders its frame without the public shell", async () => {
  const { document } = installDom();
  installFetch();
  await mountApp();

  await waitFor(() => {
    assert.equal(document.querySelector("h1")?.textContent, "创建管理员");
  });

  assert.ok(document.querySelector("main.admin-setup-page > section.admin-setup-panel"));
  assert.equal(document.querySelector(".site-header"), null);
  assert.equal(document.querySelector("footer"), null);
  assert.equal(document.querySelector('nav[aria-label="主导航"]'), null);

  const token = document.querySelector("#admin-setup-token");
  assert.ok(token);
  assert.equal(token.type, "text");
  assert.equal(token.value, "");
  assert.equal(token.hasAttribute("hidden"), false);
});

test("the password control toggles visibility while retaining the entered value", async () => {
  const { document } = installDom();
  installFetch();
  await mountApp();
  await waitFor(() => assert.equal(document.querySelector("#admin-setup-password")?.type, "password"));

  const password = document.querySelector("#admin-setup-password");
  const visibilityButton = document.querySelector(".password-visibility-button");
  await setInputValue(password, "secret1");
  assert.equal(password.value, "secret1");
  assert.equal(visibilityButton.getAttribute("aria-label"), "显示密码");

  await act(async () => visibilityButton.click());
  assert.equal(password.type, "text");
  assert.equal(password.value, "secret1");
  assert.equal(visibilityButton.getAttribute("aria-label"), "隐藏密码");
  assert.equal(visibilityButton.getAttribute("aria-pressed"), "true");

  await act(async () => visibilityButton.click());
  assert.equal(password.type, "password");
  assert.equal(visibilityButton.getAttribute("aria-label"), "显示密码");
  assert.equal(visibilityButton.getAttribute("aria-pressed"), "false");
});

test("an asynchronous setup status failure is shown in the form", async () => {
  const { document } = installDom();
  installFetch({ setup: { status: 503, payload: { error: "初始化服务暂时不可用" } } });
  await mountApp();

  await waitFor(() => {
    const error = document.querySelector('[role="alert"]');
    assert.ok(error);
    assert.match(error.textContent, /初始化服务暂时不可用/u);
  });
  assert.ok(document.querySelector("#admin-setup-token"));
});

test("an already initialized site redirects away from setup", async () => {
  const { document, replaceCalls } = installDom();
  installFetch({ setup: { initialized: true } });
  await mountApp();

  await waitFor(() => {
    if (!replaceCalls.includes("/")) throw new Error(`redirect calls: ${JSON.stringify(replaceCalls)}; body: ${document.body.textContent}`);
  });
});

test("anonymous account access remains available while content search is stalled", async () => {
  const restoreSearchChunks = await enableSearchChunks();
  const { document } = installDom("/");
  const requests = installFetch({ search: "stall" });
  try {
    await mountApp();
    const accountButton = await waitFor(() => document.querySelector(".account-nav-button"));
    await act(async () => accountButton.click());
    await waitFor(() => assert.equal(document.querySelector(".account-auth-head h2")?.textContent, "欢迎回来"));
    assert.deepEqual(requests.filter((path) => path.includes("/fonscape/content/search/")), [], "anonymous login must not request collection titles");
    const dialog = document.querySelector('[role="dialog"]');
    const closeCallbacks = [];
    const originalSetTimeout = window.setTimeout;
    const originalClearTimeout = window.clearTimeout;
    window.setTimeout = (callback, delay, ...args) => {
      if (delay === 240) { closeCallbacks.push(callback); return -1; }
      return originalSetTimeout(callback, delay, ...args);
    };
    window.clearTimeout = (id) => { if (id !== -1) originalClearTimeout(id); };
    try {
      await act(async () => dialog.querySelector('button[aria-label="关闭"]').click());
      assert.equal(document.querySelector('[role="dialog"]'), dialog, "close retains the same dialog container during its animation");
      assert.ok(dialog.parentElement.classList.contains("is-closing"));
      assert.equal(closeCallbacks.length, 1, "the existing 240 ms close timer must own removal");
      await act(async () => closeCallbacks[0]());
      assert.equal(document.querySelector('[role="dialog"]'), null);
    } finally {
      window.setTimeout = originalSetTimeout;
      window.clearTimeout = originalClearTimeout;
    }
  } finally {
    restoreSearchChunks();
  }
});

test("search index errors stay in the dialog and retry with a fresh request", async () => {
  const restoreSearchChunks = await enableSearchChunks();
  const enabledTypeCount = getEnabledCollectionTypes(communityOnConfig).length;
  const { document } = installDom("/");
  const requests = installFetch({ search: "fail-once" });
  try {
    await mountApp();
    await waitFor(() => document.querySelector('button[aria-label="打开搜索"]'));
    await act(async () => document.querySelector('button[aria-label="打开搜索"]').click());
    await waitFor(() => assert.ok(document.querySelector(".search-load-error")));
    assert.ok(document.querySelector(".search-dialog"), "the dialog remains mounted around its content error");
    assert.equal(document.querySelector(".app-error-boundary"), null, "search failure does not replace the application");
    assert.equal(requests.filter((path) => path.includes("/fonscape/content/search/")).length, enabledTypeCount);

    await act(async () => document.querySelector(".search-load-error button").click());
    await waitFor(() => assert.equal(document.querySelector(".no-results")?.textContent, "没有找到相关内容，换个词试试。"));
    assert.equal(requests.filter((path) => path.includes("/fonscape/content/search/")).length, enabledTypeCount + 1, "retry starts a fresh request for the failed collection index");
  } finally {
    restoreSearchChunks();
  }
});

test("signed-in profile opens without title requests and message tab remains available", async () => {
  const restoreSearchChunks = await enableSearchChunks();
  const { document } = installDom("/");
  const requests = installFetch({ session: { user: member } });
  try {
    await mountApp();
    const accountButton = await waitFor(() => document.querySelector(".account-nav-button"));
    await act(async () => accountButton.click());
    await waitFor(() => assert.ok(document.querySelector(".account-profile-form")));
    assert.deepEqual(requests.filter((path) => path.includes("/fonscape/content/search/")), [], "profile fields do not need article titles");

    const messagesTab = [...document.querySelectorAll('.account-mode-tabs [role="tab"]')].find((button) => button.textContent === "我的消息");
    await act(async () => messagesTab.click());
    await waitFor(() => assert.ok(document.querySelector('.account-tab-panel .community-inline-error, .account-tab-panel .account-empty')));
    assert.equal(messagesTab.getAttribute("aria-selected"), "true");
    const enabledTypes = getEnabledCollectionTypes(communityOnConfig);
    assert.ok(requests.filter((path) => path.includes("/fonscape/content/search/")).every((path) => enabledTypes.some((type) => path.includes(`/search/${type}/`))), "hidden collection indexes remain unused");
  } finally {
    restoreSearchChunks();
  }
});

test("navigation loads content on press and commits the target hero while content is pending", async () => {
  const { contentManifest } = await viteServer.ssrLoadModule("/functions/_generated/content-metadata.js");
  const descriptor = contentManifest.collections.post;
  const previous = descriptor.pageChunkCount;
  descriptor.pageChunkCount = 1;
  const { document } = installDom("/");
  const requests = installFetch({ posts: "stall" });
  try {
    await mountApp();
    const link = await waitFor(() => document.querySelector('nav[aria-label="主导航"] a[href="/posts"]'));
    await act(async () => link.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })));
    assert.equal(requests.filter((path) => path.includes("/content/pages/post/")).length, 0, "hover must not start a collection content request");
    await act(async () => link.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    await waitFor(() => assert.equal(requests.filter((path) => path.includes("/content/pages/post/")).length, 1));
    await act(async () => link.click());
    assert.equal(window.location.pathname, "/posts");
    assert.equal(document.querySelector(".inner-hero h1")?.textContent, "文章");
    assert.ok(link.classList.contains("active"));
    assert.equal(document.querySelector(".app-error-boundary"), null);
  } finally {
    descriptor.pageChunkCount = previous;
  }
});

test("community-off configuration hides community entry points and retires setup", async () => {
  fixtureServer = await createServer({
    root: fileURLToPath(sourceRoot),
    configFile: false,
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
    esbuild: { jsx: "automatic" },
    plugins: [configFixturePlugin(communityOffConfig)],
    server: { middlewareMode: true, ws: false, watch: null },
  });
  const { document } = installDom("/admin/setup");
  const requests = installFetch();
  await mountApp(fixtureServer);

  await waitFor(() => {
    assert.equal(window.location.pathname, "/");
    assert.ok(document.querySelector("main.home-page"));
  });
  assert.equal(document.querySelector(".admin-setup-page"), null);
  assert.equal(document.querySelector(".account-nav-button"), null);
  assert.equal(document.querySelector('nav[aria-label="主导航"] a[href="/friends"]'), null);
  assert.equal(requests.includes("/api/auth/session"), false, "disabled community does not request an account session");
});
