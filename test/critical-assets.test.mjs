import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { applySiteMetadata, localizeGoogleFontStylesheet } from "../vite.config.mjs";

test("homepage embeds critical local fonts without requesting the remote or full catalog", async () => {
  const index = await readFile("index.html", "utf8");
  const criticalFontCss = await readFile("public/fonscape/google-fonts.css", "utf8");
  const document = new JSDOM(localizeGoogleFontStylesheet(index)).window.document;

  const inlineStyles = document.querySelectorAll("style[data-fonscape-critical-fonts]");
  assert.equal(inlineStyles.length, 1);
  assert.equal(inlineStyles[0].textContent, criticalFontCss);
  assert.equal(document.querySelector('link[href*="fonts.googleapis.com"]'), null);
  assert.equal(document.querySelector('link[href*="google-fonts-full.css"]'), null);
});

test("site metadata is escaped and applied as document values", async () => {
  const description = 'A $& $1 <small> site "description"';
  const html = await readFile("index.html", "utf8");
  const document = new JSDOM(applySiteMetadata(html, {
    language: "en",
    title: "Notes $& $1 & ideas",
    description,
  })).window.document;

  assert.equal(document.documentElement.lang, "en");
  assert.equal(document.title, "Notes $& $1 & ideas");
  assert.equal(document.querySelector('meta[name="description"]').content, description);
  assert.equal(document.querySelector("small"), null, "metadata stays text instead of becoming markup");
});
