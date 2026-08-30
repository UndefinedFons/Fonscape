import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
