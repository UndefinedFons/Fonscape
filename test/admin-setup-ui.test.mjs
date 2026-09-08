import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createServer } from "vite";

const sourceRoot = new URL("../", import.meta.url);

let viteServer;
let createRoot;
let App;
let CommunityProvider;
let mountedRoot;
let restoreDom;

test.before(async () => {
  viteServer = await createServer({
    root: fileURLToPath(sourceRoot),
    configFile: false,
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
    esbuild: { jsx: "automatic" },
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

function installDom(path = "/admin/setup") {
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

  const stylesheet = jsdom.window.document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "/fonscape/google-fonts-full.css";
  Object.defineProperty(stylesheet, "sheet", { configurable: true, value: {} });
  jsdom.window.document.head.append(stylesheet);

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
    Node: jsdom.window.Node,
    Event: jsdom.window.Event,
    MouseEvent: jsdom.window.MouseEvent,
    CustomEvent: jsdom.window.CustomEvent,
    KeyboardEvent: jsdom.window.KeyboardEvent,
    MutationObserver: jsdom.window.MutationObserver,
    ResizeObserver: resizeObserver,
    Image: jsdom.window.Image,
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

function installFetch({ setup = { initialized: false }, session = { user: null } } = {}) {
  globalThis.fetch = async (input, options = {}) => {
    const requestUrl = new URL(typeof input === "string" ? input : input.url, "https://fonstage.test");
    if (requestUrl.pathname === "/api/auth/session") return makeResponse(session);
    if (requestUrl.pathname === "/api/admin/setup") {
      if (typeof setup === "function") return setup(options);
      return setup instanceof Error ? Promise.reject(setup) : makeResponse(setup.payload ?? setup, setup.status ?? 200);
    }
    if (requestUrl.pathname === "/api/site/runtime") return makeResponse({ launchedAt: Date.now() });
    return makeResponse({ error: "not found" }, 404);
  };
}

async function loadApplication() {
  if (!createRoot) ({ createRoot } = await import("react-dom/client"));
  if (!App) ({ App } = await viteServer.ssrLoadModule("/src/App.jsx"));
  if (!CommunityProvider) ({ CommunityProvider } = await viteServer.ssrLoadModule("/src/community/CommunityProvider.jsx"));
}

async function mountApp() {
  await loadApplication();
  mountedRoot = createRoot(document.getElementById("root"));
  await act(async () => {
    mountedRoot.render(createElement(CommunityProvider, null, createElement(App)));
  });
}

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
