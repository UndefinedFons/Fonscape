import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { createServer } from "vite";

const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

const sameDependencies = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));

function createHookRunner() {
  const slots = [];
  const dispatcher = {
    useRef(initialValue) {
      const index = dispatcher.cursor++;
      if (!slots[index]) slots[index] = { kind: "ref", current: initialValue };
      return slots[index];
    },
    useState(initialValue) {
      const index = dispatcher.cursor++;
      if (!slots[index]) {
        const slot = { kind: "state", value: typeof initialValue === "function" ? initialValue() : initialValue };
        slot.set = (nextValue) => {
          slot.value = typeof nextValue === "function" ? nextValue(slot.value) : nextValue;
        };
        slots[index] = slot;
      }
      return [slots[index].value, slots[index].set];
    },
    useCallback(callback, dependencies) {
      const index = dispatcher.cursor++;
      const previous = slots[index];
      if (!previous || !sameDependencies(previous.dependencies, dependencies)) slots[index] = { kind: "callback", callback, dependencies };
      return slots[index].callback;
    },
    useEffect(effect, dependencies) {
      const index = dispatcher.cursor++;
      const previous = slots[index];
      const changed = !previous || !sameDependencies(previous.dependencies, dependencies);
      slots[index] = { kind: "effect", dependencies, cleanup: previous?.cleanup };
      dispatcher.pending.push({ changed, effect, previousCleanup: previous?.cleanup, slot: slots[index] });
    },
  };
  return {
    render(Component, props) {
      dispatcher.cursor = 0;
      dispatcher.pending = [];
      const previousDispatcher = internals.H;
      internals.H = dispatcher;
      try {
        return Component(props);
      } finally {
        internals.H = previousDispatcher;
      }
    },
    flushEffects() {
      for (const pending of dispatcher.pending) {
        if (!pending.changed) continue;
        pending.previousCleanup?.();
        const cleanup = pending.effect();
        pending.slot.cleanup = typeof cleanup === "function" ? cleanup : undefined;
      }
      dispatcher.pending = [];
    },
    unmount() {
      slots.filter((slot) => slot?.kind === "effect").forEach((slot) => slot.cleanup?.());
    },
  };
}

function findElement(root, predicate) {
  if (!root || typeof root !== "object") return null;
  if (predicate(root)) return root;
  const children = root.props?.children ?? root.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}

class FakeAudio {
  static instances = [];

  constructor(src) {
    this.src = src;
    this.readyState = 0;
    this.duration = Number.NaN;
    this.currentTime = 0;
    this.paused = true;
    this.ended = false;
    this.volume = 1;
    this.listeners = new Map();
    FakeAudio.instances.push(this);
  }

  load() {}

  play() {
    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }
}

