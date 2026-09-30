import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { createServer } from "vite";

test("crop preview follows rotation and aspect changes without decoding again for crop-box movement", async () => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  const images = [];
  const rotations = [];
  class PreviewImage {
    naturalWidth = 800;
    naturalHeight = 600;
    constructor() { images.push(this); }
  }
  dom.window.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {}, save() {}, translate() {}, drawImage() {}, restore() {},
    rotate(value) { rotations.push(value); },
  });
  const globals = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, Image: PreviewImage, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const server = await createServer({ configFile: false, appType: "custom", optimizeDeps: { noDiscovery: true }, esbuild: { jsx: "automatic" }, server: { middlewareMode: true, ws: false, watch: null } });
  let root;
  try {
    const { AvatarCropper } = await server.ssrLoadModule("/src/community/AvatarCropper.tsx");
    let change;
    function CropPreview() {
      const [crop, setCrop] = useState({ url: "blob:local-crop", width: 800, height: 600, rotation: 0, stageAspect: 1, cropX: 0, cropY: 0, cropSize: 1 });
      change = setCrop;
      return createElement(AvatarCropper, { crop, onChange: setCrop, onApply() {}, onCancel() {}, busy: false });
    }
    root = createRoot(document.getElementById("root"));
    await act(async () => root.render(createElement(CropPreview)));
    const canvas = document.querySelector("canvas");
    images[0].onload();
    assert.equal(canvas.height, 640);
    await act(async () => change((crop) => ({ ...crop, cropX: 0.2, cropSize: 0.5 })));
    assert.equal(images.length, 1, "moving the crop box must not decode the source again");
    await act(async () => document.querySelector(".avatar-rotate-button").click());
    assert.equal(images[0].onload, null);
    images[1].onload();
    assert.equal(rotations.at(-1), Math.PI / 2);
    assert.equal(canvas.height, Math.round(640 / .75));
    await act(async () => change((crop) => ({ ...crop, stageAspect: 2 })));
    assert.equal(images[1].onload, null);
    images[2].onload();
    assert.equal(canvas.height, 320);
    await act(async () => root.unmount());
    root = null;
    assert.equal(images[2].onload, null, "unmount must release the pending image callback");
  } finally {
    if (root) await act(async () => root.unmount());
    await server.close();
    dom.window.close();
    for (const [key, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
