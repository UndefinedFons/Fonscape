import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("channels resolve accessible links from configured addresses", async () => {
  const server = await createServer({
    configFile: false,
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
    esbuild: { jsx: "automatic" },
    server: { middlewareMode: true, ws: false, watch: null },
  });
  try {
    const { resolveChannels } = await server.ssrLoadModule("/src/pages/AboutPage.jsx");
    const [email] = resolveChannels({ channels: { email: { address: " hello@example.com " } } });
    assert.equal(email.ariaLabel, "发送邮件至 hello@example.com");
    assert.equal(email.href, "mailto:hello@example.com");
    for (const email of [undefined, {}, { address: " " }]) {
      assert.deepEqual(resolveChannels({ channels: { email } }), []);
    }
    const [github] = resolveChannels({ name: "Fons", channels: { github: { url: "https://github.com/name" } } });
    assert.equal(github.ariaLabel, "访问 Fons 的 GITHUB 主页");
    assert.equal(github.href, "https://github.com/name");
  } finally {
    await server.close();
  }
});

test("profile layout keeps a generous comparable-height range before becoming sticky", async () => {
  const server = await createServer({
    configFile: false,
    appType: "custom",
    server: { middlewareMode: true },
  });
  try {
    const { shouldUseStickyProfileLayout } = await server.ssrLoadModule("/src/pages/AboutPage.jsx");
    assert.equal(shouldUseStickyProfileLayout(539, 640), false);
    assert.equal(shouldUseStickyProfileLayout(500, 680), false);
    assert.equal(shouldUseStickyProfileLayout(500, 681), true);
    assert.equal(shouldUseStickyProfileLayout(800, 1024), false);
    assert.equal(shouldUseStickyProfileLayout(800, 1025), true);
  } finally {
    await server.close();
  }
});
