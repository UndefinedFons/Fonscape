import assert from "node:assert/strict";
import test from "node:test";
import { lockPageScroll } from "../src/lockPageScroll.js";

test("page scroll lock preserves position and releases only after the final owner", () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  let scrollY = 240;
  const listeners = new Map();
  const style = { scrollBehavior: "smooth" };

  globalThis.window = {
    get scrollY() { return scrollY; },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    scrollTo(options) { scrollY = options.top; },
  };
  globalThis.document = { documentElement: { style } };

  try {
    const releaseOuter = lockPageScroll();
    const releaseInner = lockPageScroll();
    assert.equal(style.scrollBehavior, "auto");
    assert.equal(listeners.has("scroll"), true);

    scrollY = 410;
    listeners.get("scroll")();
    assert.equal(scrollY, 240);

    releaseInner();
    assert.equal(style.scrollBehavior, "auto");
    assert.equal(listeners.has("scroll"), true);

    releaseOuter();
    assert.equal(style.scrollBehavior, "smooth");
    assert.equal(listeners.has("scroll"), false);

    releaseOuter();
    assert.equal(style.scrollBehavior, "smooth");
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  }
});
