import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("global glass keeps backdrop sampling stable while opacity transitions", async () => {
  const [app, styles] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
  const backdropRule = styles.match(/\.global-glass-backdrop\s*\{(?<body>[^}]+)\}/u)?.groups?.body || "";
  const enabledRule = styles.match(/:root\[data-glass="on"\] \.global-glass-backdrop\s*\{(?<body>[^}]+)\}/u)?.groups?.body || "";

  assert.match(backdropRule, /filter:var\(--glass-background-filter,none\)/u);
  assert.match(backdropRule, /transform:var\(--glass-background-transform,none\)/u);
  assert.match(enabledRule, /opacity:var\(--glass-image-opacity\)/u);
  assert.doesNotMatch(enabledRule, /(?:filter|transform):/u);
  assert.match(app, /dataset\.glassTransition = glassTransition/u);
});

test("the current home background remains an overlay during glass transitions", async () => {
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const refreshRule = styles.match(/\.home-refresh-page\s*\{(?<body>[^}]+)\}/u)?.groups?.body || "";

  assert.notEqual(refreshRule, "");
  assert.doesNotMatch(refreshRule, /var\(--bg\)/u);
});
