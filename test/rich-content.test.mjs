import assert from "node:assert/strict";
import test from "node:test";
import { getPostMarkdown } from "../src/richContent.ts";

test("rich content uses the Markdown content field as its only source", () => {
  assert.equal(getPostMarkdown({ content: "  # 正文\n" }), "# 正文");
  assert.equal(getPostMarkdown({ body: ["旧格式正文"] }), "");
  assert.equal(getPostMarkdown({}), "");
});

test("Mermaid SVG strips executable markup and disguised link protocols", async () => {
  const { JSDOM } = await import("jsdom");
  const { sanitizeMermaidSvg } = await import("../src/content/mermaidSvg.ts");
  const dom = new JSDOM("");
  const previous = globalThis.window;
  globalThis.window = dom.window;
  try {
    const svg = sanitizeMermaidSvg(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <script>alert(1)</script><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">unsafe</div></foreignObject>
      <rect ONLOAD="alert(1)"/><a href="java&#x9;script:alert(1)"><text>one</text></a>
      <a xlink:href="java&#xA;script:alert(1)"><text>two</text></a>
      <a href="data:text/html,test"><text>three</text></a>
      <a href="#node"><text>safe</text></a>
    </svg>`);
    const container = dom.window.document.createElement("div");
    container.innerHTML = svg;
    assert.equal(container.querySelector("script, foreignObject"), null);
    assert.equal(container.querySelector("rect").hasAttribute("onload"), false);
    const links = [...container.querySelectorAll("a")];
    assert.deepEqual(links.map((link) => link.getAttribute("href")), [null, null, null, "#node"]);
    assert.equal(links[1].getAttribute("xlink:href"), null);
    assert.equal(container.textContent.includes("safe"), true);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
    dom.window.close();
  }
});

test("Mermaid SVG retains diagram styling, geometry and safe references", async () => {
  const { JSDOM } = await import("jsdom");
  const { sanitizeMermaidSvg } = await import("../src/content/mermaidSvg.ts");
  const dom = new JSDOM("");
  const previous = globalThis.window;
  globalThis.window = dom.window;
  try {
    const svg = sanitizeMermaidSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">
      <style>.node { fill: #ad467c; }</style><defs><marker id="arrow"><path d="M0 0L1 1"/></marker></defs>
      <g class="node"><rect class="basic label-container" width="80" height="40"/><text>中文标签</text></g>
      <rect class="actor actor-top" rx="12" ry="12"/><path marker-end="url(#arrow)" d="M0 0L30 30"/>
    </svg>`);
    const container = dom.window.document.createElement("div");
    container.innerHTML = svg;
    const root = container.querySelector("svg");
    assert.equal(root.getAttribute("width"), "320");
    assert.equal(root.getAttribute("height"), "180");
    assert.equal(root.style.width, "320px");
    assert.equal(root.style.maxWidth, "none");
    assert.equal(root.style.height, "auto");
    assert.equal(root.querySelector("g rect").getAttribute("rx"), "8");
    assert.equal(root.querySelector("g rect").getAttribute("ry"), "8");
    assert.equal(root.querySelector("rect.actor").getAttribute("rx"), "12");
    assert.equal(root.querySelector("style").textContent, ".node { fill: #ad467c; }");
    assert.equal(root.querySelector("path[marker-end]").getAttribute("marker-end"), "url(#arrow)");
    assert.equal(root.querySelector("text").textContent, "中文标签");
    for (const invalid of [undefined, 123, "<svg>", "<div/>", '<svg xmlns="http://www.w3.org/1999/xhtml"/>']) {
      assert.equal(sanitizeMermaidSvg(invalid), "");
    }
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
    dom.window.close();
  }
});
