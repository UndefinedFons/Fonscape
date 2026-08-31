import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("email channels display their address and hide when it is absent", async () => {
  const server = await createServer({
    configFile: false,
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
    esbuild: { jsx: "automatic" },
    server: { middlewareMode: true, ws: false, watch: null },
  });
  try {
    const { resolveChannels } = await server.ssrLoadModule("/src/pages/AboutPage.jsx");
    for (const email of [
      { address: " hello@example.com " },
      { address: " hello@example.com ", label: "Custom name" },
    ]) {
      const [channel] = resolveChannels({ channels: { email } });
      assert.equal(channel.label, "hello@example.com");
      assert.equal(channel.href, "mailto:hello@example.com");
    }
    for (const email of [undefined, {}, { address: " " }, { label: "Custom name" }]) {
      assert.deepEqual(resolveChannels({ channels: { email } }), []);
    }
    const [github] = resolveChannels({ channels: { github: { label: " @name ", url: "https://github.com/name" } } });
    assert.equal(github.label, "@name");
    assert.equal(github.href, "https://github.com/name");
  } finally {
    await server.close();
  }
});
