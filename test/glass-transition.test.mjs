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
  assert.match(backdropRule, /transform:var\(--glass-background-transform,none\)/u);
  assert.match(enabledRule, /opacity:var\(--glass-image-opacity\)/u);
  assert.doesNotMatch(enabledRule, /(?:filter|transform):/u);
  assert.match(app, /dataset\.glassTransition = glassTransition/u);
  assert.match(styles, /data-glass-transition="off"[^}]+animation:global-glass-out \.56s/u);
  assert.match(styles, /@keyframes global-glass-out \{ from \{ opacity:1; \} to \{ opacity:0; \} \}/u);
  assert.match(app, /needsSoftening \? "scale\(1\.04\)" : "none"/u);
  assert.match(styles, /inset:-16px -16px auto;[^}]+height:calc\(100lvh \+ 32px\);[^}]+transform:var\(--glass-background-transform,none\)/u);
  assert.match(styles, /:root\[data-glass-transition\][^{]+\{\s*will-change:opacity;/u);
});

test("the current home background remains an overlay during glass transitions", async () => {
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const refreshRule = styles.match(/\.home-refresh-page\s*\{(?<body>[^}]+)\}/u)?.groups?.body || "";

  assert.notEqual(refreshRule, "");
  assert.doesNotMatch(refreshRule, /var\(--bg\)/u);
});

test("the stylesheet keeps only the active home layout generation", async () => {
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  for (const activeSelector of [".home-refresh-page", ".home-refresh-feature", ".home-refresh-section"]) {
    assert.match(styles, new RegExp(`\\${activeSelector}\\b`, "u"));
  }

  for (const retiredSelector of [
    ".home-dashboard",
    ".home-stage",
    ".home-canvas",
    ".home-editorial",
    ".home-grid",
    ".post-row",
    ".tags-layout",
  ]) {
    assert.doesNotMatch(styles, new RegExp(`\\${retiredSelector}\\b`, "u"));
  }
});
