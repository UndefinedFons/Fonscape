import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

test("the application error fallback renders a recoverable interface", async () => {
  const server = await createServer({
    configFile: false,
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
    esbuild: { jsx: "automatic" },
    server: { middlewareMode: true, ws: false, watch: null },
  });
  try {
    const { AppErrorBoundary, AppErrorFallback } = await server.ssrLoadModule("/src/components/AppErrorBoundary.jsx");
    const html = renderToStaticMarkup(createElement(AppErrorFallback));
    assert.match(html, /role="alert"/u);
    assert.match(html, /页面暂时无法显示/u);
    assert.match(html, /重新加载/u);
    assert.deepEqual(AppErrorBoundary.getDerivedStateFromError(new Error("render failed")), { failed: true });
  } finally {
    await server.close();
  }
});

test("a route content request failure stays inside the route and can be retried", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://fonscape.test/posts" });
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");
  const previousActEnvironment = Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  const previousConsoleError = console.error;
  console.error = () => {};
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });

  const server = await createServer({
    configFile: false,
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
    esbuild: { jsx: "automatic" },
    server: { middlewareMode: true, ws: false, watch: null },
  });
  let root;
  try {
    const { RouteErrorBoundary } = await server.ssrLoadModule("/src/components/AppErrorBoundary.jsx");
    let attempts = 0;
    function TransientContent() {
      const [state, setState] = useState({ value: "", error: null });
      useEffect(() => {
        attempts += 1;
        const request = attempts === 1
          ? Promise.reject(new Error("temporary network failure"))
          : Promise.resolve("恢复后的文章内容");
        request.then((value) => setState({ value, error: null })).catch((error) => setState({ value: "", error }));
      }, []);
      if (state.error) throw state.error;
      return createElement("p", null, state.value || "正在加载内容");
    }

    root = createRoot(document.getElementById("root"));
    await act(async () => {
      root.render(createElement("main", { className: "route-shell" },
        createElement(RouteErrorBoundary, null, createElement(TransientContent))));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const routeShell = document.querySelector(".route-shell");
    const retryPanel = routeShell.querySelector(".route-load-error[role=alert]");
    assert.ok(retryPanel, "the route displays its own retry state");
    assert.equal(document.querySelector(".app-error-boundary"), null, "a route request does not replace the application");
    assert.equal(routeShell.querySelector("button")?.textContent, "重试");

    await act(async () => {
      routeShell.querySelector("button").click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    assert.equal(routeShell.textContent, "恢复后的文章内容");
    assert.equal(attempts, 2, "retry performs a fresh content request");
  } finally {
    if (root) await act(async () => root.unmount());
    await server.close();
    dom.window.close();
    console.error = previousConsoleError;
    for (const [key, descriptor] of [["window", previousWindow], ["document", previousDocument], ["HTMLElement", previousHTMLElement], ["IS_REACT_ACT_ENVIRONMENT", previousActEnvironment]]) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