function createLightboxEnvironment() {
  const listeners = new Map();
  const timers = new Map();
  const animationFrames = [];
  let nextTimer = 1;
  let clearTimeoutCalls = 0;
  const document = {
    body: { style: { overflow: "auto" }, nodeType: 1 },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  const window = {
    setTimeout(callback, delay) {
      const id = nextTimer++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      clearTimeoutCalls += 1;
      timers.delete(id);
    },
  };
  return {
    document,
    window,
    listeners,
    timers,
    animationFrames,
    get clearTimeoutCalls() { return clearTimeoutCalls; },
    requestAnimationFrame(callback) {
      animationFrames.push(callback);
      return animationFrames.length;
    },
    runTimer(id) {
      const timer = timers.get(id);
      timers.delete(id);
      timer?.callback();
    },
  };
}

async function loadMediaComponents() {
  const server = await createServer({
    configFile: false,
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
    esbuild: { jsx: "automatic" },
    server: { middlewareMode: true, ws: false, watch: null },
  });
  try {
    assert.equal(server.config.optimizeDeps.include?.length || 0, 0);
    const module = await server.ssrLoadModule("/src/ArticleMusicPlayer.jsx");
    const lightboxModule = await server.ssrLoadModule("/src/ZoomableImage.jsx");
    return { server, ArticleMusicPlayer: module.ArticleMusicPlayer, stopArticleAudio: module.stopArticleAudio, ZoomableImage: lightboxModule.ZoomableImage };
  } catch (error) {
    await server.close();
    throw error;
  }
}

test("music player volume and track object updates stay on the existing audio lifecycle", async () => {
  const previousAudio = globalThis.Audio;
  globalThis.Audio = FakeAudio;
  const { server, ArticleMusicPlayer, stopArticleAudio } = await loadMediaComponents();
  try {
    stopArticleAudio();
    FakeAudio.instances.length = 0;
    const runner = createHookRunner();
    const firstTrack = { src: "/audio/lifecycle-a.mp3", title: "A", artist: "Artist" };
    let tree = runner.render(ArticleMusicPlayer, { track: firstTrack, autoplay: false });
    runner.flushEffects();
    const firstAudio = FakeAudio.instances[0];
    assert.ok(firstAudio);
    firstAudio.currentTime = 37;
    firstAudio.paused = false;

    const volumeInput = findElement(tree, (element) => element.type === "input" && element.props?.["aria-label"] === "文章配乐音量");
    volumeInput.props.onInput({ target: { value: "0.35" } });
    tree = runner.render(ArticleMusicPlayer, { track: { ...firstTrack }, autoplay: false });
    runner.flushEffects();
    assert.equal(FakeAudio.instances.length, 1, "changing volume and replacing the track object must not reacquire audio");
    assert.equal(firstAudio.volume, 0.35);
    assert.equal(firstAudio.currentTime, 37, "volume changes must retain playback position");
    assert.equal(firstAudio.paused, false, "volume changes must retain playback state");

    tree = runner.render(ArticleMusicPlayer, { track: { ...firstTrack, title: "A revised title" }, autoplay: false });
    runner.flushEffects();
    assert.equal(FakeAudio.instances.length, 1, "a new track object with the same source must not restart audio");
    assert.equal(firstAudio.currentTime, 37);

    tree = runner.render(ArticleMusicPlayer, { track: { ...firstTrack, src: "/audio/lifecycle-b.mp3" }, autoplay: false });
    runner.flushEffects();
    assert.equal(FakeAudio.instances.length, 2, "a source change must acquire the new audio");
    assert.equal(FakeAudio.instances[1].volume, 0.35);
    assert.equal(firstAudio.paused, true);
    assert.equal(firstAudio.listeners.size, 0);
    runner.unmount();
    assert.equal(FakeAudio.instances[1].listeners.size, 0);
  } finally {
    stopArticleAudio();
    await server.close();
    if (previousAudio === undefined) delete globalThis.Audio;
    else globalThis.Audio = previousAudio;
  }
});

test("lightbox close survives closing rerenders and still cleans up on timer or unmount", async () => {
  const environment = createLightboxEnvironment();
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
  globalThis.window = environment.window;
  globalThis.document = environment.document;
  globalThis.requestAnimationFrame = environment.requestAnimationFrame;
  const { server, ZoomableImage } = await loadMediaComponents();
  try {
    const runner = createHookRunner();
    const props = { src: "/images/lifecycle.png", alt: "Lifecycle image" };
    let tree = runner.render(ZoomableImage, props);
    runner.flushEffects();
    const trigger = findElement(tree, (element) => element.type === "button" && element.props?.className?.includes("zoomable-image-trigger"));
    trigger.props.onClick();
    tree = runner.render(ZoomableImage, props);
    runner.flushEffects();
    assert.equal(environment.document.body.style.overflow, "hidden");
    const escape = environment.listeners.get("keydown");
    assert.ok(escape);
    escape({ key: "Escape" });
    escape({ key: "Escape" });
    tree = runner.render(ZoomableImage, props);
    runner.flushEffects();
    assert.equal(environment.clearTimeoutCalls, 0, "the closing rerender must not cancel the close timer");
    assert.equal(environment.timers.size, 1);
    const [closeTimerId] = environment.timers.keys();
    environment.runTimer(closeTimerId);
    tree = runner.render(ZoomableImage, props);
    runner.flushEffects();
    assert.equal(findElement(tree, (element) => element.type === "div" && element.props?.className?.includes("image-lightbox")), null);
    assert.equal(environment.document.body.style.overflow, "auto");
    assert.equal(environment.listeners.has("keydown"), false);

    trigger.props.onClick();
    tree = runner.render(ZoomableImage, props);
    runner.flushEffects();
    const closeButton = findElement(tree, (element) => element.type === "button" && element.props?.className === "image-lightbox-close");
    closeButton.props.onClick();
    runner.render(ZoomableImage, props);
    runner.flushEffects();
    assert.equal(environment.timers.size, 1);
    runner.unmount();
    assert.equal(environment.timers.size, 0, "unmount must cancel a pending close timer");
    assert.equal(environment.document.body.style.overflow, "auto");
    assert.equal(environment.listeners.has("keydown"), false);
  } finally {
    await server.close();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousRequestAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRequestAnimationFrame;
  }
});

test("outline updates do not close the panel while route changes still reset it", async () => {
  const source = await readFile("src/App.jsx", "utf8");
  assert.match(source, /setArticleOutlineOpen\(false\);\s*setActiveOutlineId\(""\);\s*\}, \[route\]\);/u);
  assert.match(source, /setActiveOutlineId\(\(current\) => current && activePostOutline\.some\(\(item\) => item\.id === current\)/u);
  assert.match(source, /\}, \[activePostOutline\]\);\s*useEffect\(\(\) => \{/u);
  assert.match(source, /\}, \[route, hasArticleOutline, activePostOutline\]\);/u);
});
