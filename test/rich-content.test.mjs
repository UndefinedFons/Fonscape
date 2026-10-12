import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { parsePost } from "../src/content/frontmatter.ts";
import { createServer } from "vite";
import { getPostMarkdown } from "../src/richContent.ts";

test("rich content uses the Markdown content field as its only source", () => {
  assert.equal(getPostMarkdown({ content: "  # 正文\n" }), "# 正文");
  assert.equal(getPostMarkdown({ body: ["旧格式正文"] }), "");
  assert.equal(getPostMarkdown({}), "");
});

test("Mermaid labels retain formulas and mixed multiline text through the SVG sanitizer", async () => {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true });
  const originals = new Map();
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    SVGElement: dom.window.SVGElement, CSSStyleSheet: dom.window.CSSStyleSheet,
    MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  // JSDOM has no SVG layout; the contract here is formula output, not geometry.
  dom.window.SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 100, height: 40 });
  dom.window.SVGElement.prototype.getComputedTextLength = () => 100;
  const server = await createServer({
    configFile: false, appType: "custom", optimizeDeps: { noDiscovery: true },
    esbuild: { jsx: "automatic" }, server: { middlewareMode: true, ws: false, watch: null },
  });
  let root;
  try {
    const { MermaidDiagram } = await server.ssrLoadModule("/src/components/ArticleBodyFeatures.tsx");
    root = createRoot(document.getElementById("root"));
    for (const source of [
      String.raw`flowchart LR
A["$$E=mc^2$$"] -->|"$$\sqrt{x}$$"| B["$$\begin{bmatrix}1 & 2 \\\\ 3 & 4\end{bmatrix}$$"]`,
      'sequenceDiagram\nparticipant A as $$\\alpha$$\nA->>A: $$E=mc^2$$',
      'flowchart LR\nA["$$E=mc^2$$"] --> B["第一行<br/>第二行"]\nB --> C["`**粗体**\n*斜体*`"]',
    ]) {
      await act(async () => root.render(createElement(MermaidDiagram, { key: source, source })));
      const deadline = Date.now() + 15000;
      while (!document.querySelector(".mermaid-diagram--ready, .mermaid-diagram--error") && Date.now() < deadline) {
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
      }
      const diagram = document.querySelector(".mermaid-diagram--ready");
      assert.ok(diagram, document.getElementById("root").textContent);
      assert.ok(diagram.querySelector(".katex-html"), "formulas retain their typeset output");
      assert.equal(diagram.querySelector("math msup")?.textContent, "c2", "the exponent remains accessible MathML");
      assert.doesNotMatch(diagram.textContent, /\$\$/u, "formula delimiters are not visible labels");
      if (source.includes("第一行")) {
        const labels = [...diagram.querySelectorAll("foreignObject")];
        const multiline = labels.find((label) => label.textContent.includes("第一行"));
        assert.ok(multiline?.querySelector("p br"), "ordinary text retains its line break beside a formula");
        assert.equal(multiline.textContent, "第一行第二行");
        const markdown = labels.find((label) => label.textContent.includes("粗体"));
        assert.equal(markdown?.querySelector("p strong")?.textContent, "粗体", "Markdown retains bold emphasis");
        assert.equal(markdown?.querySelector("p em")?.textContent, "斜体", "Markdown retains italic emphasis");
        assert.ok(markdown.querySelector("br"), "Markdown retains its explicit line break");
      }
    }
  } finally {
    if (root) await act(async () => root.unmount());
    await server.close();
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("Mermaid SVG strips executable markup and disguised link protocols", async () => {
  const { JSDOM } = await import("jsdom");
  const { sanitizeMermaidSvg } = await import("../src/content/mermaidSvg.ts");
  const dom = new JSDOM("");
  const previous = globalThis.window;
  globalThis.window = dom.window;
  try {
    const svg = sanitizeMermaidSvg(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <script>alert(1)</script><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">
        <span ONCLICK="alert(1)">label</span><img src="x" ONERROR="alert(1)"/>
        <p ONCLICK="alert(1)"><strong ONMOUSEOVER="alert(1)">bold</strong><br ONCLICK="alert(1)"/><em ONCLICK="alert(1)">italic</em></p>
        <iframe src="javascript:alert(1)"></iframe><input autofocus=""/>
      </div></foreignObject>
      <rect ONLOAD="alert(1)"/><a href="java&#x9;script:alert(1)"><text>one</text></a>
      <a xlink:href="java&#xA;script:alert(1)"><text>two</text></a>
      <a href="data:text/html,test"><text>three</text></a>
      <a href="#node"><text>safe</text></a>
    </svg>`);
    const container = dom.window.document.createElement("div");
    container.innerHTML = svg;
    assert.equal(container.querySelector("script, iframe, img, input, [onclick], [onerror], [onmouseover]"), null);
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


test("nested article navigation targets body headings with optional automatic numbers", async () => {
  const { JSDOM } = await import("jsdom");
  const server = await createServer({
    configFile: false, appType: "custom", optimizeDeps: { noDiscovery: true },
    esbuild: { jsx: "automatic" }, server: { middlewareMode: true, ws: false, watch: null },
  });
  try {
    const { RichArticleContent } = await server.ssrLoadModule("/src/RichArticleContent.tsx");
    const { ArticleOutlinePopover } = await server.ssrLoadModule("/src/components/Header.tsx");
    for (const numbered of [undefined, false, true]) {
      const post = parsePost("outline.md", `---
title: "目录示例"
category: "笔记"
date: "2026-10-11"
${numbered === undefined ? "" : `outlineNumbering: ${numbered}\n`}---
引言。

## 第一章
### 子节
#### 细节
## 第二章
### 子节
`);
      const activeItem = post.outline.find((item) => item.number === "1.1" || item.title === "子节");
      const dom = new JSDOM(renderToStaticMarkup(createElement("div", null,
        createElement(ArticleOutlinePopover, { items: post.outline, open: true, activeId: activeItem.id, onSelect() {} }),
        createElement(RichArticleContent, { post }),
      )));
      try {
        const document = dom.window.document;
        const headings = [...document.querySelectorAll(".article-prose :is(h2,h3,h4)")];
        assert.deepEqual(headings.map((heading) => heading.id), post.outline.filter((item) => !item.prologue).map((item) => item.id), "every nested heading has its navigation target");
        assert.equal(new Set(headings.map((heading) => heading.id)).size, headings.length, "repeated titles retain unique targets");
        assert.equal(document.querySelector('nav[aria-label="文章章节导览"] ol ol ol button b').textContent, "细节", "the navigation exposes nested lists");
        assert.equal(document.querySelector('button[aria-current="location"] b').textContent, "子节");
        assert.match(document.querySelector(".article-outline header small").textContent, /01 \/ 02/u, "the counter tracks chapters rather than nested rows");
        assert.equal(document.querySelectorAll(".article-section-number").length, numbered ? 5 : 0);
        const navNumbers = [...document.querySelectorAll(".article-outline nav button>span")].map((node) => node.textContent);
        assert.deepEqual(navNumbers, numbered ? ["00", "01", "1.1", "1.1.1", "02", "2.1"] : []);
      } finally {
        dom.window.close();
      }
    }
  } finally {
    await server.close();
  }
});
