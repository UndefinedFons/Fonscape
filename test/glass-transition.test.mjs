import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("global glass keeps expensive backdrop properties stable while opacity transitions", async () => {
  const [app, styles] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
  const backdropRule = styles.match(/\.global-glass-backdrop\s*\{(?<body>[^}]+)\}/u)?.groups?.body || "";
  const enabledRule = styles.match(/:root\[data-glass="on"\] \.global-glass-backdrop\s*\{(?<body>[^}]+)\}/u)?.groups?.body || "";

  assert.match(backdropRule, /filter:var\(--glass-background-filter,none\)/u);
  assert.match(backdropRule, /transform:var\(--glass-background-transform,translateZ\(0\)\)/u);
  assert.match(enabledRule, /opacity:var\(--glass-image-opacity\)/u);
  assert.doesNotMatch(enabledRule, /(?:filter|transform):/u);
  assert.match(app, /dataset\.glassTransition = glassTransition/u);
  assert.match(styles, /data-glass-transition="off"[^}]+animation:global-glass-out \.56s/u);
  assert.match(styles, /@keyframes global-glass-out \{ from \{ opacity:1; \} to \{ opacity:0; \} \}/u);
  assert.match(styles, /inset:-16px;[^}]+transform:var\(--glass-background-transform,translate3d\(0,0,0\)\)/u);
});

test("home backgrounds remain transparent overlays during glass transitions", async () => {
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const refreshRule = styles.match(/\.home-refresh-page\s*\{(?<body>[^}]+)\}/u)?.groups?.body || "";
  const dashboardRule = styles.match(/\.home-dashboard-page\s*\{(?<body>[^}]+)\}/u)?.groups?.body || "";
  const dashboardBodyRule = styles.match(/\.home-dashboard-body\s*\{(?<body>[^}]+)\}/u)?.groups?.body || "";

  assert.doesNotMatch(refreshRule, /var\(--bg\)/u);
  assert.match(dashboardRule, /background:transparent/u);
  assert.doesNotMatch(dashboardBodyRule, /var\(--bg\)/u);
});
