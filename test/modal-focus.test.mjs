import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { containModalFocus } from "../src/useModalFocus.ts";

test("modal focus stays inside and returns to the opener after close", () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalHTMLElement = globalThis.HTMLElement;
  const dom = new JSDOM(`<!doctype html><body><div id="app">
    <header><button id="opener">Open</button></header>
    <main><a id="background" href="/posts">Posts</a><div id="host">
      <section id="dialog" role="dialog" tabindex="-1"><button id="first">First</button><button id="last">Last</button></section>
    </div></main>
  </div></body>`);
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;

  try {
    const opener = document.getElementById("opener");
    const background = document.getElementById("background");
    const first = document.getElementById("first");
    const last = document.getElementById("last");
    const tracks = document.createElement("div");
    tracks.innerHTML = Array.from({ length: 1427 }, (_, index) => `<button>Track ${index + 1}</button>`).join("");
    first.after(tracks);
    const getStyle = window.getComputedStyle.bind(window);
    let styleReads = 0;
    window.getComputedStyle = (...args) => { styleReads += 1; return getStyle(...args); };
    opener.focus();
    const release = containModalFocus(document.getElementById("dialog"));
    assert.equal(document.activeElement, first);
    assert.ok(styleReads < 10, "opening a large queue must not inspect every track before focusing the close control");
    window.getComputedStyle = getStyle;
    tracks.remove();
    assert.equal(opener.parentElement.inert, true);
    assert.equal(background.inert, true);

    last.focus();
    const tabForward = new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(tabForward);
    assert.equal(tabForward.defaultPrevented, true);
    assert.equal(document.activeElement, first);
    const tabBackward = new window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(tabBackward);
    assert.equal(document.activeElement, last);
    background.focus();
    assert.equal(document.activeElement, first);

    release();
    assert.equal(opener.parentElement.inert, false);
    assert.equal(background.inert, false);
    assert.equal(document.activeElement, opener);
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.HTMLElement = originalHTMLElement;
    dom.window.close();
  }
});
